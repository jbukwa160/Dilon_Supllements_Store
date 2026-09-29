import "server-only";
import { createHash } from "node:crypto";
import { clientAddress } from "./client-ip";
import { storeDb } from "./db";

// Two kinds of limits:
//   rateLimited(bucket, max, windowMs)                 per visitor (IP, see client-ip.ts), in memory — cheap, for
//                                                       every public endpoint; forgotten on restart
//   subjectLimited(bucket, subject, max, windowMs)     per e-mail address / order number / "*" (the whole shop), in
//                                                       store.db — holds whatever address the requests come from and
//                                                       across restarts; for anything that sends e-mail or reveals data
// Both are fixed windows: at most `max` calls per window, the call that goes over gets `true` ("limited").

// ---------------------------------------------------------------------------------------------------------------
// Per visitor, in memory. The map is bounded: expired windows are dropped first, then the oldest keys, so a flood of
// addresses cannot grow it without limit (a dropped key only means that visitor starts a fresh window).

const MAX_KEYS = 20_000;
const hits = new Map<string, { count: number; reset: number }>();

function prune(now: number) {
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  if (hits.size < MAX_KEYS) return;
  let drop = hits.size - Math.floor(MAX_KEYS * 0.9);
  for (const k of hits.keys()) {
    if (drop-- <= 0) break;
    hits.delete(k);
  }
}

/** Counts one call of `key` (in memory); true when it is over `max` in the current window. */
export function hitLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const e = hits.get(key);
  if (!e || now > e.reset) {
    if (e) hits.delete(key); // re-insert: the map's order is then roughly "oldest window first"
    else if (hits.size >= MAX_KEYS) prune(now);
    hits.set(key, { count: 1, reset: now + windowMs });
    return max < 1;
  }
  e.count++;
  return e.count > max;
}

/** Keys currently held in memory (tests / diagnostics). */
export function limiterSize(): number {
  return hits.size;
}

/**
 * Per-visitor limit for Server Actions and Route Handlers: true when this visitor made more than `max` calls in
 * `bucket` within `windowMs`. Behind no trusted proxy all visitors share one key (client-ip.ts) — per-subject limits
 * then do the real work.
 */
export async function rateLimited(bucket: string, max: number, windowMs = 60_000): Promise<boolean> {
  const { key } = await clientAddress();
  return hitLimit(`${bucket}|${key}`, max, windowMs);
}

// ---------------------------------------------------------------------------------------------------------------
// Per subject, in store.db (table rate_limits). The subject is hashed, so no e-mail address is stored.

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** Normalised subject: e-mail addresses are case-insensitive. */
const subjectKey = (bucket: string, subject: string) => `${bucket}:${sha256(subject.trim().toLowerCase())}`;

/**
 * Counts one call for `subject` (an e-mail address, an order number, or "*" for a shop-wide cap) and returns true
 * when that makes more than `max` in the current window of `windowMs`.
 */
export function subjectLimited(bucket: string, subject: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const row = storeDb()
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
       RETURNING count`,
    )
    .get(subjectKey(bucket, subject), now + windowMs, now, now) as { count: number };
  return row.count > max;
}

/** True when `subject` has already used up `max` calls in the current window (does not count this call). */
export function subjectLimitReached(bucket: string, subject: string, max: number): boolean {
  const row = storeDb().prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?").get(subjectKey(bucket, subject)) as
    | { count: number; reset_at: number }
    | undefined;
  return !!row && row.reset_at > Date.now() && row.count >= max;
}

/** Forget the counter of `subject` (e.g. after a successful action that should not count). */
export function resetSubjectLimit(bucket: string, subject: string): void {
  storeDb().prepare("DELETE FROM rate_limits WHERE key = ?").run(subjectKey(bucket, subject));
}

/** Expired windows (lib/retention.ts). */
export function purgeRateLimits(now = Date.now()): number {
  return storeDb().prepare("DELETE FROM rate_limits WHERE reset_at <= ?").run(now).changes;
}

export const HOUR = 60 * 60_000;
export const DAY = 24 * HOUR;
