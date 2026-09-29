"use server";

import { createHash } from "node:crypto";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { DEFAULT_LANG, isLang, type Lang } from "@/i18n/config";
import type { CartSnapshot } from "@/lib/catalog-types";
import { getSnapshots } from "@/lib/catalog";
import { DELIVERY_METHODS, cartSignature, isDeliveryKey, isPaymentKey, issueText, type OrderLine } from "@/lib/checkout";
import { EMAIL_RE, customerPasswordProblem, getCustomer, registerCustomer } from "@/lib/customer-auth";
import { listCustomerAddresses, saveCustomerAddress } from "@/lib/customer-addresses";
import { sendOrderEmails } from "@/lib/emails/order";
import { toCents } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { rememberOrder } from "@/lib/order-access";
import { createOrder, getOrder, getOrderByToken } from "@/lib/orders";
import { normalizeGifts, normalizeItems, priceCart } from "@/lib/pricing";
import { rateLimited } from "@/lib/rate-limit";
import { resolveDelivery } from "@/lib/shipping";

// placeOrder: the checkout form's Server Action (SPEC §5.8, §11; design web-commerce.md §3, D0, D1, D3).
// The browser sends ids, quantities, the chosen gifts, the delivery / payment choice, the total it showed
// (expectedTotal) and an idempotency key (checkoutToken) — never prices. Everything is re-priced by priceCart();
// any change (price, stock, gift) returns `changed` with localized messages and fresh product data instead of an
// order. `lang` comes from a hidden field (next/root-params is not available in Server Actions).
//
// Idempotency (R2-M7): the order stores the browser's key together with a hash of the cart it was placed for, so a
// repeated submit of the SAME cart returns the stored order, while the same key with a different cart (the browser
// never reached the order page, then changed the cart) places a new order instead of redirecting to the old one.

export type CheckoutField =
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "delivery"
  | "office"
  | "city"
  | "address"
  | "payment"
  | "terms"
  | "adult"
  | "accountAdult"
  | "password";

export type CheckoutState = {
  error?: string;
  fieldErrors?: Partial<Record<CheckoutField, string>>;
  /** Prices, stock or gifts changed since the summary was shown: nothing was ordered. */
  changed?: boolean;
  /** What changed, as sentences for the shopper. */
  issues?: string[];
  /** Fresh product data for the cart in the browser. */
  cart?: CartSnapshot[];
  /** A chosen gift is no longer valid: the browser reloads the gift tiers. */
  giftsChanged?: boolean;
};

const PHONE_RE = /^[+\d][\d\s()-]{6,20}$/;
const TOKEN_RE = /^[\w-]{16,64}$/;

function text(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? "")
    .trim()
    .slice(0, max);
}

/** Short hash of what is ordered (paid ids × qty, chosen gifts; lib/checkout cartSignature): part of the idempotency key. */
function cartHash(items: { id: number; qty: number }[], gifts: { tierId: string; id: number }[]): string {
  return createHash("sha256").update(cartSignature(items, gifts)).digest("base64url").slice(0, 16);
}

function jsonArray(fd: FormData, key: string): Record<string, unknown>[] {
  try {
    const v: unknown = JSON.parse(String(fd.get(key) ?? "[]"));
    return Array.isArray(v) ? v.slice(0, 200).filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : [];
  } catch {
    return [];
  }
}

export async function placeOrder(_prev: CheckoutState | null, fd: FormData): Promise<CheckoutState> {
  const raw = fd.get("lang");
  const lang: Lang = isLang(raw) ? raw : DEFAULT_LANG;
  const t = getDict(lang).checkout;
  const orderPath = (id: string) => localizeHref(`/porachka/${id}?nova=1`, lang);

  // Every submit may call the couriers' APIs: a loose limit here, the strict one (5 orders / 10 min) before storing.
  if (await rateLimited("order-submit", 30, 10 * 60_000)) return { error: t.errors.rateLimited };

  const f = {
    firstName: text(fd, "firstName", 80),
    lastName: text(fd, "lastName", 80),
    phone: text(fd, "phone", 30),
    email: text(fd, "email", 200).toLowerCase(),
    method: text(fd, "delivery", 30),
    officeId: text(fd, "officeId", 20),
    cityId: text(fd, "cityId", 20),
    // A town typed by hand (only when the courier's town search is down).
    cityName: text(fd, "cityName", 60),
    postCode: text(fd, "postCode", 10),
    address: text(fd, "address", 300),
    payment: text(fd, "payment", 20),
    note: text(fd, "note", 1000),
    terms: fd.get("terms") === "on",
    adult: fd.get("adult") === "on",
    accountAdult: fd.get("accountAdult") === "on",
    createAccount: fd.get("createAccount") === "on",
    password: String(fd.get("password") ?? "").slice(0, 200),
    saveAddress: fd.get("saveAddress") === "on",
    token: text(fd, "checkoutToken", 64),
    expectedTotal: Number(text(fd, "expectedTotal", 20)),
  };
  const items = normalizeItems(jsonArray(fd, "items").map((i) => ({ id: Number(i.id), qty: Number(i.qty) })));
  const gifts = normalizeGifts(jsonArray(fd, "gifts").map((g) => ({ tierId: String(g.tierId ?? ""), id: Number(g.id) })));
  const token = TOKEN_RE.test(f.token) ? `${f.token}.${cartHash(items, gifts)}` : null;

  // A repeated submit (double click, network retry) of an order that was already stored for this very cart.
  if (token) {
    const done = getOrderByToken(token);
    if (done) {
      if (done.email === f.email) await rememberOrder(done.id);
      redirect(orderPath(done.id));
    }
  }

  const customer = await getCustomer();
  const errors: Partial<Record<CheckoutField, string>> = {};
  if (!f.firstName || /[<>]/.test(f.firstName)) errors.firstName = t.errors.firstName;
  if (!f.lastName || /[<>]/.test(f.lastName)) errors.lastName = t.errors.lastName;
  if (!PHONE_RE.test(f.phone)) errors.phone = t.errors.phone;
  if (!EMAIL_RE.test(f.email)) errors.email = t.errors.email;
  if (!isPaymentKey(f.payment)) errors.payment = t.errors.payment;
  if (!f.terms) errors.terms = t.errors.terms;
  const wantsAccount = f.createAccount && !customer;
  if (wantsAccount && customerPasswordProblem(f.password)) errors.password = t.errors.password;
  // Like the registration form: an account only for someone who confirms being 18+ (the order's own 18+ box counts too).
  if (wantsAccount && !f.accountAdult && !f.adult) errors.accountAdult = t.errors.accountAdult;

  if (!items.length) return { error: t.errors.empty, changed: true, cart: [] };

  // The office / town must exist in the courier's own data (a typed town is accepted only as the outage fallback).
  const resolved = await resolveDelivery({
    method: f.method,
    officeId: f.officeId,
    cityId: f.cityId,
    cityName: f.cityName,
    postCode: f.postCode,
    address: f.address,
  });
  if ("error" in resolved) errors[resolved.field] = t.errors[resolved.error];
  if (Object.keys(errors).length || "error" in resolved || !isPaymentKey(f.payment) || !isDeliveryKey(f.method)) {
    return { error: t.errors.check, fieldErrors: errors };
  }
  const payment = f.payment;
  const method = f.method;

  // Authoritative prices (lines stored in Bulgarian for the admin; English names are added below).
  // A typed town is charged the fixed price the checkout showed, even when it matched the courier's list meanwhile.
  const priced = await priceCart({
    items,
    gifts,
    delivery: { method, officeId: resolved.delivery.officeId, cityId: resolved.delivery.typedCity ? undefined : resolved.delivery.cityId },
    payment,
    lang: "bg",
  });

  const ids = [...new Set([...items.map((i) => i.id), ...gifts.map((g) => g.id)])];
  const names = new Map(getSnapshots(lang, ids, { includeHidden: true }).map((p) => [p.id, p.name]));
  const freshCart = () => getSnapshots(lang, items.map((i) => i.id));

  if (!priced.lines.length) return { error: t.errors.empty, changed: true, cart: freshCart() };
  if (priced.issues.length) {
    return {
      error: t.pricesChanged,
      changed: true,
      issues: [...new Set(priced.issues.map((i) => issueText(i, lang, { name: (id) => names.get(id) })))],
      cart: freshCart(),
      giftsChanged: priced.issues.some((i) => i.code.startsWith("gift_")),
    };
  }
  if (priced.snapshots.some((p) => p.adultOnly) && !f.adult) return { error: t.errors.check, fieldErrors: { adult: t.errors.adult } };
  if (!Number.isFinite(f.expectedTotal) || toCents(f.expectedTotal) !== toCents(priced.total)) {
    return { error: t.pricesChanged, changed: true, cart: freshCart() };
  }

  if (await rateLimited("order", 5, 10 * 60_000)) return { error: t.errors.rateLimited };

  // "Create an account with these details" (guests only). An e-mail that already has an account is never
  // attached to this order by typing it: the customer has to sign in.
  let customerId = customer?.id ?? null;
  let newAccount = false;
  if (wantsAccount) {
    const r = await registerCustomer({
      email: f.email,
      password: f.password,
      firstName: f.firstName,
      lastName: f.lastName,
      phone: f.phone,
      locale: lang,
      marketing: false,
    });
    if (!r.ok) {
      if (r.code === "email_taken") return { error: t.errors.check, fieldErrors: { email: t.errors.emailTaken } };
      if (r.code === "weak_password") return { error: t.errors.check, fieldErrors: { password: t.errors.password } };
      return { error: r.code === "rate_limited" ? t.errors.rateLimited : t.errors.accountFailed };
    }
    customerId = r.customer.id;
    newAccount = true;
  }

  // English names for English customers (e-mail, confirmation, account history); `name` stays Bulgarian.
  const en = new Map(getSnapshots("en", ids, { includeHidden: true }).map((p) => [p.id, p]));
  const withEnglish = (l: OrderLine): OrderLine => {
    const p = en.get(l.id);
    if (!p) return l;
    return { ...l, ...(p.name !== l.name ? { nameEn: p.name } : {}), ...(p.variant !== l.variant ? { variantEn: p.variant } : {}) };
  };

  let order: { id: string; number: number; existing: boolean };
  try {
    order = createOrder({
      customer: { firstName: f.firstName, lastName: f.lastName, phone: f.phone, email: f.email },
      delivery: resolved.delivery,
      payment,
      items: [...priced.lines, ...priced.giftLines].map(withEnglish),
      subtotal: priced.subtotal,
      shipping: priced.shipping?.price ?? 0,
      total: priced.total,
      note: f.note || null,
      customerId,
      locale: lang,
      checkoutToken: token,
    });
  } catch (e) {
    console.error("[order] could not store the order:", (e as Error).message);
    return { error: t.errors.server };
  }

  if (!order.existing) {
    if (customerId && (newAccount || f.saveAddress)) {
      try {
        const kind = DELIVERY_METHODS[method].kind;
        const office = kind === "office" ? (resolved.office ?? null) : null;
        const city = kind === "address" ? (resolved.city ?? null) : null;
        const address = kind === "address" ? resolved.delivery.address : "";
        const same = listCustomerAddresses(customerId).find(
          (a) =>
            a.method === method &&
            (office ? a.office?.id === office.id : !!city && a.city?.id === city.id && a.address.trim().toLowerCase() === address.toLowerCase()),
        );
        saveCustomerAddress(customerId, { label: same?.label ?? "", method, office, city, address, phone: same?.phone ?? "", isDefault: true }, same?.id);
      } catch (e) {
        console.error("[order] could not save the address:", (e as Error).message);
      }
    }
    const id = order.id;
    after(async () => {
      const stored = getOrder(id);
      if (stored) await sendOrderEmails(stored);
    });
  }

  await rememberOrder(order.id);
  redirect(orderPath(order.id));
}
