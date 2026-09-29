"use server";

// Server Actions of the withdrawal function (/otkaz-ot-dogovor). Step 1 verifies the order number + e-mail pair
// (or ownership by the signed-in customer) and returns what the customer needs to choose the lines — no prices, and
// only a shortened name unless the signed-in owner asks; step 3 re-verifies everything, stores the statement and
// sends the acknowledgement to the order's e-mail. Every failure of the look-up gives one generic error.
// Limits: per visitor, per e-mail address, per order number and shop-wide (store.db), so guessing order numbers
// for a known address stays impossible whichever IP addresses are used. The language comes from a hidden field
// (next/root-params does not work in actions).
import type { ConfirmState, LookupState, WithdrawalOrderView } from "@/components/info/withdrawal/types";
import { getDict } from "@/i18n";
import { isLang, type Lang } from "@/i18n/config";
import { clientIp } from "@/lib/client-ip";
import { EMAIL_RE, getCustomer } from "@/lib/customer-auth";
import { returnAddress, sendWithdrawalEmails } from "@/lib/emails/withdrawal";
import { formatDate, formatPrice } from "@/lib/format";
import type { Order } from "@/lib/orders";
import { HOUR, rateLimited, subjectLimited } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { companyInfo } from "@/lib/settings-types";
import {
  createWithdrawal,
  findOrderForWithdrawal,
  listWithdrawalsForOrder,
  parseOrderNumber,
  sofiaDateTime,
  withdrawalExpired,
  withdrawalRefund,
} from "@/lib/withdrawals";

const WINDOW = 10 * 60_000;
// Look-ups (and confirmations) per e-mail address and per order number per hour, and for the whole shop.
const PER_SUBJECT = 10;
const LOOKUP_GLOBAL = 500;
const CONFIRM_GLOBAL = 200;

function field(fd: FormData, name: string, max = 300): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, max) : "";
}

function langOf(fd: FormData): Lang {
  const v = field(fd, "lang", 5);
  return isLang(v) ? v : "bg";
}

/**
 * Counts the attempt against the per-address, per-order and shop-wide limits; true when one of them is used up.
 * The signed-in owner of the order is only limited per visitor.
 */
function subjectsLimited(step: "lookup" | "confirm", number: number, email: string, owner: boolean): boolean {
  if (owner) return false;
  const bucket = `withdraw-${step}`;
  const byEmail = subjectLimited(bucket, email, PER_SUBJECT, HOUR);
  const byOrder = subjectLimited(bucket, `order:${number}`, PER_SUBJECT, HOUR);
  const global = subjectLimited(bucket, "*", step === "lookup" ? LOOKUP_GLOBAL : CONFIRM_GLOBAL, HOUR);
  return byEmail || byOrder || global;
}

type Verified = { ok: true; order: Order; owner: boolean };
type VerifyError = { ok: false; error: "invalid" | "notFound" | "expired" | "cancelled" | "rateLimited" };

/** Verified order for the submitted number + e-mail, or the reason it can't be used. */
async function verify(fd: FormData, step: "lookup" | "confirm"): Promise<Verified | VerifyError> {
  const number = parseOrderNumber(field(fd, "order", 40));
  const email = field(fd, "email", 200).trim().toLowerCase();
  if (!number || !EMAIL_RE.test(email)) return { ok: false, error: "invalid" };
  const customer = await getCustomer();
  const order = findOrderForWithdrawal(number, email, customer?.id ?? null);
  const owner = !!order && !!customer && order.customerId === customer.id;
  // Counted whether or not the order was found, so a wrong guess costs the same as a right one.
  if (subjectsLimited(step, number, email, owner)) return { ok: false, error: "rateLimited" };
  if (!order) return { ok: false, error: "notFound" };
  if (order.status === "cancelled") return { ok: false, error: "cancelled" };
  if (withdrawalExpired(order, getSettings().returnDays)) return { ok: false, error: "expired" };
  return { ok: true, order, owner };
}

/** "Иван П." — enough for the customer to recognise the order, too little to learn someone else's name. */
function shortName(first: string, last: string): string {
  const l = last.trim();
  return [first.trim(), l ? `${Array.from(l)[0]}.` : ""].filter(Boolean).join(" ");
}

/** What step 2 shows: the order's lines without prices; the full name only to the signed-in owner. */
function orderView(order: Order, lang: Lang, owner: boolean): WithdrawalOrderView {
  const s = getSettings();
  const c = companyInfo(s, lang);
  const { firstName, lastName } = order.customer;
  return {
    number: order.number,
    date: formatDate(order.createdAt, lang),
    name: owner ? `${firstName} ${lastName}`.trim() : shortName(firstName, lastName),
    ackEmail: order.email,
    trader: `${c.legalName}, ${c.registeredAddress}, ${s.email}`,
    lines: order.items.map((l, i) => ({
      line: i,
      kind: l.kind === "gift" ? "gift" : "item",
      name: l.name,
      variant: l.variant,
      qty: l.qty,
    })),
    previous: listWithdrawalsForOrder(order.id).map((w) => {
      const { date, time } = sofiaDateTime(w.createdAt, lang);
      return `${date}, ${time}`;
    }),
  };
}

/** Step 1: find the order by number + e-mail. */
export async function lookupWithdrawalOrder(_prev: LookupState | null, fd: FormData): Promise<LookupState> {
  const lang = langOf(fd);
  if (!parseOrderNumber(field(fd, "order", 40)) || !EMAIL_RE.test(field(fd, "email", 200).trim())) return { ok: false, error: "invalid" };
  if (await rateLimited("withdraw-lookup", 10, WINDOW)) return { ok: false, error: "rateLimited" };
  const v = await verify(fd, "lookup");
  if (!v.ok) return v;
  return { ok: true, order: orderView(v.order, lang, v.owner) };
}

/** Step 3: "Потвърждавам отказа" — store the statement and send the acknowledgement. */
export async function confirmWithdrawal(_prev: ConfirmState | null, fd: FormData): Promise<ConfirmState> {
  const lang = langOf(fd);
  if (await rateLimited("withdraw-confirm", 8, WINDOW)) return { ok: false, error: "rateLimited" };
  const v = await verify(fd, "confirm");
  if (!v.ok) return v;
  const order = v.order;

  // "all", or "sel" entries "line:qty" for the chosen lines.
  let lines: "all" | { line: number; qty: number }[] = "all";
  if (field(fd, "mode", 5) !== "all") {
    lines = [];
    for (const raw of fd.getAll("sel").slice(0, 200)) {
      const m = typeof raw === "string" ? raw.match(/^(\d{1,4}):(\d{1,4})$/) : null;
      if (m) lines.push({ line: Number(m[1]), qty: Number(m[2]) });
    }
  }

  let result: ReturnType<typeof createWithdrawal>;
  try {
    result = createWithdrawal({ order, lines, reason: field(fd, "reason", 2000), locale: lang, ip: await clientIp() });
  } catch (e) {
    console.error("[withdrawal] could not be stored:", (e as Error).message);
    return { ok: false, error: "failed" };
  }
  if (!result.ok) return { ok: false, error: result.code === "no_items" ? "noItems" : "invalid" };

  const w = result.withdrawal;
  // A repeated submit of the same statement (double click, retry) does not send the e-mails again.
  const mailed = result.duplicate ? true : (await sendWithdrawalEmails(w, order)).customer;
  const { date, time } = sofiaDateTime(w.createdAt, lang);
  const giftTag = getDict(lang).info.withdraw.select.gift.toLowerCase();
  return {
    ok: true,
    receipt: {
      id: w.id,
      orderNumber: order.number,
      date,
      time,
      email: w.email,
      mailed,
      returnAddress: returnAddress(lang),
      refund: formatPrice(withdrawalRefund(w, order), lang),
      cod: order.payment === "cod",
      giftNote: !w.wholeOrder && order.items.some((l) => l.kind === "gift"),
      wholeOrder: w.wholeOrder,
      lines: w.items.map((l) => `${l.qty} × ${l.name}${l.variant ? ` (${l.variant})` : ""}${l.kind === "gift" ? ` — ${giftTag}` : ""}`),
      reason: w.reason,
    },
  };
}
