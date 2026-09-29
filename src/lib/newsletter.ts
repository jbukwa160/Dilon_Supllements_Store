import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Lang } from "@/i18n/config";
import { storeDb } from "./db";
import { DAY, HOUR, subjectLimited } from "./rate-limit";
import { RETENTION } from "./retention";

// Newsletter with double opt-in. A sign-up (footer / home form, or the marketing tick in the customer account) only
// stores a PENDING row and e-mails a confirmation link; the address counts as a subscriber once the link was used
// (newsletter.confirmed_at). Lists and exports must use confirmed rows only (isConfirmedSql). Unconfirmed rows are
// deleted after RETENTION.pendingNewsletterDays (lib/retention.ts), which is also how long a link works.

/** How long a confirmation link works (= how long an unconfirmed row is kept). */
const LINK_TTL_MS = RETENTION.pendingNewsletterDays * DAY;
/** Confirmation e-mails per address and day, and for the whole shop per hour (mailbox flooding). */
const PER_ADDRESS_PER_DAY = 3;
const GLOBAL_PER_HOUR = 300;

/** SQL condition for "is a subscriber" (`alias` = the name or alias of the newsletter table in the query). */
export const isConfirmedSql = (alias = "newsletter") => `${alias}.confirmed_at IS NOT NULL`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SubscribeResult =
  /** A confirmation e-mail with `token` must be sent. */
  | { status: "pending"; token: string }
  /** Already a confirmed subscriber: nothing to send. */
  | { status: "confirmed" }
  /** Too many confirmation e-mails for this address (or the shop) right now: nothing is sent. */
  | { status: "limited" };

/**
 * Records a sign-up for `email` (already validated and lower-cased) and returns what to do. The visitor always gets
 * the same answer ("check your inbox"), whatever the status, so the form does not reveal who is subscribed.
 */
export function requestSubscription(email: string, locale: Lang, now = Date.now()): SubscribeResult {
  const db = storeDb();
  const row = db.prepare("SELECT confirmed_at FROM newsletter WHERE email = ?").get(email) as { confirmed_at: string | null } | undefined;
  if (row?.confirmed_at) return { status: "confirmed" };
  if (subjectLimited("newsletter-mail", email, PER_ADDRESS_PER_DAY, DAY) || subjectLimited("newsletter-mail", "*", GLOBAL_PER_HOUR, HOUR)) {
    return { status: "limited" };
  }
  const token = randomBytes(24).toString("base64url");
  const at = new Date(now).toISOString();
  db.prepare(
    `INSERT INTO newsletter (email, locale, created_at, confirmed_at, confirm_hash, confirm_sent_at) VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT(email) DO UPDATE SET locale = excluded.locale, confirm_hash = excluded.confirm_hash, confirm_sent_at = excluded.confirm_sent_at
     WHERE newsletter.confirmed_at IS NULL`,
  ).run(email, locale, at, sha256(token), at);
  return { status: "pending", token };
}

/** Uses a confirmation link. Returns the confirmed address, or null for an unknown, used or expired link. */
export function confirmSubscription(token: string, now = Date.now()): { email: string; locale: Lang } | null {
  const t = String(token ?? "");
  if (t.length < 20 || t.length > 100 || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
  const db = storeDb();
  const row = db
    .prepare("SELECT email, locale, confirm_sent_at FROM newsletter WHERE confirm_hash = ? AND confirmed_at IS NULL")
    .get(sha256(t)) as { email: string; locale: string; confirm_sent_at: string | null } | undefined;
  if (!row || !row.confirm_sent_at || Date.parse(row.confirm_sent_at) + LINK_TTL_MS < now) return null;
  db.prepare("UPDATE newsletter SET confirmed_at = ?, confirm_hash = NULL WHERE email = ? AND confirmed_at IS NULL").run(new Date(now).toISOString(), row.email);
  return { email: row.email, locale: row.locale === "en" ? "en" : "bg" };
}

/** Removes the address from the list (confirmed or not). */
export function removeSubscription(email: string): void {
  storeDb().prepare("DELETE FROM newsletter WHERE email = ?").run(email);
}

/** Subscription state of an address: "none" | "pending" | "confirmed" (account page, data export). */
export function subscriptionState(email: string): { state: "none" | "pending" | "confirmed"; since: string | null; locale: string | null } {
  const row = storeDb().prepare("SELECT locale, created_at, confirmed_at FROM newsletter WHERE email = ?").get(email) as
    | { locale: string; created_at: string; confirmed_at: string | null }
    | undefined;
  if (!row) return { state: "none", since: null, locale: null };
  return row.confirmed_at ? { state: "confirmed", since: row.confirmed_at, locale: row.locale } : { state: "pending", since: row.created_at, locale: row.locale };
}
