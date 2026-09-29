// Automatic purchase-threshold gifts: until the admin saves "Цени и промоции → Подаръци над сума" (settings
// "giftTiers" row missing), the default 40 / 60 / 80 € tiers get small, in-stock, pictured, non-18+ products picked
// from the catalogue — so the shop shows working gift tiers out of the box. The admin editor opens with exactly these
// picks; saving them (changed or not) stores the tiers and the automatic choice is never used again.
//
// Stable (R2-L2): the picks are stored (settings row "_autoGifts") and a picked product stays a gift as long as it is
// still eligible (exists, in stock, has a picture, not 18+) — price or stock changes elsewhere in the catalogue never
// swap it for another one, so a gift a shopper already chose stays valid. Only a gift that became ineligible is
// replaced (with the best new candidate). Re-checked once per catalogue version.
import "server-only";
import { catalogDb, storeDb } from "./db";
import { DEFAULT_GIFT_TIERS, type GiftTierSettings } from "./settings-types";

type Pick = {
  /** Subcategory slugs to take products from. */
  from: string[];
  /** How many products (one per family and, when possible, per brand). */
  take: number;
  /** The product name must match… */
  match?: RegExp;
  /** …and must not match. */
  avoid?: RegExp;
};

/** A price band (EUR, catalogue price) and what to pick for one tier. */
type Plan = { min: number; max: number; picks: Pick[] };

const SHAKER = /shaker|шейкър|bottle|бутилк/i;

// By tier position (the lowest threshold first); tiers above the third use the last plan.
const PLANS: Plan[] = [
  // ~40 €: a protein bar, a snack or a single-serve sachet (≤ 5 €).
  {
    min: 0,
    max: 5,
    picks: [
      { from: ["proteinovi-barove"], take: 4, avoid: /\bbox\b|кутия|\bx\s?\d{2}\b|\d{2}\s?x\b/i },
      { from: ["elektroliti-i-vaglehidrati", "yadkovi-masla", "zakuska"], take: 2 },
    ],
  },
  // ~60 €: a shaker or a small supplement (5–10 €).
  {
    min: 5,
    max: 10,
    picks: [
      { from: ["sheykari-i-butilki"], take: 3, match: SHAKER },
      { from: ["vitamin-c", "vitamin-d", "magnezii", "tsink"], take: 2 },
    ],
  },
  // ~80 €: a better item (10–20 €): creatine, a multivitamin / BCAA / L-carnitine, a premium shaker.
  {
    min: 10,
    max: 20,
    picks: [
      { from: ["kreatin-monohidrat"], take: 2 },
      { from: ["multivitamini", "bcaa", "l-karnitin"], take: 2 },
      { from: ["sheykari-i-butilki"], take: 1, match: SHAKER },
    ],
  },
];

type Row = { sku: string; name: string; brand_slug: string | null; card_id: number | null };

/** How many gifts a tier's plan picks in total. */
const planSize = (plan: Plan) => plan.picks.reduce((n, p) => n + p.take, 0);

/** SKUs for one tier; `taken` / `families` are shared by all tiers so no product (or family) is offered twice. */
function pickSkus(plan: Plan, taken: Set<string>, families: Set<number>): string[] {
  const db = catalogDb();
  const out: string[] = [];
  for (const pick of plan.picks) {
    const rows = db
      .prepare(
        `SELECT sku, name, brand_slug, card_id FROM products
         WHERE subcategory IN (${pick.from.map(() => "?").join(",")}) AND image IS NOT NULL AND stock >= 3 AND adult_only = 0
           AND price > ? AND price <= ?
         ORDER BY popularity DESC, id LIMIT 300`,
      )
      .all(...pick.from, plan.min, plan.max) as Row[];
    const ok = rows.filter((r) => !taken.has(r.sku) && (!pick.match || pick.match.test(r.name)) && !pick.avoid?.test(r.name));
    const chosen: Row[] = [];
    const brands = new Set<string>();
    // First one per family and brand (variety), then fill up with other families of the same brands.
    for (const pass of [true, false]) {
      for (const r of ok) {
        if (chosen.length >= pick.take) break;
        if (chosen.includes(r) || (r.card_id !== null && families.has(r.card_id))) continue;
        if (pass && r.brand_slug && brands.has(r.brand_slug)) continue;
        chosen.push(r);
        if (r.card_id !== null) families.add(r.card_id);
        if (r.brand_slug) brands.add(r.brand_slug);
      }
    }
    for (const r of chosen) {
      out.push(r.sku);
      taken.add(r.sku);
    }
  }
  return out;
}

/** Settings row with the picks in use: tier id → SKUs (internal, not a SettingKey). */
const STORE_KEY = "_autoGifts";

function storedPicks(): Record<string, string[]> {
  try {
    const row = storeDb().prepare("SELECT value FROM settings WHERE key = ?").get(STORE_KEY) as { value: string } | undefined;
    const v: unknown = row ? JSON.parse(row.value) : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, skus]) => Array.isArray(skus))
        .map(([id, skus]) => [id, (skus as unknown[]).filter((x): x is string => typeof x === "string")]),
    );
  } catch {
    return {};
  }
}

function storePicks(picks: Record<string, string[]>) {
  storeDb()
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(STORE_KEY, JSON.stringify(picks), new Date().toISOString());
}

/** Of these SKUs, the ones still fine as an automatic gift (exist, stock ≥ 1, pictured, not 18+), with their family. */
function stillEligible(skus: string[]): Map<string, number | null> {
  if (!skus.length) return new Map();
  const rows = catalogDb()
    .prepare(`SELECT sku, card_id FROM products WHERE sku IN (${skus.map(() => "?").join(",")}) AND stock >= 1 AND image IS NOT NULL AND adult_only = 0`)
    .all(...skus) as { sku: string; card_id: number | null }[];
  return new Map(rows.map((r) => [r.sku, r.card_id]));
}

const g = globalThis as unknown as { __catalogWrites?: number; __autoGifts?: { key: string; value: GiftTierSettings } };

/** The default gift tiers with automatically picked gifts (`automatic: true`). */
export function automaticGiftTiers(): GiftTierSettings {
  let key: string;
  try {
    key = `${catalogDb().pragma("data_version", { simple: true }) as number}:${g.__catalogWrites ?? 0}`;
  } catch {
    return { ...DEFAULT_GIFT_TIERS, automatic: true };
  }
  if (g.__autoGifts?.key === key) return g.__autoGifts.value;
  let value: GiftTierSettings;
  try {
    const sorted = [...DEFAULT_GIFT_TIERS.tiers].sort((a, b) => a.threshold - b.threshold);
    // Keep every earlier pick that is still eligible (in its tier and order); then fill each tier up to its size.
    const before = storedPicks();
    const ok = stillEligible([...new Set(sorted.flatMap((t) => before[t.id] ?? []))]);
    const taken = new Set<string>();
    const families = new Set<number>();
    const kept = sorted.map((t) =>
      (before[t.id] ?? []).filter((sku) => {
        if (!ok.has(sku) || taken.has(sku)) return false;
        taken.add(sku);
        const family = ok.get(sku);
        if (family !== null && family !== undefined) families.add(family);
        return true;
      }),
    );
    const tiers = sorted.map((t, i) => {
      const plan = PLANS[Math.min(i, PLANS.length - 1)];
      const size = planSize(plan);
      const fresh = kept[i].length < size ? pickSkus(plan, taken, families) : [];
      return { ...t, skus: [...kept[i], ...fresh].slice(0, size) };
    });
    const picks = Object.fromEntries(tiers.map((t) => [t.id, t.skus]));
    if (JSON.stringify(picks) !== JSON.stringify(Object.fromEntries(sorted.map((t) => [t.id, before[t.id] ?? []])))) storePicks(picks);
    value = { ...DEFAULT_GIFT_TIERS, tiers, automatic: true };
  } catch {
    // The catalogue is being rebuilt (or is empty): no gifts until it is back.
    value = { ...DEFAULT_GIFT_TIERS, automatic: true };
  }
  g.__autoGifts = { key, value };
  return value;
}
