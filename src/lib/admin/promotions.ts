// Percentage promotions (Admin → Цени и промоции → Промоции): store.db `promotions` rows, their status, how many
// products they reach, and a dry run ("Провери какво ще се промени"). The prices themselves are always computed by
// the price engine (lib/price-engine.ts via recomputePrices()) — the caller runs it after every change.
//
// Start / end are stored as Bulgarian local time "YYYY-MM-DDTHH:mm" (what the admin typed; the engine reads it as
// Europe/Sofia), or NULL = "from now" / "no end".
import "server-only";
import { catalogDb, storeDb } from "@/lib/db";
import { findCategoryIn, mergeCategories, mergeGoals } from "@/lib/categories";
import { getCategoriesConfig, getGoalsConfig } from "@/lib/settings";
import { normL10n, type L10n } from "@/lib/l10n";
import { loadPromotions, parseWhen, promotionPrice, type Promotion } from "@/lib/price-engine";

export type PromotionScope = "all" | "category" | "brand" | "goal" | "skus";
export const PROMOTION_SCOPES: PromotionScope[] = ["all", "category", "brand", "goal", "skus"];
export type PromotionStatus = "active" | "scheduled" | "ended" | "off";

/** A product picked for a "specific products" promotion (shown in the editor). */
export type PromoProduct = { sku: string; name: string; variant: string | null; image: string | null; price: number; hidden: boolean };

/** What the editor sends (and gets back to edit). */
export type PromotionInput = {
  id: number | null;
  name: string;
  percent: number | string;
  scope: PromotionScope;
  /** Category / brand / goal slugs, or SKUs for "skus". */
  values: string[];
  round99: boolean;
  /** "YYYY-MM-DDTHH:mm" Bulgarian time, "" = from now. */
  startsAt: string;
  /** "YYYY-MM-DDTHH:mm" Bulgarian time, "" = no end. */
  endsAt: string;
  badge: L10n;
  enabled: boolean;
};

export type PromotionRow = Omit<PromotionInput, "id" | "percent"> & {
  id: number;
  percent: number;
  status: PromotionStatus;
  /** Visible products in scope. */
  inScope: number;
  /** Visible products whose price comes from this promotion right now. */
  applied: number;
  /** Picked products (scope "skus" only). */
  products: PromoProduct[];
  updatedAt: string;
};

export type PromotionPreview = {
  inScope: number;
  /** Products that get a lower price from this promotion. */
  willChange: number;
  /** Products already at (or below) the promotional price — a manual sale or another promotion is cheaper. */
  alreadyCheaper: number;
  /** `base` = regular price, `before` = price without this promotion, `percent` = real reduction from `base`. */
  samples: { sku: string; name: string; base: number; before: number; after: number; percent: number }[];
  cheaperSamples: { sku: string; name: string; current: number; promo: number }[];
  /** "now": applies right away; "later": from startsAt; "ended": the end has passed; "off": switched off. */
  timing: "now" | "later" | "ended" | "off";
  /** Lowest and highest real reduction from the regular price (%, one decimal) of the products that get cheaper. */
  percentRange: { min: number; max: number } | null;
  /** Products whose real reduction is more than 2 percentage points away from the promotion's % (,99 rounding). */
  drifting: number;
  /** The badge text promises this exact reduction ("−20 %"), or null. */
  badgePercent: number | null;
};

type Row = {
  id: number;
  name: string;
  percent: number;
  scope: string;
  scope_value: string | null;
  round99: number;
  starts_at: string | null;
  ends_at: string | null;
  enabled: number;
  badge: string | null;
  updated_at: string;
};

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX_SKUS = 500;
const MAX_VALUES = 30;

function parseValues(v: string | null): string[] {
  if (!v) return [];
  try {
    const x: unknown = JSON.parse(v);
    if (Array.isArray(x)) return x.filter((s): s is string => typeof s === "string");
  } catch {
    // older plain lists
  }
  return v.split(/[\s,;]+/).filter(Boolean);
}

function parseBadge(v: string | null): L10n {
  if (!v) return { bg: "", en: "" };
  try {
    return normL10n(JSON.parse(v), 30);
  } catch {
    return { bg: v.slice(0, 30), en: "" };
  }
}

export function promotionStatus(p: { enabled: boolean; startsAt: string; endsAt: string }, now = new Date()): PromotionStatus {
  if (!p.enabled) return "off";
  const end = parseWhen(p.endsAt, true);
  if (end && end <= now) return "ended";
  const start = parseWhen(p.startsAt);
  if (start && start > now) return "scheduled";
  return "active";
}

/** Bulgarian local time "YYYY-MM-DDTHH:mm" of an instant (minutes rounded down). */
export function sofiaLocal(d = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ---------------------------------------------------------------------------
// Scope → SQL (the same rules as the price engine's inScope)

function scopeSql(scope: PromotionScope, values: string[]): { where: string; params: string[] } {
  const list = (n: number) => Array(n).fill("?").join(",");
  switch (scope) {
    case "all":
      return { where: "1", params: [] };
    case "category":
      return values.length ? { where: `(category IN (${list(values.length)}) OR subcategory IN (${list(values.length)}))`, params: [...values, ...values] } : { where: "0", params: [] };
    case "brand":
      return values.length ? { where: `brand_slug IN (${list(values.length)})`, params: values } : { where: "0", params: [] };
    case "goal":
      return values.length
        ? { where: `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(goals) THEN goals ELSE '[]' END) g WHERE g.value IN (${list(values.length)}))`, params: values }
        : { where: "0", params: [] };
    case "skus":
      return values.length ? { where: `sku IN (${list(values.length)})`, params: values } : { where: "0", params: [] };
  }
}

function countInScope(scope: PromotionScope, values: string[]): number {
  const s = scopeSql(scope, values);
  return (catalogDb().prepare(`SELECT COUNT(*) AS n FROM products WHERE hidden = 0 AND ${s.where}`).get(...s.params) as { n: number }).n;
}

function variantName(r: { name: string; flavour: string | null; size_label: string | null }): string {
  const v = [r.flavour, r.size_label].filter(Boolean).join(" · ");
  return v ? `${r.name} (${v})` : r.name;
}

function productsBySku(skus: string[]): PromoProduct[] {
  if (!skus.length) return [];
  const rows = catalogDb()
    .prepare(`SELECT sku, name, flavour, size_label, image, price, hidden FROM products WHERE sku IN (${skus.map(() => "?").join(",")})`)
    .all(...skus) as { sku: string; name: string; flavour: string | null; size_label: string | null; image: string | null; price: number; hidden: number }[];
  const bySku = new Map(rows.map((r) => [r.sku, r]));
  return skus
    .map((sku) => bySku.get(sku))
    .filter((r) => !!r)
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      variant: [r.flavour, r.size_label].filter(Boolean).join(" · ") || null,
      image: r.image,
      price: r.price,
      hidden: !!r.hidden,
    }));
}

// ---------------------------------------------------------------------------
// Read

export function listPromotions(now = new Date()): PromotionRow[] {
  const rows = storeDb().prepare("SELECT * FROM promotions ORDER BY id DESC").all() as Row[];
  const applied = new Map(
    (catalogDb().prepare("SELECT promo_id AS id, COUNT(*) AS n FROM products WHERE promo_id IS NOT NULL AND hidden = 0 GROUP BY promo_id").all() as { id: number; n: number }[]).map(
      (r) => [r.id, r.n],
    ),
  );
  return rows.map((r) => {
    const scope = (PROMOTION_SCOPES as string[]).includes(r.scope) ? (r.scope as PromotionScope) : "all";
    const values = parseValues(r.scope_value);
    const base = { enabled: !!r.enabled, startsAt: r.starts_at ?? "", endsAt: r.ends_at ?? "" };
    return {
      id: r.id,
      name: r.name,
      percent: r.percent,
      scope,
      values,
      round99: !!r.round99,
      ...base,
      badge: parseBadge(r.badge),
      status: promotionStatus(base, now),
      inScope: countInScope(scope, values),
      applied: applied.get(r.id) ?? 0,
      products: scope === "skus" ? productsBySku(values.slice(0, MAX_SKUS)) : [],
      updatedAt: r.updated_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Validate + write

export type CleanPromotion = Omit<PromotionInput, "percent"> & { percent: number };

export function validatePromotion(raw: unknown): { value: CleanPromotion } | { error: string; field?: string } {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const id = typeof r.id === "number" && Number.isInteger(r.id) && r.id > 0 ? r.id : null;
  const name = String(r.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return { error: "Дайте име на промоцията (напр. „Black Friday 2026“) — вижда се само тук.", field: "name" };
  const percent = Math.round(Number(String(r.percent ?? "").replace(",", ".").trim()) * 100) / 100;
  if (!Number.isFinite(percent) || percent < 1 || percent > 90) return { error: "Отстъпката трябва да е между 1 и 90 %.", field: "percent" };
  const scope = (PROMOTION_SCOPES as unknown[]).includes(r.scope) ? (r.scope as PromotionScope) : null;
  if (!scope) return { error: "Изберете за кои продукти важи промоцията.", field: "scope" };

  const rawValues = Array.isArray(r.values) ? [...new Set(r.values.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))] : [];
  let values: string[] = [];
  if (scope === "category") {
    const cats = mergeCategories(getCategoriesConfig());
    values = rawValues.filter((v) => findCategoryIn(cats, v)).slice(0, MAX_VALUES);
    if (!values.length) return { error: "Изберете поне една категория.", field: "values" };
  } else if (scope === "brand") {
    const known = new Set((catalogDb().prepare("SELECT slug FROM brands").all() as { slug: string }[]).map((b) => b.slug));
    values = rawValues.filter((v) => known.has(v)).slice(0, MAX_VALUES);
    if (!values.length) return { error: "Изберете поне една марка от списъка.", field: "values" };
  } else if (scope === "goal") {
    const goals = new Set(mergeGoals(getGoalsConfig()).map((g) => g.slug));
    values = rawValues.filter((v) => goals.has(v)).slice(0, MAX_VALUES);
    if (!values.length) return { error: "Изберете поне една цел.", field: "values" };
  } else if (scope === "skus") {
    const wanted = rawValues.slice(0, MAX_SKUS);
    const found = new Set(productsBySku(wanted).map((p) => p.sku));
    values = wanted.filter((s) => found.has(s));
    if (!values.length) return { error: "Добавете поне един продукт.", field: "values" };
  }

  const startsAt = String(r.startsAt ?? "").trim();
  const endsAt = String(r.endsAt ?? "").trim();
  if (startsAt && (!LOCAL_RE.test(startsAt) || !parseWhen(startsAt))) return { error: "Невалидна начална дата.", field: "startsAt" };
  if (endsAt && (!LOCAL_RE.test(endsAt) || !parseWhen(endsAt, true))) return { error: "Невалидна крайна дата.", field: "endsAt" };
  if (startsAt && endsAt && parseWhen(endsAt, true)! <= parseWhen(startsAt)!) return { error: "Краят трябва да е след началото.", field: "endsAt" };

  return {
    value: {
      id,
      name,
      percent,
      scope,
      values,
      round99: r.round99 === true,
      startsAt,
      endsAt,
      badge: normL10n(r.badge, 30),
      enabled: r.enabled !== false,
    },
  };
}

/** Insert or update; returns the id (null when the promotion to update no longer exists). */
export function savePromotion(p: CleanPromotion): number | null {
  const db = storeDb();
  const now = new Date().toISOString();
  const params = [
    p.name,
    p.percent,
    p.scope,
    p.scope === "all" ? null : JSON.stringify(p.values),
    p.round99 ? 1 : 0,
    p.startsAt || null,
    p.endsAt || null,
    p.enabled ? 1 : 0,
    p.badge.bg ? JSON.stringify(p.badge) : null,
  ];
  if (p.id) {
    const r = db
      .prepare("UPDATE promotions SET name = ?, percent = ?, scope = ?, scope_value = ?, round99 = ?, starts_at = ?, ends_at = ?, enabled = ?, badge = ?, updated_at = ? WHERE id = ?")
      .run(...params, now, p.id);
    return r.changes ? p.id : null;
  }
  const r = db
    .prepare(
      "INSERT INTO promotions (name, percent, scope, scope_value, round99, starts_at, ends_at, enabled, badge, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(...params, now, now);
  return Number(r.lastInsertRowid);
}

export function deletePromotion(id: number): boolean {
  return storeDb().prepare("DELETE FROM promotions WHERE id = ?").run(id).changes > 0;
}

/** A switched-off copy ("… (копие)") to adjust and start again. Returns the new id. */
export function duplicatePromotion(id: number): number | null {
  const db = storeDb();
  const r = db.prepare("SELECT * FROM promotions WHERE id = ?").get(id) as Row | undefined;
  if (!r) return null;
  const now = new Date().toISOString();
  const res = db
    .prepare(
      "INSERT INTO promotions (name, percent, scope, scope_value, round99, starts_at, ends_at, enabled, badge, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?)",
    )
    .run(`${r.name} (копие)`.slice(0, 80), r.percent, r.scope, r.scope_value, r.round99, r.badge, now, now);
  return Number(res.lastInsertRowid);
}

/** Stop now: a running promotion ends this minute; a scheduled one is switched off. */
export function stopPromotion(id: number): boolean {
  const db = storeDb();
  const r = db.prepare("SELECT enabled, starts_at, ends_at FROM promotions WHERE id = ?").get(id) as { enabled: number; starts_at: string | null; ends_at: string | null } | undefined;
  if (!r) return false;
  const now = new Date().toISOString();
  const status = promotionStatus({ enabled: !!r.enabled, startsAt: r.starts_at ?? "", endsAt: r.ends_at ?? "" });
  if (status === "active") db.prepare("UPDATE promotions SET ends_at = ?, updated_at = ? WHERE id = ?").run(sofiaLocal(), now, id);
  else db.prepare("UPDATE promotions SET enabled = 0, updated_at = ? WHERE id = ?").run(now, id);
  return true;
}

// ---------------------------------------------------------------------------
// Dry run: what prices would the promotion give, compared with what each product would cost without it?

const cents = (x: number) => Math.round(x * 100) / 100;
/** Reduction from the regular price in %, one decimal. */
const percentOff = (price: number, base: number) => Math.round((1 - price / base) * 1000) / 10;
/** How far (percentage points) the ,99 rounding may move a product's reduction before the preview warns. */
const DRIFT_POINTS = 2;

/** "−20 %", "-20%", "20% off" in a badge → 20 (the badge then promises that exact reduction); null otherwise. */
function badgePercent(badge: L10n): number | null {
  for (const text of [badge.bg, badge.en]) {
    const m = /(\d{1,2}(?:[.,]\d+)?)\s*%/.exec(text ?? "");
    if (m) return Number(m[1].replace(",", "."));
  }
  return null;
}

type PreviewRow = {
  sku: string;
  name: string;
  flavour: string | null;
  size_label: string | null;
  category: string;
  subcategory: string | null;
  brand_slug: string | null;
  goals: string;
  base_price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  price: number;
};

function goalsOf(v: string): string[] {
  try {
    const x: unknown = JSON.parse(v || "[]");
    return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function inScope(p: Promotion, r: PreviewRow): boolean {
  switch (p.scope) {
    case "all":
      return true;
    case "category":
      return p.values.has(r.category) || (!!r.subcategory && p.values.has(r.subcategory));
    case "brand":
      return !!r.brand_slug && p.values.has(r.brand_slug);
    case "goal":
      return goalsOf(r.goals).some((g) => p.values.has(g));
    case "skus":
      return p.values.has(r.sku);
  }
}

export function previewPromotion(p: CleanPromotion, now = new Date()): PromotionPreview {
  const status = promotionStatus(p, now);
  const timing: PromotionPreview["timing"] = status === "active" ? "now" : status === "scheduled" ? "later" : status;
  // Compare at the moment the promotion starts (or now), with every OTHER promotion active at that moment.
  const at = status === "scheduled" ? parseWhen(p.startsAt)! : now;
  const others = loadPromotions(storeDb()).filter(
    (o) => o.id !== p.id && (!o.startsAt || o.startsAt <= at) && (!o.endsAt || o.endsAt > at),
  );
  const s = scopeSql(p.scope, p.values);
  const rows = catalogDb()
    .prepare(
      `SELECT sku, name, flavour, size_label, category, subcategory, brand_slug, goals, base_price, sale_price, sale_ends_at, price
       FROM products WHERE hidden = 0 AND ${s.where} ORDER BY popularity DESC`,
    )
    .all(...s.params) as PreviewRow[];

  const out: PromotionPreview = {
    inScope: rows.length,
    willChange: 0,
    alreadyCheaper: 0,
    samples: [],
    cheaperSamples: [],
    timing,
    percentRange: null,
    drifting: 0,
    badgePercent: badgePercent(p.badge),
  };
  type Sample = PromotionPreview["samples"][number];
  let lowest: Sample | null = null;
  let highest: Sample | null = null;
  for (const r of rows) {
    const base = cents(r.base_price > 0 ? r.base_price : r.price);
    let without = base;
    const saleEnds = parseWhen(r.sale_ends_at, true);
    if (r.sale_price != null && r.sale_price > 0 && r.sale_price < base && (!saleEnds || saleEnds > at)) without = cents(r.sale_price);
    for (const o of others) {
      if (!inScope(o, r)) continue;
      const x = promotionPrice(base, o.percent, o.round99);
      if (x < without) without = x;
    }
    const promo = promotionPrice(base, p.percent, p.round99);
    if (promo < without) {
      out.willChange++;
      const sample: Sample = { sku: r.sku, name: variantName(r), base, before: without, after: promo, percent: percentOff(promo, base) };
      if (Math.abs(sample.percent - p.percent) > DRIFT_POINTS) out.drifting++;
      if (!lowest || sample.percent < lowest.percent) lowest = sample;
      if (!highest || sample.percent > highest.percent) highest = sample;
      if (out.samples.length < 8) out.samples.push(sample);
    } else {
      out.alreadyCheaper++;
      if (out.cheaperSamples.length < 3) out.cheaperSamples.push({ sku: r.sku, name: variantName(r), current: without, promo });
    }
  }
  if (lowest && highest) {
    out.percentRange = { min: lowest.percent, max: highest.percent };
    // Show the extremes too when the real reductions spread (the ,99 rounding on cheap products).
    for (const s of [lowest, highest]) if (lowest.percent !== highest.percent && !out.samples.some((x) => x.sku === s.sku)) out.samples.push(s);
  }
  return out;
}

/** Everything the scope pickers offer: categories (with subcategories), brands, goals. */
export function promotionScopeOptions() {
  const categories = mergeCategories(getCategoriesConfig()).map((c) => ({ slug: c.slug, name: c.name.bg, subs: c.subs.map((s) => ({ slug: s.slug, name: s.name.bg })) }));
  const brands = catalogDb().prepare("SELECT slug, name, count FROM brands ORDER BY count DESC, name COLLATE NOCASE").all() as { slug: string; name: string; count: number }[];
  const goals = mergeGoals(getGoalsConfig()).map((g) => ({ slug: g.slug, name: g.name.bg }));
  return { categories, brands, goals };
}
export type PromotionScopeOptions = ReturnType<typeof promotionScopeOptions>;
