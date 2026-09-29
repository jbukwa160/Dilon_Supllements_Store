// Effective prices: regular (base) price, manual per-product sales and % promotions (optionally scheduled),
// plus the Omnibus reference price. Materializes products.price / old_price / lowest30 / discount_since / promo_*
// and writes store.db price_history (SPEC §5.5, §8, §11b).
// Pure — takes both connections explicitly; used by pricing-rules.ts (site) and the CSV importer.
//
//   price       = the LOWEST of: base, active sale price, base × (1 − p) for every active promotion in scope
//                 (rounded to cents, or to the nearest ,99 when the promotion says so — see round99)
//   discount_since = when the current reduction started (kept while the product stays reduced)
//   lowest30    = lowest effective price in the 30 days before discount_since. With nothing recorded before the
//                 reduction started (a product that arrives reduced, or its first real price after placeholder ones)
//                 there is nothing to compare with: lowest30 = the current price, so no reduction is shown.
//                 Products still on placeholder (demo) prices fall back to their placeholder regular price.
//   old_price   = lowest30 when lowest30 > price, else NULL — the struck-through price and the −% badge are computed
//                 from it (Omnibus Directive + CJEU C-330/23 Aldi Süd)
//   promo_label = the promotion's badge, only next to a visible reduction (old_price)
import type Database from "better-sqlite3";
import { affectedCards, refreshGroupPrices, refreshListing } from "./catalog-sync";
import { loadHistory, lowestIn, markDemoHistory, recordPrices, window30, type HistoryEntry } from "./price-history";

type DB = Database.Database;

// ---------------------------------------------------------------------------
// Dates: the admin enters Bulgarian local time ("2026-11-27" or "2026-11-27T09:00"); ISO with a zone works too.

const SOFIA = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Sofia",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Minutes Sofia is ahead of UTC at the given instant (120 or 180). */
function sofiaOffset(utcMs: number): number {
  const p = Object.fromEntries(SOFIA.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - utcMs) / 60000);
}

/**
 * A promotion / sale boundary as an instant. Date-only values mean the start of that day — or, for an END
 * (`end = true`), the end of that day (inclusive). Local times are Europe/Sofia. null for empty / invalid values.
 */
export function parseWhen(v: string | null | undefined, end = false): Date | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  const dateOnly = m[4] === undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let local = Date.UTC(y, mo - 1, d, Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  if (dateOnly && end) local += 24 * 60 * 60 * 1000;
  let utc = local - sofiaOffset(local) * 60000;
  utc = local - sofiaOffset(utc) * 60000; // second pass settles DST edges
  return Number.isNaN(utc) ? null : new Date(utc);
}

// ---------------------------------------------------------------------------
// Promotions (store.db, edited in Цени и промоции)

export type Promotion = {
  id: number;
  percent: number;
  scope: "all" | "category" | "brand" | "goal" | "skus";
  values: Set<string>;
  round99: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  badge: string | null;
};

type PromotionRow = {
  id: number;
  percent: number;
  scope: string;
  scope_value: string | null;
  round99: number;
  starts_at: string | null;
  ends_at: string | null;
  badge: string | null;
};

function scopeValues(v: string | null): Set<string> {
  const s = (v ?? "").trim();
  if (!s) return new Set();
  if (s.startsWith("[")) {
    try {
      const x: unknown = JSON.parse(s);
      if (Array.isArray(x)) return new Set(x.filter((i): i is string => typeof i === "string").map((i) => i.trim()).filter(Boolean));
    } catch {
      // fall through: treat as a plain list
    }
  }
  return new Set(s.split(/[\s,;]+/).filter(Boolean));
}

function hasTable(db: DB, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

/** Enabled promotions (any time window). */
export function loadPromotions(store: DB | null): Promotion[] {
  if (!store || !hasTable(store, "promotions")) return [];
  const rows = store.prepare("SELECT id, percent, scope, scope_value, round99, starts_at, ends_at, badge FROM promotions WHERE enabled = 1").all() as PromotionRow[];
  const scopes = ["all", "category", "brand", "goal", "skus"];
  return rows
    .filter((r) => scopes.includes(r.scope) && r.percent > 0 && r.percent < 100)
    .map((r) => ({
      id: r.id,
      percent: Math.min(95, r.percent),
      scope: r.scope as Promotion["scope"],
      values: scopeValues(r.scope_value),
      round99: !!r.round99,
      startsAt: parseWhen(r.starts_at),
      endsAt: parseWhen(r.ends_at, true),
      badge: r.badge && r.badge.trim() && r.badge.trim() !== "null" ? r.badge : null,
    }));
}

/** Changes whenever the admin adds / edits / removes a promotion (cheap check for ensurePricesFresh). */
export function promotionsRevision(store: DB | null): string {
  if (!store || !hasTable(store, "promotions")) return "0";
  const r = store.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS u, COALESCE(SUM(enabled), 0) AS e FROM promotions").get() as {
    n: number;
    u: string;
    e: number;
  };
  return `${r.n}:${r.e}:${r.u}`;
}

const isActive = (p: Promotion, now: Date) => (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now);

function inScope(p: Promotion, r: PriceRow, goals: string[]): boolean {
  switch (p.scope) {
    case "all":
      return true;
    case "category":
      return p.values.has(r.category) || (!!r.subcategory && p.values.has(r.subcategory));
    case "brand":
      return !!r.brand_slug && p.values.has(r.brand_slug);
    case "goal":
      return goals.some((g) => p.values.has(g));
    case "skus":
      return p.values.has(r.sku);
  }
}

const cents = (x: number) => Math.round(x * 100) / 100;

/**
 * ",99" price ending, shared by promotions and the admin's bulk price change: the NEAREST X,99 to the computed price
 * (20,79 → 20,99; 12,39 → 11,99). The exact price (in cents) is kept instead when the X,99 would be below 0,99 €, more
 * than 10 % away from the computed price (cheap products: 1,50 → 0,99), or outside the given bounds — `below`: the
 * result must stay under it (a promotion price under the regular price, a price decrease under the old price);
 * `above`: the result must stay over it (a price increase).
 */
export function round99(x: number, bounds: { below?: number; above?: number } = {}): number {
  const exact = cents(x);
  const r = cents(Math.round(x) - 0.01);
  const ok =
    r >= 0.99 &&
    Math.abs(r - x) <= x * 0.1 &&
    (bounds.below === undefined || r < bounds.below - 0.001) &&
    (bounds.above === undefined || r > bounds.above + 0.001);
  return ok ? r : exact;
}

/** Price of a product with regular price `base` under a promotion of `percent` % (never below 0,01 €). */
export function promotionPrice(base: number, percent: number, useRound99: boolean): number {
  const x = base * (1 - percent / 100);
  return Math.max(0.01, useRound99 ? round99(x, { below: base }) : cents(x));
}

// ---------------------------------------------------------------------------

type PriceRow = {
  id: number;
  sku: string;
  category: string;
  subcategory: string | null;
  brand_slug: string | null;
  goals: string;
  group_id: number | null;
  base_price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  demo_price: number;
  price: number;
  old_price: number | null;
  lowest30: number | null;
  discount_since: string | null;
  promo_id: number | null;
  promo_label: string | null;
};

function parseGoals(v: string): string[] {
  try {
    const x: unknown = JSON.parse(v || "[]");
    return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function getMeta(db: DB, key: string): string | null {
  return (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

/** The next promotion start / end or manual sale end after `now` (ms), or null. */
function nextBoundary(catalog: DB, promotions: Promotion[], now: Date, when: (v: string) => Date | null): number | null {
  let next: number | null = null;
  const consider = (d: Date | null) => {
    if (d && d > now && (next === null || d.getTime() < next)) next = d.getTime();
  };
  for (const p of promotions) {
    consider(p.startsAt);
    consider(p.endsAt);
  }
  const ends = catalog.prepare("SELECT DISTINCT sale_ends_at AS v FROM products WHERE sale_price IS NOT NULL AND sale_ends_at IS NOT NULL").all() as { v: string }[];
  for (const e of ends) consider(when(e.v));
  return next;
}

/** A recompute worked out but not written yet (planPrices → writePrices → refreshAfterPrices). */
type PricePlan = {
  partial: boolean;
  nowIso: string;
  /** [price, old_price, lowest30, discount_since, promo_id, promo_label, id] of the products whose values change. */
  updates: [number, number | null, number | null, string | null, number | null, string | null, number][];
  touchedGroups: number[];
  /** New price_history rows. */
  recorded: { sku: string; price: number; demo: boolean }[];
  /** SKUs on placeholder prices whose history still has rows not flagged demo. */
  staleDemo: string[];
  /** meta next_price_change_at (ms), null = none. */
  next: number | null;
  promotionsRev: string;
  withHistory: boolean;
};

/** Reads the products, promotions and price history and works out every new price. Writes nothing. */
function planPrices(catalog: DB, store: DB | null, opts: { skus?: string[]; now?: Date }): PricePlan {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const promotions = loadPromotions(store);
  const active = promotions.filter((p) => isActive(p, now));
  const withHistory = !!store && hasTable(store, "price_history");
  // Same values over and over (a promotion's start, a sale's end date): parse each once.
  const endDates = new Map<string, Date | null>();
  const saleEnd = (v: string) => {
    if (!endDates.has(v)) endDates.set(v, parseWhen(v, true));
    return endDates.get(v)!;
  };
  const windows = new Map<string, { from: string; to: string }>();
  const windowOf = (since: string) => {
    if (!windows.has(since)) windows.set(since, window30(since));
    return windows.get(since)!;
  };

  const cols =
    "id, sku, category, subcategory, brand_slug, goals, group_id, base_price, sale_price, sale_ends_at, demo_price, price, old_price, lowest30, discount_since, promo_id, promo_label";
  let rows: PriceRow[];
  if (opts.skus) {
    const skus = [...new Set(opts.skus)];
    rows = [];
    for (let i = 0; i < skus.length; i += 500) {
      const part = skus.slice(i, i + 500);
      rows.push(...(catalog.prepare(`SELECT ${cols} FROM products WHERE sku IN (${part.map(() => "?").join(",")})`).all(...part) as PriceRow[]));
    }
  } else {
    rows = catalog.prepare(`SELECT ${cols} FROM products`).all() as PriceRow[];
  }
  const history: Map<string, HistoryEntry[]> = withHistory ? loadHistory(store!, opts.skus ? rows.map((r) => r.sku) : undefined) : new Map();

  const plan: PricePlan = {
    partial: !!opts.skus,
    nowIso,
    updates: [],
    touchedGroups: [],
    recorded: [],
    staleDemo: [],
    next: null,
    promotionsRev: promotionsRevision(store),
    withHistory,
  };
  const touched = new Set<number>();
  for (const r of rows) {
    const demo = r.demo_price === 1;
    const past = history.get(r.sku);
    // A product on placeholder prices has never had a real one: all of its history is demo.
    if (demo && past?.some((e) => !e.demo)) {
      plan.staleDemo.push(r.sku);
      for (const e of past) e.demo = true;
    }

    const base = cents(r.base_price > 0 ? r.base_price : r.price);
    let best: { price: number; promo: Promotion | null } = { price: base, promo: null };
    const saleEnds = r.sale_ends_at ? saleEnd(r.sale_ends_at) : null;
    if (r.sale_price != null && r.sale_price > 0 && r.sale_price < base && (!saleEnds || saleEnds > now)) {
      best = { price: cents(r.sale_price), promo: null };
    }
    if (active.length) {
      const goals = parseGoals(r.goals);
      for (const p of active) {
        if (!inScope(p, r, goals)) continue;
        const x = promotionPrice(base, p.percent, p.round99);
        // The lowest price wins; on a tie the promotion (with its badge) wins over a manual sale.
        if (x < best.price || (x === best.price && !best.promo && x < base)) best = { price: x, promo: p };
      }
    }
    const price = Math.max(0.01, best.price);
    const discounted = price < base - 0.001;
    const since = discounted ? (r.discount_since ?? nowIso) : null;
    let lowest30: number | null = null;
    if (since) {
      const w = windowOf(since);
      lowest30 = lowestIn(past, w.from, w.to, demo);
      // Nothing recorded before the reduction started: no earlier price to compare with (see the header).
      if (lowest30 === null) lowest30 = demo ? base : price;
    }
    const oldPrice = lowest30 !== null && lowest30 > price + 0.001 ? lowest30 : null;
    const promoId = best.promo?.id ?? null;
    // A promotion label without a struck price and −% would announce a reduction the Omnibus rule doesn't let us show.
    const promoLabel = oldPrice !== null ? (best.promo?.badge ?? null) : null;
    if (
      r.price !== price ||
      r.old_price !== oldPrice ||
      r.lowest30 !== lowest30 ||
      r.discount_since !== since ||
      r.promo_id !== promoId ||
      r.promo_label !== promoLabel
    ) {
      plan.updates.push([price, oldPrice, lowest30, since, promoId, promoLabel, r.id]);
      if (r.group_id !== null) touched.add(r.group_id);
    }
    const last = past?.[past.length - 1];
    if (withHistory && (!last || Math.abs(last.price - price) > 0.001 || last.demo !== demo)) plan.recorded.push({ sku: r.sku, price, demo });
  }
  plan.touchedGroups = [...touched];

  plan.next = nextBoundary(catalog, promotions, now, saleEnd);
  if (opts.skus) {
    const stored = Date.parse(getMeta(catalog, "next_price_change_at") ?? "");
    if (Number.isFinite(stored) && (plan.next === null || stored < plan.next)) plan.next = stored;
  }
  return plan;
}

/** Writes the new prices, the next boundary and the price history. */
function writePrices(catalog: DB, store: DB | null, plan: PricePlan) {
  catalog.transaction(() => {
    const upd = catalog.prepare("UPDATE products SET price = ?, old_price = ?, lowest30 = ?, discount_since = ?, promo_id = ?, promo_label = ? WHERE id = ?");
    for (const u of plan.updates) upd.run(...u);
    const meta = catalog.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
    meta.run("next_price_change_at", plan.next === null ? "" : new Date(plan.next).toISOString());
    if (!plan.partial) {
      meta.run("prices_checked_at", plan.nowIso);
      meta.run("promotions_rev", plan.promotionsRev);
    }
  })();
  if (plan.withHistory) {
    markDemoHistory(store!, plan.staleDemo);
    recordPrices(store!, plan.recorded, plan.nowIso);
  }
}

/** Families and listing rows of the changed products (the whole tables when most of the catalogue changed). */
function refreshAfterPrices(catalog: DB, plan: PricePlan) {
  if (!plan.updates.length) return;
  const partial = plan.partial || plan.updates.length < 2000;
  catalog.transaction(() => {
    refreshGroupPrices(catalog, partial ? plan.touchedGroups : undefined);
    refreshListing(catalog, partial ? affectedCards(catalog, plan.updates.map((u) => u[6])) : undefined);
  })();
}

/**
 * Recompute effective prices of all products (or the given SKUs), write the changes to the catalogue and to
 * store.db price_history. `store` may be null (no promotions, no history: base / sale prices only).
 *
 * A full run records when the next promotion / sale boundary is due (meta next_price_change_at; the scheduler in
 * lib/scheduler.ts wakes up then). A partial run (an admin edit of a few products) only ever brings that time
 * forward: a boundary that has passed but not yet been applied to the other products stays due.
 */
export function computePrices(catalog: DB, store: DB | null, opts: { skus?: string[]; now?: Date } = {}): { changed: number } {
  const plan = planPrices(catalog, store, opts);
  writePrices(catalog, store, plan);
  refreshAfterPrices(catalog, plan);
  return { changed: plan.updates.length };
}

const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * computePrices for the background scheduler: the same work in three steps (work out → write → refresh families and
 * listing) with a pause between them, so shop requests are served in between — a site-wide promotion changes ~30 000
 * products. `unchanged()` says whether the catalogue and the promotions are still as they were when the prices were
 * worked out; if not (an admin saved something during the pause), they are worked out again right before writing.
 */
export async function computePricesInSteps(catalog: DB, store: DB | null, unchanged: () => boolean): Promise<{ changed: number }> {
  let plan = planPrices(catalog, store, {});
  await pause();
  if (!unchanged()) plan = planPrices(catalog, store, {});
  writePrices(catalog, store, plan);
  await pause();
  refreshAfterPrices(catalog, plan);
  return { changed: plan.updates.length };
}

/**
 * Omnibus reference price of a product: when it is reduced, the lowest price in the 30 days before the reduction
 * started (the same rule and fallbacks as computePrices); otherwise the lowest price of the last 30 days including
 * today's — what a reduction starting now would be compared with. null for an unknown SKU.
 */
export function omnibusPrice(catalog: DB, store: DB | null, sku: string, now = new Date()): number | null {
  const r = catalog.prepare("SELECT base_price, price, demo_price, discount_since FROM products WHERE sku = ?").get(sku) as
    | { base_price: number; price: number; demo_price: number; discount_since: string | null }
    | undefined;
  if (!r) return null;
  const demo = r.demo_price === 1;
  const past = store && hasTable(store, "price_history") ? loadHistory(store, [sku]).get(sku) : undefined;
  if (r.discount_since) {
    const w = window30(r.discount_since);
    return lowestIn(past, w.from, w.to, demo) ?? (demo ? r.base_price : r.price);
  }
  const w = window30(now.toISOString());
  const low = lowestIn(past, w.from, w.to, demo);
  return low === null ? r.price : Math.min(low, r.price);
}
