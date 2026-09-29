import "server-only";
import { storeDb } from "@/lib/db";

// Two-level cache (memory + store.db) for courier data. If a refresh fails, the last good copy is used.
// With no copy at all, a failed load is remembered for a minute: while a courier API is down every caller fails at
// once (the checkout then offers its fallbacks) instead of each one waiting for the request to time out.
const memory = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const failures = new Map<string, { at: number; error: Error }>();
const FAILURE_PAUSE_MS = 60_000;

// Bump when the stored shape/formatting of courier data changes.
const VERSION = "v2";

export async function cached<T>(rawKey: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const key = `${VERSION}:${rawKey}`;
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as T;

  const db = storeDb();
  const row = db.prepare("SELECT value, fetched_at FROM courier_cache WHERE key = ?").get(key) as { value: string; fetched_at: string } | undefined;
  if (row && now - Date.parse(row.fetched_at) < ttlMs) {
    const value = JSON.parse(row.value) as T;
    memory.set(key, { at: Date.parse(row.fetched_at), value });
    return value;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const failed = failures.get(key);
  if (!row && failed && now - failed.at < FAILURE_PAUSE_MS) throw failed.error;
  if (failures.size > 500) failures.clear();
  const job = (async () => {
    try {
      const value = await load();
      db.prepare(
        "INSERT INTO courier_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at",
      ).run(key, JSON.stringify(value), new Date().toISOString());
      // Keep the table small: drop entries not refreshed for 30 days (and old cache versions).
      if (Math.random() < 0.05) {
        db.prepare("DELETE FROM courier_cache WHERE fetched_at < ? OR key NOT LIKE ?").run(new Date(Date.now() - 30 * 86400_000).toISOString(), `${VERSION}:%`);
      }
      memory.set(key, { at: Date.now(), value });
      failures.delete(key);
      return value;
    } catch (e) {
      if (row) {
        const stale = JSON.parse(row.value) as T;
        memory.set(key, { at: Date.now() - ttlMs + 5 * 60_000, value: stale }); // retry in 5 min
        return stale;
      }
      failures.set(key, { at: Date.now(), error: e as Error });
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/** "ВАРНА - СКЛАД" → "Варна - Склад" (couriers send many names in capitals). */
export function titleCase(s: string): string {
  if (!s) return "";
  // Words written fully in capitals get normal casing; "ул.", "бл." etc. stay as they are.
  return s
    .replace(/\p{Lu}{2,}/gu, (w) => w.charAt(0) + w.slice(1).toLowerCase())
    .replace(/(^|\s)No(?=\s|\d)/g, "$1№")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
