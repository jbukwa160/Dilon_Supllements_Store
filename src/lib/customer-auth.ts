import "server-only";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isLang, type Lang } from "@/i18n/config";
import { CHAT_COOKIE } from "./chat";
import { clientAddressFrom, requestIsHttps } from "./client-ip";
import { storeDb } from "./db";
import { accountKey, loginContext, loginFailed, loginSucceeded, loginWait } from "./login-guard";
import { hashPassword, verifyPassword } from "./password";
import { DAY, HOUR, rateLimited, subjectLimited } from "./rate-limit";
import { localizeHref, safeNextPath } from "./links";

// Customer accounts: same design as the admin sessions in lib/auth.ts (random token in an httpOnly cookie,
// only its sha256 in the DB, scrypt passwords, brute-force protection in lib/login-guard.ts), but a separate cookie
// on path "/" and separate tables (customers, customer_sessions, customer_tokens). Guest checkout works without it.
//
// Pages that read the session (account, checkout, order pages) are dynamic anyway. The shared shop chrome must
// NOT call getCustomer(): the header asks GET /api/account/me from the browser instead, so pages stay cacheable.

export const CUSTOMER_COOKIE = "sp_session";
const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // "remember me": 30 days, extended while the customer is active
const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // browser-session cookie; the DB row lives 12 hours after the last visit
const RESET_TTL_MS = 60 * 60 * 1000; // password reset link: 1 hour, single use
// Limits that hold whatever address the requests come from (rate-limit.ts subjectLimited).
const REGISTER_PER_EMAIL = 5; // sign-up attempts per e-mail address and day
const REGISTER_GLOBAL = 200; // new accounts per hour, whole shop
const RESET_PER_EMAIL = 6; // reset e-mails per address and day (plus "one every 2 minutes", customer-account.ts)
const RESET_GLOBAL = 300; // reset e-mails per hour, whole shop
const MAX_PASSWORD = 200;
export const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
// Verified for unknown e-mails too, so the response time doesn't reveal which addresses have an account.
const DUMMY_HASH = "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export type Customer = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  locale: Lang;
  /** Opted in to marketing e-mails. */
  marketing: boolean;
  createdAt: string;
  blocked: boolean;
};

type CustomerRow = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  locale: string;
  marketing_consent_at: string | null;
  created_at: string;
  blocked: number;
};

const CUSTOMER_COLS = "c.id, c.email, c.first_name, c.last_name, c.phone, c.locale, c.marketing_consent_at, c.created_at, c.blocked";

function toCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    locale: isLang(r.locale) ? r.locale : "bg",
    marketing: !!r.marketing_consent_at,
    createdAt: r.created_at,
    blocked: !!r.blocked,
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const normEmail = (email: string) => email.trim().toLowerCase().slice(0, 200);

async function requestInfo() {
  const h = await headers();
  return { ip: clientAddressFrom(h).ip, userAgent: (h.get("user-agent") ?? "").slice(0, 200), secure: requestIsHttps(h) };
}

/**
 * The chat conversation cookie belongs to whoever used the browser: it is dropped whenever a customer signs in or
 * out, so the next person on a shared computer never sees (or continues) someone else's chat.
 */
async function dropChatCookie() {
  // Always sent: the cookie lives on path /api/chat, so this request (an account page / action) can't see it.
  (await cookies()).set(CHAT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/chat", maxAge: 0 });
}

/** A customer by id (admin customer card, e-mails); null if there is none. */
export function getCustomerById(id: number): Customer | null {
  const row = storeDb().prepare(`SELECT ${CUSTOMER_COLS} FROM customers c WHERE c.id = ?`).get(id) as CustomerRow | undefined;
  return row ? toCustomer(row) : null;
}

/** The signed-in customer for this request, or null. Checked against the DB every time; blocked accounts get null. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token || token.length < 20) return null;
  const db = storeDb();
  const hash = sha256(token);
  const row = db
    .prepare(
      `SELECT ${CUSTOMER_COLS}, s.expires_at, s.last_seen_at, s.persistent FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
       WHERE s.token_hash = ?`,
    )
    .get(hash) as (CustomerRow & { expires_at: string; last_seen_at: string; persistent: number }) | undefined;
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now || row.blocked) {
    db.prepare("DELETE FROM customer_sessions WHERE token_hash = ?").run(hash);
    return null;
  }
  // Sliding expiry: at most one write a minute.
  if (now - Date.parse(row.last_seen_at) > 60_000) {
    const ttl = row.persistent ? LONG_SESSION_MS : SHORT_SESSION_MS;
    db.prepare("UPDATE customer_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?").run(
      new Date(now).toISOString(),
      new Date(now + ttl).toISOString(),
      hash,
    );
  }
  return toCustomer(row);
});

/**
 * Use at the top of account pages and customer Server Actions. Redirects to the (localized) sign-in page,
 * which sends the customer back to `next` afterwards.
 */
export async function requireCustomer(lang: Lang, next?: string): Promise<Customer> {
  const customer = await getCustomer();
  if (!customer) {
    const back = next ? safeNextPath(next, "") : "";
    redirect(localizeHref(back ? `/vhod?next=${encodeURIComponent(back)}` : "/vhod", lang));
  }
  return customer;
}

/** Password rules for customers: at least 8 characters with a letter and a digit. */
export function customerPasswordProblem(pw: string): "too_short" | "needs_letter_digit" | null {
  if (pw.length < 8) return "too_short";
  if (!/[a-zA-Zа-яА-Я]/.test(pw) || !/\d/.test(pw)) return "needs_letter_digit";
  return null;
}

/** Creates the session row and sets the cookie. Server Actions / Route Handlers only (it sets a cookie). */
async function startSession(customerId: number, remember: boolean) {
  const db = storeDb();
  const { ip, userAgent, secure } = await requestInfo();
  const now = Date.now();
  await dropChatCookie();
  db.prepare("DELETE FROM customer_sessions WHERE expires_at < ?").run(new Date(now).toISOString());
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now + (remember ? LONG_SESSION_MS : SHORT_SESSION_MS));
  db.prepare(
    `INSERT INTO customer_sessions (token_hash, customer_id, created_at, expires_at, last_seen_at, ip, user_agent, persistent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), customerId, new Date(now).toISOString(), expires.toISOString(), new Date(now).toISOString(), ip, userAgent, remember ? 1 : 0);
  db.prepare("UPDATE customers SET last_login_at = ? WHERE id = ?").run(new Date(now).toISOString(), customerId);
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    // Without "remember me" it is a browser-session cookie.
    ...(remember ? { expires } : {}),
  });
}

/**
 * Keeps a "remember me" cookie alive while the customer uses the site (the DB row slides in getCustomer(), but a
 * cookie can only be re-sent from a Route Handler or Server Action). Call it from GET /api/account/me.
 */
export async function refreshCustomerCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (!token || token.length < 20) return;
  const row = storeDb().prepare("SELECT expires_at, persistent FROM customer_sessions WHERE token_hash = ?").get(sha256(token)) as
    | { expires_at: string; persistent: number }
    | undefined;
  if (!row || !row.persistent || Date.parse(row.expires_at) <= Date.now()) return;
  const { secure } = await requestInfo();
  store.set(CUSTOMER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(row.expires_at) });
}

export type RegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  locale: Lang;
  /** Separate, never pre-ticked opt-in for marketing e-mails. */
  marketing: boolean;
};

/** Creates the account and signs the customer in (30-day session). Server Actions only. */
export async function registerCustomer(
  input: RegisterInput,
): Promise<{ ok: true; customer: Customer } | { ok: false; code: "email_taken" | "weak_password" | "invalid" | "rate_limited" }> {
  const email = normEmail(String(input.email ?? ""));
  const password = String(input.password ?? "");
  const firstName = String(input.firstName ?? "").trim().slice(0, 80);
  const lastName = String(input.lastName ?? "").trim().slice(0, 80);
  const phone = String(input.phone ?? "").trim().slice(0, 30);
  if (!EMAIL_RE.test(email) || !firstName || !lastName || (phone && !/^[+\d][\d\s()-]{5,20}$/.test(phone))) return { ok: false, code: "invalid" };
  if (password.length > MAX_PASSWORD || customerPasswordProblem(password)) return { ok: false, code: "weak_password" };
  if (await rateLimited("register", 5, HOUR)) return { ok: false, code: "rate_limited" };
  // Also per address (each sign-up e-mails it) and shop-wide, whatever IP address the requests come from.
  if (subjectLimited("register", email, REGISTER_PER_EMAIL, DAY) || subjectLimited("register", "*", REGISTER_GLOBAL, HOUR)) {
    return { ok: false, code: "rate_limited" };
  }

  const db = storeDb();
  if (db.prepare("SELECT 1 FROM customers WHERE email = ?").get(email)) return { ok: false, code: "email_taken" };
  const now = new Date().toISOString();
  let id: number;
  try {
    const r = db
      .prepare(
        `INSERT INTO customers (email, password_hash, first_name, last_name, phone, locale, marketing_consent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(email, hashPassword(password), firstName, lastName, phone, isLang(input.locale) ? input.locale : "bg", input.marketing === true ? now : null, now);
    id = Number(r.lastInsertRowid);
  } catch {
    // Two sign-ups with the same e-mail at the same moment: the UNIQUE index wins.
    return { ok: false, code: "email_taken" };
  }
  await startSession(id, true);
  return { ok: true, customer: getCustomerById(id)! };
}

/**
 * Sign in. `locked` with `minutes` = too many failed attempts; `locked` without `minutes` = the shop blocked the
 * account (only reported after a correct password, so it reveals nothing to strangers). Server Actions only.
 */
export async function loginCustomer(
  email: string,
  password: string,
  remember: boolean,
): Promise<{ ok: true } | { ok: false; code: "invalid" | "locked"; minutes?: number }> {
  const db = storeDb();
  const mail = normEmail(String(email ?? ""));
  const pw = String(password ?? "").slice(0, MAX_PASSWORD);
  const now = Date.now();

  const user = db.prepare("SELECT id, password_hash, blocked FROM customers WHERE email = ?").get(mail) as
    | { id: number; password_hash: string; blocked: number }
    | undefined;
  const guard = await loginContext("customer", mail, user?.password_hash ?? null);
  const wait = loginWait(guard, now);
  if (wait > 0) return { ok: false, code: "locked", minutes: Math.ceil(wait / 60000) };

  const valid = verifyPassword(pw, user?.password_hash ?? DUMMY_HASH) && !!user;

  if (!valid || !user) {
    // A growing wait per account and a lock per address (lib/login-guard.ts); "invalid" while none applies yet.
    const next = loginFailed(guard, now);
    return next >= 60_000 ? { ok: false, code: "locked", minutes: Math.ceil(next / 60000) } : { ok: false, code: "invalid" };
  }
  if (user.blocked) return { ok: false, code: "locked" };

  await loginSucceeded(guard, user.password_hash);
  await startSession(user.id, remember);
  return { ok: true };
}

/** Signs out this browser. Server Actions only (a form POST — never a GET link). */
export async function logoutCustomer() {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) storeDb().prepare("DELETE FROM customer_sessions WHERE token_hash = ?").run(sha256(token));
  store.set(CUSTOMER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  await dropChatCookie();
}

/** Sign out every other device of this customer ("Изход от всички други устройства", after a password change). */
export async function endOtherCustomerSessions(id: number) {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value ?? "";
  storeDb().prepare("DELETE FROM customer_sessions WHERE customer_id = ? AND token_hash <> ?").run(id, sha256(token));
}

/** Change the password (current one required); other devices are signed out, open reset links stop working. */
export async function changeCustomerPassword(
  id: number,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; code: "wrong_password" | "too_short" | "needs_letter_digit" }> {
  const db = storeDb();
  const row = db.prepare("SELECT password_hash FROM customers WHERE id = ?").get(id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(String(current ?? "").slice(0, MAX_PASSWORD), row.password_hash)) return { ok: false, code: "wrong_password" };
  const pw = String(next ?? "");
  const problem = pw.length > MAX_PASSWORD ? "too_short" : customerPasswordProblem(pw);
  if (problem) return { ok: false, code: problem };
  db.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").run(hashPassword(pw), id);
  db.prepare("DELETE FROM customer_tokens WHERE customer_id = ? AND purpose = 'reset'").run(id);
  await endOtherCustomerSessions(id);
  return { ok: true };
}

/**
 * A password reset link token for this e-mail (valid 1 hour, single use, stored hashed; any older unused link
 * stops working). null when there is no such (unblocked) account, or when this address already got RESET_PER_EMAIL
 * links today / the shop sent RESET_GLOBAL this hour — the caller shows the same message either way.
 * Rate-limit the calling action per visitor too ("reset", 5 / hour).
 */
export function createPasswordResetToken(email: string): { token: string; customer: Customer } | null {
  const db = storeDb();
  const mail = normEmail(String(email ?? ""));
  const row = db.prepare(`SELECT ${CUSTOMER_COLS} FROM customers c WHERE c.email = ?`).get(mail) as CustomerRow | undefined;
  if (!row || row.blocked) return null;
  if (subjectLimited("reset-mail", mail, RESET_PER_EMAIL, DAY) || subjectLimited("reset-mail", "*", RESET_GLOBAL, HOUR)) return null;
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.transaction(() => {
    db.prepare("DELETE FROM customer_tokens WHERE customer_id = ? AND purpose = 'reset'").run(row.id);
    db.prepare("INSERT INTO customer_tokens (token_hash, customer_id, purpose, expires_at) VALUES (?, ?, 'reset', ?)").run(
      sha256(token),
      row.id,
      new Date(now + RESET_TTL_MS).toISOString(),
    );
  })();
  return { token, customer: toCustomer(row) };
}

/** Sets a new password from a reset link. Signs the account out everywhere and clears sign-in locks. */
export function resetPasswordWithToken(
  token: string,
  password: string,
): { ok: true; customer: Customer } | { ok: false; code: "invalid" | "expired" | "too_short" | "needs_letter_digit" } {
  const t = String(token ?? "");
  if (t.length < 20 || t.length > 100) return { ok: false, code: "invalid" };
  const db = storeDb();
  const hash = sha256(t);
  const row = db.prepare("SELECT customer_id, expires_at, used_at FROM customer_tokens WHERE token_hash = ? AND purpose = 'reset'").get(hash) as
    | { customer_id: number; expires_at: string; used_at: string | null }
    | undefined;
  if (!row || row.used_at) return { ok: false, code: "invalid" };
  if (Date.parse(row.expires_at) <= Date.now()) return { ok: false, code: "expired" };
  const pw = String(password ?? "");
  const problem = pw.length > MAX_PASSWORD ? "too_short" : customerPasswordProblem(pw);
  if (problem) return { ok: false, code: problem };
  const customer = getCustomerById(row.customer_id);
  if (!customer || customer.blocked) return { ok: false, code: "invalid" };
  db.transaction(() => {
    db.prepare("UPDATE customer_tokens SET used_at = ? WHERE token_hash = ?").run(new Date().toISOString(), hash);
    db.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").run(hashPassword(pw), customer.id);
    db.prepare("DELETE FROM customer_sessions WHERE customer_id = ?").run(customer.id);
    // The owner proved access to the mailbox: the account's sign-in wait is lifted.
    db.prepare("DELETE FROM login_attempts WHERE key = ?").run(accountKey("customer", customer.email.toLowerCase()));
  })();
  return { ok: true, customer };
}
