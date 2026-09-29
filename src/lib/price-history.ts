// store.db price_history: one row every time a product's effective price changes (and the first time a SKU is
// seen). The Omnibus reference price ("Най-ниска цена за последните 30 дни") is computed from it.
// Rows written while the product only had a placeholder (demo) price are flagged `demo = 1`: once real prices are in,
// they are never used as a reference (a real reduction must not be measured against a made-up price).
// Pure — takes the store connection explicitly (shared by the site and the importer).
import type Database from "better-sqlite3";

type DB = Database.Database;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows older than this are pruned (except what an Omnibus window still needs, see prunePriceHistory). */
export const HISTORY_KEEP_DAYS = 60;

const checked = new WeakSet<DB>();

/**
 * Adds the `demo` column to a price_history table created by an older schema. lib/db.ts migrates the site's
 * connection; this covers the CLI importer, which opens store.db itself. Cheap after the first call per connection.
 */
export function ensurePriceHistorySchema(store: DB): void {
  if (checked.has(store)) return;
  const cols = store.prepare("PRAGMA table_info(price_history)").all() as { name: string }[];
  if (cols.length && !cols.some((c) => c.name === "demo")) store.exec("ALTER TABLE price_history ADD COLUMN demo INTEGER NOT NULL DEFAULT 0");
  checked.add(store);
}

export type HistoryEntry = { at: string; price: number; demo: boolean };

/**
 * Price history per SKU, oldest first (all SKUs, or the given ones). One sequential read instead of a lookup per
 * product: a full recompute needs every SKU's history anyway, and pruning keeps the table small.
 */
export function loadHistory(store: DB, skus?: string[]): Map<string, HistoryEntry[]> {
  ensurePriceHistorySchema(store);
  const out = new Map<string, HistoryEntry[]>();
  const add = (sku: string, at: string, price: number, demo: number) => {
    let list = out.get(sku);
    if (!list) out.set(sku, (list = []));
    list.push({ at, price, demo: demo === 1 });
  };
  if (skus) {
    const q = store.prepare("SELECT at, price, demo FROM price_history WHERE sku = ? ORDER BY at, id").raw();
    for (const sku of new Set(skus)) for (const [at, price, demo] of q.all(sku) as [string, number, number][]) add(sku, at, price, demo);
    return out;
  }
  for (const [sku, at, price, demo] of store.prepare("SELECT sku, at, price, demo FROM price_history ORDER BY sku, at, id").raw().iterate() as IterableIterator<
    [string, string, number, number]
  >) {
    add(sku, at, price, demo);
  }
  return out;
}

/**
 * Lowest price in effect at any time in [from, to): the prices recorded inside the window plus the price that was
 * already in effect when the window started. Demo rows count only for a product that is itself still on demo prices.
 * null when nothing usable was recorded before `to`.
 */
export function lowestIn(entries: HistoryEntry[] | undefined, from: string, to: string, includeDemo = false): number | null {
  let before: number | null = null;
  let low: number | null = null;
  for (const e of entries ?? []) {
    if (e.at >= to) break;
    if (e.demo && !includeDemo) continue;
    if (e.at < from) before = e.price;
    else low = low === null ? e.price : Math.min(low, e.price);
  }
  if (before !== null) low = low === null ? before : Math.min(low, before);
  return low;
}

/** Same as lowestIn for one SKU, read from the database (a single product's Omnibus price in the admin). */
export function lowestInWindow(store: DB, sku: string, from: string, to: string, includeDemo = false): number | null {
  return lowestIn(loadHistory(store, [sku]).get(sku), from, to, includeDemo);
}

/** Append price changes (one transaction). */
export function recordPrices(store: DB, rows: { sku: string; price: number; demo?: boolean }[], at: string) {
  if (!rows.length) return;
  ensurePriceHistorySchema(store);
  const ins = store.prepare("INSERT INTO price_history (sku, price, at, demo) VALUES (?, ?, ?, ?)");
  store.transaction(() => {
    for (const r of rows) ins.run(r.sku, r.price, at, r.demo ? 1 : 0);
  })();
}

/**
 * Flag the history of products that are (still / again) on placeholder prices as demo: rows written before the flag
 * existed, or real prices a "restore original" has undone.
 */
export function markDemoHistory(store: DB, skus: string[]) {
  if (!skus.length) return;
  ensurePriceHistorySchema(store);
  const upd = store.prepare("UPDATE price_history SET demo = 1 WHERE sku = ? AND demo = 0");
  store.transaction(() => {
    for (const sku of skus) upd.run(sku);
  })();
}

/** The 30-day window that ends at `since` (ISO), as ISO strings. */
export function window30(since: string): { from: string; to: string } {
  const to = new Date(since);
  return { from: new Date(to.getTime() - 30 * DAY_MS).toISOString(), to: to.toISOString() };
}

/**
 * Delete history older than HISTORY_KEEP_DAYS, keeping per SKU the last row before the cut-off (the price in effect
 * when the kept period starts). A product reduced since longer ago keeps everything its Omnibus window needs:
 * its cut-off moves back to 30 days before its reduction started (`reducedSince`: SKU → discount_since).
 * Returns the number of deleted rows.
 */
export function prunePriceHistory(store: DB, reducedSince: Map<string, string>, now = new Date()): number {
  ensurePriceHistorySchema(store);
  const cutoff = new Date(now.getTime() - HISTORY_KEEP_DAYS * DAY_MS).toISOString();
  return store.transaction(() => {
    store.exec("CREATE TEMP TABLE IF NOT EXISTS price_keep_from (sku TEXT PRIMARY KEY, cutoff TEXT NOT NULL); DELETE FROM temp.price_keep_from;");
    const ins = store.prepare("INSERT OR REPLACE INTO temp.price_keep_from (sku, cutoff) VALUES (?, ?)");
    for (const [sku, since] of reducedSince) {
      const from = window30(since).from;
      if (from < cutoff) ins.run(sku, from);
    }
    const deleted = store
      .prepare(
        `DELETE FROM price_history WHERE id IN (
           SELECT id FROM (
             SELECT h.id, ROW_NUMBER() OVER (PARTITION BY h.sku ORDER BY h.at DESC, h.id DESC) AS rn
             FROM price_history h LEFT JOIN temp.price_keep_from k ON k.sku = h.sku
             WHERE h.at < COALESCE(k.cutoff, @cutoff)
           ) WHERE rn > 1
         )`,
      )
      .run({ cutoff }).changes;
    store.exec("DELETE FROM temp.price_keep_from");
    return deleted;
  })();
}
