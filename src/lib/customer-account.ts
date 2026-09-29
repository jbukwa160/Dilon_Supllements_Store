import "server-only";
import { createHash } from "node:crypto";
import { isLang, type Lang } from "@/i18n/config";
import { parseJson, storeDb } from "./db";
import { verifyPassword } from "./password";
import { EMAIL_RE, getCustomerById } from "./customer-auth";
import { getOrder, type Order } from "./orders";
import { listCustomerAddresses } from "./customer-addresses";
import { sendNewsletterConfirmation } from "./emails/newsletter";
import { accountKey } from "./login-guard";
import { requestSubscription, subscriptionState } from "./newsletter";

/** Newsletter sign-ups from the account are double opt-in too: a pending row + the confirmation e-mail. */
function subscribeWithConfirmation(email: string, locale: Lang): void {
  const r = requestSubscription(email, locale);
  // sendMail never throws; the e-mail goes out after the action has answered.
  if (r.status === "pending") void sendNewsletterConfirmation(email, locale, r.token);
}

// The customer's own account data (/profil/danni): profile, sign-in e-mail, marketing consent, sessions,
// GDPR export and self-service deletion, plus the read-only checks the password-reset pages need.
// Sign-in, sessions, registration and password changes themselves live in lib/customer-auth.ts.
// Owner: E. Every function takes the customer id from requireCustomer(), never from the browser.

export const NAME_MAX = 80;
const EMAIL_MAX = 200;
const PASSWORD_MAX = 200;
/** Same rule as registerCustomer() in lib/customer-auth.ts. */
export const PHONE_RE = /^[+\d][\d\s()-]{5,20}$/;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const normEmail = (email: string) => email.trim().toLowerCase().slice(0, EMAIL_MAX);

export type FieldCode = "required" | "name_invalid" | "phone_invalid" | "email_invalid";

/** Trimmed first / last name, or the error code. */
export function checkName(v: unknown): { value: string } | { error: FieldCode } {
  const s = String(v ?? "").trim();
  if (!s) return { error: "required" };
  if (s.length > NAME_MAX || /[<>]/.test(s)) return { error: "name_invalid" };
  return { value: s };
}

/** Optional phone ("" allowed) or the error code. */
export function checkPhone(v: unknown, required = false): { value: string } | { error: FieldCode } {
  const s = String(v ?? "").trim();
  if (!s) return required ? { error: "required" } : { value: "" };
  return PHONE_RE.test(s) ? { value: s } : { error: "phone_invalid" };
}

export function checkEmail(v: unknown): { value: string } | { error: FieldCode } {
  const s = normEmail(String(v ?? ""));
  if (!s) return { error: "required" };
  return EMAIL_RE.test(s) ? { value: s } : { error: "email_invalid" };
}

/** Names and phone from /profil/danni (already validated with checkName / checkPhone). */
export function updateCustomerProfile(id: number, data: { firstName: string; lastName: string; phone: string }): void {
  storeDb()
    .prepare("UPDATE customers SET first_name = ?, last_name = ?, phone = ? WHERE id = ?")
    .run(data.firstName.slice(0, NAME_MAX), data.lastName.slice(0, NAME_MAX), data.phone.slice(0, 30), id);
}

/** Checks the customer's current password (for e-mail change and account deletion). */
export function verifyCustomerPassword(id: number, password: string): boolean {
  const row = storeDb().prepare("SELECT password_hash FROM customers WHERE id = ?").get(id) as { password_hash: string } | undefined;
  return !!row && verifyPassword(String(password ?? "").slice(0, PASSWORD_MAX), row.password_hash);
}

/**
 * Changes the sign-in e-mail (the current password is required). The address is no longer "verified", open
 * password-reset links stop working, and a newsletter subscription moves to the new address — pending until the new
 * address confirms it (a confirmation e-mail is sent).
 */
export function changeCustomerEmail(
  id: number,
  password: string,
  newEmail: string,
): { ok: true; oldEmail: string; email: string } | { ok: false; code: "wrong_password" | "email_invalid" | "email_taken" | "same_email" } {
  const email = normEmail(newEmail);
  if (!EMAIL_RE.test(email)) return { ok: false, code: "email_invalid" };
  const db = storeDb();
  const row = db.prepare("SELECT email, password_hash FROM customers WHERE id = ?").get(id) as { email: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(String(password ?? "").slice(0, PASSWORD_MAX), row.password_hash)) return { ok: false, code: "wrong_password" };
  if (row.email.toLowerCase() === email) return { ok: false, code: "same_email" };
  if (db.prepare("SELECT 1 FROM customers WHERE email = ? AND id <> ?").get(email, id)) return { ok: false, code: "email_taken" };
  let moveSubscription: Lang | null = null;
  try {
    db.transaction(() => {
      db.prepare("UPDATE customers SET email = ?, email_verified_at = NULL WHERE id = ?").run(email, id);
      db.prepare("DELETE FROM customer_tokens WHERE customer_id = ?").run(id);
      const sub = db.prepare("SELECT locale FROM newsletter WHERE email = ?").get(row.email) as { locale: string } | undefined;
      if (sub) {
        db.prepare("DELETE FROM newsletter WHERE email = ?").run(row.email);
        moveSubscription = isLang(sub.locale) ? sub.locale : "bg";
      }
    })();
  } catch {
    // The UNIQUE index caught a sign-up with the same address in the meantime.
    return { ok: false, code: "email_taken" };
  }
  if (moveSubscription) subscribeWithConfirmation(email, moveSubscription);
  return { ok: true, oldEmail: row.email, email };
}

/**
 * Marketing e-mails opt-in / opt-out (never pre-ticked). The consent time is kept on the customer; the address
 * is also added to / removed from the newsletter list, so one "unsubscribe" means unsubscribed everywhere. Opting in
 * adds a PENDING newsletter row and e-mails the confirmation link (double opt-in): only confirmed addresses are
 * subscribers (lib/newsletter.ts).
 */
export function setCustomerMarketing(id: number, on: boolean, locale: Lang): void {
  const db = storeDb();
  const c = getCustomerById(id);
  if (!c) return;
  const now = new Date().toISOString();
  if (on) {
    db.prepare("UPDATE customers SET marketing_consent_at = COALESCE(marketing_consent_at, ?) WHERE id = ?").run(now, id);
    subscribeWithConfirmation(c.email, locale);
  } else {
    db.transaction(() => {
      db.prepare("UPDATE customers SET marketing_consent_at = NULL WHERE id = ?").run(id);
      db.prepare("DELETE FROM newsletter WHERE email = ?").run(c.email);
    })();
  }
}

/** When the customer gave the marketing consent (ISO), or null. */
export function marketingConsentAt(id: number): string | null {
  const row = storeDb().prepare("SELECT marketing_consent_at FROM customers WHERE id = ?").get(id) as { marketing_consent_at: string | null } | undefined;
  return row?.marketing_consent_at ?? null;
}

/** Signed-in browsers / devices of this customer that haven't expired. */
export function countActiveSessions(id: number): number {
  return (
    storeDb().prepare("SELECT COUNT(*) AS n FROM customer_sessions WHERE customer_id = ? AND expires_at > ?").get(id, new Date().toISOString()) as {
      n: number;
    }
  ).n;
}

/** "Изход от всички устройства": every session of the customer, this browser included (the caller clears the cookie). */
export function endAllCustomerSessions(id: number): void {
  storeDb().prepare("DELETE FROM customer_sessions WHERE customer_id = ?").run(id);
}

/**
 * Deletes the account (GDPR art. 17): the customer row, sessions, addresses, one-time tokens, the newsletter
 * subscription, sign-in counters and the chat conversations held while signed in (with their messages). Orders stay
 * for the legal retention periods (their snapshot keeps name / phone / e-mail as used for that order) but are no
 * longer linked to an account.
 * Returns the deleted customer's e-mail and first name (for the goodbye e-mail), or null if there was none.
 */
export function deleteCustomerAccount(id: number): { email: string; firstName: string; locale: Lang } | null {
  const c = getCustomerById(id);
  if (!c) return null;
  const db = storeDb();
  db.transaction(() => {
    db.prepare("UPDATE orders SET customer_id = NULL WHERE customer_id = ?").run(id);
    db.prepare("DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE customer_id = ?)").run(id);
    db.prepare("DELETE FROM chat_conversations WHERE customer_id = ?").run(id);
    db.prepare("DELETE FROM customer_sessions WHERE customer_id = ?").run(id);
    db.prepare("DELETE FROM customer_addresses WHERE customer_id = ?").run(id);
    db.prepare("DELETE FROM customer_tokens WHERE customer_id = ?").run(id);
    db.prepare("DELETE FROM newsletter WHERE email = ?").run(c.email);
    db.prepare("DELETE FROM login_attempts WHERE key = ?").run(accountKey("customer", c.email.toLowerCase()));
    db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  })();
  return { email: c.email, firstName: c.firstName, locale: c.locale };
}

/** State of a password-reset link before the form is shown (read-only: the token is used by resetPasswordWithToken). */
export function resetTokenStatus(token: string): "ok" | "invalid" | "expired" {
  const t = String(token ?? "");
  if (t.length < 20 || t.length > 100) return "invalid";
  const row = storeDb()
    .prepare(
      `SELECT t.expires_at, t.used_at, c.blocked FROM customer_tokens t JOIN customers c ON c.id = t.customer_id
       WHERE t.token_hash = ? AND t.purpose = 'reset'`,
    )
    .get(sha256(t)) as { expires_at: string; used_at: string | null; blocked: number } | undefined;
  if (!row || row.used_at || row.blocked) return "invalid";
  return Date.parse(row.expires_at) <= Date.now() ? "expired" : "ok";
}

/**
 * True if a reset link for this e-mail was created in the last `withinMs` (links live 1 hour, so a link that
 * expires more than 1 h − withinMs from now is that recent). Stops someone from flooding a mailbox with reset
 * e-mails from many IP addresses; the page still shows the same message.
 */
export function resetRecentlyRequested(email: string, withinMs = 2 * 60 * 1000): boolean {
  const row = storeDb()
    .prepare(
      `SELECT MAX(t.expires_at) AS last FROM customer_tokens t JOIN customers c ON c.id = t.customer_id
       WHERE c.email = ? AND t.purpose = 'reset' AND t.used_at IS NULL`,
    )
    .get(normEmail(email)) as { last: string | null } | undefined;
  if (!row?.last) return false;
  return Date.parse(row.last) > Date.now() + 60 * 60 * 1000 - withinMs;
}

/** Number of orders and the sum of their totals (cancelled / returned orders not counted). */
export function customerOrderStats(id: number): { orders: number; spent: number } {
  const row = storeDb()
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS s FROM orders WHERE customer_id = ? AND status NOT IN ('cancelled', 'returned')")
    .get(id) as { n: number; s: number };
  return { orders: row.n, spent: Math.round(row.s * 100) / 100 };
}

/** One of the customer's orders by its number (as shown in the account) or its id; null if it isn't theirs. */
export function getCustomerOrder(customerId: number, ref: string): Order | null {
  const r = String(ref ?? "").slice(0, 64);
  let id: string | undefined;
  if (/^\d{1,12}$/.test(r)) {
    id = (storeDb().prepare("SELECT id FROM orders WHERE number = ? AND customer_id = ?").get(Number(r), customerId) as { id: string } | undefined)?.id;
  } else if (/^[\w-]+$/.test(r)) {
    id = r;
  }
  const order = id ? getOrder(id) : null;
  return order && order.customerId === customerId ? order : null;
}

type CustomerExportRow = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  locale: string;
  marketing_consent_at: string | null;
  email_verified_at: string | null;
  created_at: string;
  last_login_at: string | null;
};

/**
 * Everything the shop keeps about the customer (GDPR art. 15 / 20), as plain JSON: profile, consents, addresses,
 * orders (without internal admin notes), withdrawal statements, signed-in devices, chat conversations.
 */
export function exportCustomerData(id: number, storeName: string): Record<string, unknown> | null {
  const db = storeDb();
  const c = db
    .prepare(
      "SELECT email, first_name, last_name, phone, locale, marketing_consent_at, email_verified_at, created_at, last_login_at FROM customers WHERE id = ?",
    )
    .get(id) as CustomerExportRow | undefined;
  if (!c) return null;

  const orderIds = (db.prepare("SELECT id FROM orders WHERE customer_id = ? ORDER BY number DESC").all(id) as { id: string }[]).map((r) => r.id);
  const orders = orderIds.flatMap((oid) => {
    const o = getOrder(oid);
    if (!o) return [];
    return [
      {
        number: o.number,
        createdAt: o.createdAt,
        status: o.status,
        customer: o.customer,
        delivery: o.delivery,
        payment: o.payment,
        items: o.items,
        subtotal: o.subtotal,
        shipping: o.shipping,
        total: o.total,
        note: o.note,
        locale: o.locale,
      },
    ];
  });

  const withdrawals = orderIds.length
    ? (
        db
          .prepare(
            `SELECT order_number, email, items, reason, locale, created_at FROM withdrawals WHERE order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY id`,
          )
          .all(...orderIds) as { order_number: number | null; email: string; items: string; reason: string | null; locale: string; created_at: string }[]
      ).map((w) => ({
        orderNumber: w.order_number,
        email: w.email,
        items: parseJson<unknown>(w.items) ?? [],
        reason: w.reason,
        locale: w.locale,
        createdAt: w.created_at,
      }))
    : [];

  const sessions = (
    db
      .prepare(
        "SELECT created_at, last_seen_at, expires_at, ip, user_agent, persistent FROM customer_sessions WHERE customer_id = ? ORDER BY last_seen_at DESC",
      )
      .all(id) as { created_at: string; last_seen_at: string; expires_at: string; ip: string | null; user_agent: string | null; persistent: number }[]
  ).map((s) => ({
    createdAt: s.created_at,
    lastSeenAt: s.last_seen_at,
    expiresAt: s.expires_at,
    ip: s.ip,
    userAgent: s.user_agent,
    rememberMe: !!s.persistent,
  }));

  const newsletter = subscriptionState(c.email);

  const conversations = (
    db.prepare("SELECT id, name, contact, created_at, locale FROM chat_conversations WHERE customer_id = ? ORDER BY id").all(id) as {
      id: number;
      name: string | null;
      contact: string | null;
      created_at: string;
      locale: string;
    }[]
  ).map((conv) => ({
    startedAt: conv.created_at,
    name: conv.name,
    contact: conv.contact,
    locale: conv.locale,
    messages: (
      db.prepare("SELECT sender, body, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id").all(conv.id) as {
        sender: string;
        body: string;
        created_at: string;
      }[]
    ).map((m) => ({ from: m.sender === "admin" ? "shop" : "you", text: m.body, at: m.created_at })),
  }));

  return {
    exportedAt: new Date().toISOString(),
    store: storeName,
    account: {
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      phone: c.phone,
      language: isLang(c.locale) ? c.locale : "bg",
      createdAt: c.created_at,
      lastLoginAt: c.last_login_at,
      emailVerifiedAt: c.email_verified_at,
    },
    consents: {
      marketingEmails: c.marketing_consent_at ? { given: true, at: c.marketing_consent_at } : { given: false },
      newsletterList:
        newsletter.state === "none"
          ? { subscribed: false }
          : { subscribed: newsletter.state === "confirmed", confirmed: newsletter.state === "confirmed", since: newsletter.since, language: newsletter.locale },
    },
    addresses: listCustomerAddresses(id).map((a) => ({
      label: a.label,
      method: a.method,
      city: a.cityName,
      postCode: a.postCode,
      address: a.address,
      office: a.office,
      phone: a.phone,
      isDefault: a.isDefault,
      updatedAt: a.updatedAt,
    })),
    orders,
    withdrawals,
    devices: sessions,
    chat: conversations,
  };
}
