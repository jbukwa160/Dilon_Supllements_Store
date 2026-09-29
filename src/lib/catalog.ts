// Catalogue reads for the storefront (SPEC §5.4): listings with facets, product pages, shelves, navigation.
// Everything is localized by `lang` (name_en / description_en / flavour_en when set) and shows ONE card per family
// (the primary product; "от" price and flavour count from product_groups).
import "server-only";
import { cache } from "react";
import type { Lang } from "@/i18n/config";
import { EMPTY_FILTERS } from "./catalog-types";
import type {
  BrandInfo,
  CartSnapshot,
  CategoryNode,
  Facet,
  GoalInfo,
  ListingFilters,
  ListingResult,
  ListingScope,
  ListingSort,
  ManufacturerInfo,
  NutritionRow,
  ProductCard,
  ProductDetail,
  ProductForm,
  ProductKind,
  ProductVariant,
} from "./catalog-types";
import { catalogDb } from "./db";
import { getManufacturer } from "./manufacturers";
import { getCategoriesConfig, getGoalsConfig, getSettings } from "./settings";
import { findCategoryIn, mergeCategories, mergeGoals, type CategoryEntry, type GoalEntry } from "./categories";
import { loc, type L10n } from "./l10n";
import { formatPrice } from "./format";
import { PRICE_BUCKETS } from "./params";
import { ensurePricesFresh } from "./pricing-rules";
import { queryWords, searchMatchSql, stem } from "./search-query";
import { DIETS, FORMS, importedCategorySlugs } from "./taxonomy";
import { flavourEn, sizeLabelEn } from "./variants";
import { flavourSlug } from "./catalog-sync";

export const PER_PAGE = 36;
/** A product counts as new for this many days after it first appeared in the export. */
const NEW_DAYS = 45;
/** The "Нови" listing: this many newest cards. */
const NEW_LIMIT = 600;

// ---------------------------------------------------------------------------
// Categories and goals as edited in the admin (merged with the built-in taxonomy)

export const getCategoryEntries = cache((): CategoryEntry[] => mergeCategories(getCategoriesConfig()));
export const getGoalEntries = cache((): GoalEntry[] => mergeGoals(getGoalsConfig()));

// ---------------------------------------------------------------------------
// "Скрий продукти без снимка" (Настройки → Продукти в магазина, on by default): a card without a picture is left out
// of every storefront listing, facet, count, search suggestion, blog / gift card and the sitemap. It is a read-time
// filter on listing.has_image (the family's primary product has a picture), so switching it needs no rebuild; the
// admin panel reads the catalogue directly and still sees everything. Shelves always required a picture.

/** True when products without a picture are hidden from the shop (setting `hideNoImage`). */
export function hidesNoImage(): boolean {
  return getSettings().hideNoImage;
}

/** SQL condition on a `products` alias that is shown in the shop: not hidden and — when the setting is on — with a picture. */
export function shopVisibleSql(alias = "p"): string {
  return hidesNoImage() ? `${alias}.hidden = 0 AND ${alias}.image IS NOT NULL` : `${alias}.hidden = 0`;
}

// ---------------------------------------------------------------------------
// Cards

type CardRow = {
  id: number;
  sku: string;
  slug: string;
  name: string;
  name_en: string | null;
  brand: string | null;
  brand_slug: string | null;
  image: string | null;
  price: number;
  old_price: number | null;
  lowest30: number | null;
  stock: number;
  group_id: number | null;
  is_primary: number;
  category: string;
  subcategory: string | null;
  form: ProductForm | null;
  created_at: string | null;
  bestseller: number;
  featured: number;
  promo_label: string | null;
  flavour: string | null;
  flavour_en: string | null;
  size_label: string | null;
  size_value: number | null;
  size_unit: string | null;
  /** p.adult_only (aliased: the detail / snapshot queries select adult_only themselves). */
  adult: number;
  variant_count: number | null;
  flavour_count: number | null;
  min_price: number | null;
  max_price: number | null;
  in_stock_any: number | null;
  min_old_price: number | null;
  min_lowest30: number | null;
  /** The family's display name (members' name without flavour / size). */
  g_name: string | null;
  g_name_en: string | null;
};

const CARD_COLS = `p.id, p.sku, p.slug, p.name, p.name_en, p.brand, p.brand_slug, p.image, p.price, p.old_price, p.lowest30, p.stock,
  p.group_id, p.is_primary, p.category, p.subcategory, p.form, p.created_at, p.bestseller, p.featured, p.promo_label, p.flavour,
  p.flavour_en, p.size_label, p.size_value, p.size_unit, p.adult_only AS adult, g.variant_count, g.flavour_count, g.min_price, g.max_price,
  g.in_stock_any, g.min_old_price, g.min_lowest30, g.name AS g_name, g.name_en AS g_name_en`;
const CARD_FROM = "products p LEFT JOIN product_groups g ON g.id = p.group_id";

function newSince(): string {
  return new Date(Date.now() - NEW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function parseL10n(v: string | null): L10n | null {
  if (!v) return null;
  try {
    const x: unknown = JSON.parse(v);
    if (typeof x === "string") return { bg: x, en: "" };
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return { bg: typeof o.bg === "string" ? o.bg : "", en: typeof o.en === "string" ? o.en : "" };
    }
  } catch {
    return { bg: v, en: "" };
  }
  return null;
}

function flavourOf(r: { flavour: string | null; flavour_en: string | null }, lang: Lang): string | null {
  // English: the stored translation, else the dictionary's (a flavour typed in the admin), else as stored.
  return (lang === "en" ? r.flavour_en || flavourEn(r.flavour) || r.flavour : r.flavour) || null;
}

/** Product name as shown: a family member shows its family's name (the variant label says flavour and size). */
function nameOf(r: Pick<CardRow, "name" | "name_en" | "group_id" | "g_name" | "g_name_en">, lang: Lang): string {
  if (r.group_id !== null && r.g_name) return (lang === "en" && r.g_name_en) || r.g_name;
  return (lang === "en" && r.name_en) || r.name;
}

function sizeOf(r: { size_label: string | null }, lang: Lang): string | null {
  if (!r.size_label) return null;
  return lang === "en" ? sizeLabelEn(r.size_label) : r.size_label;
}

/** "Шоколад · 1 кг" */
function variantLabelOf(r: { flavour: string | null; flavour_en: string | null; size_label: string | null }, lang: Lang): string {
  return [flavourOf(r, lang), sizeOf(r, lang)].filter(Boolean).join(" · ");
}

/**
 * A card. A family's card (listings) shows the family's representative variant — the cheapest in-stock main size,
 * whose price, old price and Omnibus price go together ("от" when the variants' prices differ). `own` shows this
 * very variant instead (the product page); `single` also presents it as a product of its own — a SKU picked for a
 * gift idea or a blog post: its flavour / size under the name and a direct "add to cart".
 */
function toCard(r: CardRow, lang: Lang, own = false, single = false): ProductCard {
  const family = r.group_id !== null && r.variant_count !== null;
  const rep = family && !own && r.min_price !== null;
  const priceFrom = rep && r.max_price !== null && r.max_price - r.min_price! > 0.001;
  const price = rep ? r.min_price! : r.price;
  const oldPrice = rep ? r.min_old_price : r.old_price;
  const since = newSince();
  const promo = parseL10n(r.promo_label);
  // A unit price only when the shown price is this row's own (its pack size).
  const ownPrice = !priceFrom && Math.abs(price - r.price) < 0.001;
  return {
    id: r.id,
    sku: r.sku,
    slug: r.slug,
    name: nameOf(r, lang),
    variantLabel: family ? variantLabelOf(r, lang) || null : null,
    brand: r.brand,
    brandSlug: r.brand_slug,
    image: r.image,
    price,
    oldPrice,
    lowest30: oldPrice !== null ? (rep ? r.min_lowest30 : r.lowest30) : null,
    priceFrom,
    stock: r.stock,
    inStockAny: family && !single ? !!r.in_stock_any : r.stock > 0,
    groupId: r.group_id,
    variantCount: family && !single ? (r.variant_count ?? 1) : 1,
    flavourCount: family && !single ? (r.flavour_count ?? 0) : 0,
    categorySlug: r.subcategory ?? r.category,
    form: r.form,
    isNew: !!r.created_at && r.created_at >= since,
    isBestseller: !!r.bestseller || !!r.featured,
    promoLabel: promo ? loc(promo, lang) || null : null,
    sizeValue: ownPrice ? r.size_value : null,
    sizeUnit: ownPrice && (r.size_unit === "g" || r.size_unit === "ml") ? r.size_unit : null,
    adultOnly: !!r.adult,
  };
}

// ---------------------------------------------------------------------------
// Listing: one SQL builder over the narrow `listing` table (one row per visible card), reused for the results AND
// each facet (each facet omits its own filter, so the other options stay selectable).

type FacetOmit = "brand" | "price" | "category" | "goal" | "forms" | "flavours" | "diets" | "toggles" | null;
type Built = { sql: string; params: unknown[]; searchable: boolean };

const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");

/** Cards (listing ids) tagged with one of `values`. */
function tagClause(kind: string, values: string[]): string {
  return `l.id IN (SELECT product_id FROM product_tags WHERE kind = '${kind}' AND value IN (${inList(values.length)}))`;
}

/**
 * Search matches mapped to cards (hidden products dropped, a matching variant brings up its family's card), evaluated
 * ONCE per listing and passed to every query as JSON: [[cardId, exact, rank, inname], …].
 */
function searchMatches(q: string): string | null {
  const m = searchMatchSql(q);
  if (!m) return null;
  const rows = catalogDb()
    .prepare(
      `WITH m0 AS (${m.sql}) SELECT v.card_id AS id, MAX(m0.exact) AS exact, MIN(m0.rank) AS rank, MAX(m0.inname) AS inname
       FROM m0 JOIN products v ON v.id = m0.id WHERE v.hidden = 0 AND v.card_id IS NOT NULL GROUP BY v.card_id`,
    )
    .all(...m.params) as { id: number; exact: number; rank: number | null; inname: number }[];
  return JSON.stringify(rows.map((r) => [r.id, r.exact, r.rank ?? 0, r.inname]));
}

function build(scope: ListingScope, f: ListingFilters, omit: FacetOmit = null, matches?: string | null): Built | null {
  const cteParams: unknown[] = [];
  const params: unknown[] = [];
  const where: string[] = ["1"];
  let cte = "";
  let from = "listing l";

  switch (scope.kind) {
    case "category": {
      const c = findCategoryIn(getCategoryEntries(), scope.slug);
      if (!c) return null;
      if (c.sub) {
        where.push("l.category = ? AND l.subcategory = ?");
        params.push(c.category.slug, c.sub.slug);
      } else {
        where.push("l.category = ?");
        params.push(c.category.slug);
      }
      break;
    }
    case "brand":
      where.push("l.brand_slug = ?");
      params.push(scope.slug);
      break;
    case "goal":
      where.push(tagClause("goal", [scope.slug]));
      params.push(scope.slug);
      break;
    case "sale":
      where.push("l.on_sale = 1");
      break;
    case "new":
      where.push(`l.id IN (SELECT id FROM listing${hidesNoImage() ? " WHERE has_image = 1" : ""} ORDER BY created_at DESC, id DESC LIMIT ${NEW_LIMIT})`);
      break;
    case "skus": {
      const skus = [...new Set(scope.skus)].slice(0, 500);
      if (!skus.length) return null;
      where.push(`l.id IN (SELECT card_id FROM products WHERE sku IN (${inList(skus.length)}))`);
      params.push(...skus);
      break;
    }
    case "search": {
      const json = matches === undefined ? searchMatches(scope.q) : matches;
      if (!json) return null;
      cte = "WITH m AS (SELECT value ->> 0 AS id, value ->> 1 AS exact, value ->> 2 AS rank, value ->> 3 AS inname FROM json_each(?)) ";
      from += " JOIN m ON m.id = l.id";
      cteParams.push(json);
      break;
    }
    case "all":
      break;
  }
  if (hidesNoImage()) where.push("l.has_image = 1");

  if (omit !== "brand" && f.brands.length) {
    where.push(`l.brand_slug IN (${inList(f.brands.length)})`);
    params.push(...f.brands);
  }
  if (omit !== "price" && f.price) {
    const b = PRICE_BUCKETS.find((x) => x.key === f.price);
    if (b) {
      where.push(b.max !== null ? "l.price >= ? AND l.price < ?" : "l.price >= ?");
      params.push(b.min, ...(b.max !== null ? [b.max] : []));
    }
  }
  if (omit !== "toggles" && f.inStock) where.push("l.in_stock = 1");
  if (omit !== "toggles" && f.sale) where.push("l.on_sale = 1");
  if (omit !== "category" && f.category) {
    where.push("(l.category = ? OR l.subcategory = ?)");
    params.push(f.category, f.category);
  }
  if (omit !== "goal" && f.goal) {
    where.push(tagClause("goal", [f.goal]));
    params.push(f.goal);
  }
  for (const [key, kind, values] of [
    ["forms", "form", f.forms],
    ["flavours", "flavour", f.flavours],
    ["diets", "diet", f.diets],
  ] as const) {
    if (omit !== key && values.length) {
      where.push(tagClause(kind, values));
      params.push(...values);
    }
  }
  return {
    sql: `${cte}SELECT {cols} FROM ${from} WHERE ${where.join(" AND ")}`,
    params: [...cteParams, ...params],
    searchable: scope.kind === "search",
  };
}

/**
 * Categories a search query names ("протеин" → Протеини, "whey" → Whey protein, "витамин D" → Витамин D): their
 * products rank first among the matches — 2 when the category name holds every typed word, 1 when it holds some
 * (the query's words, stemmed, against the words of the category's Bulgarian and English names). Returns an SQL
 * score expression over literal slugs (slugs are [a-z0-9-] only), or null.
 */
function categoryBoost(q: string): string | null {
  const words = [...new Set(queryWords(q))];
  if (!words.length) return null;
  const nameWords = (x: { name: L10n }) =>
    new Set(
      `${x.name.bg} ${x.name.en}`
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((w) => (w.length === 1 ? w : stem(w))),
    );
  const full: string[] = [];
  const some: string[] = [];
  for (const c of getCategoryEntries()) {
    for (const x of [c, ...c.subs]) {
      if (!/^[a-z0-9-]+$/.test(x.slug)) continue;
      const have = nameWords(x);
      const hits = words.filter((w) => have.has(w)).length;
      if (hits === words.length) full.push(x.slug);
      else if (words.some((w) => w.length > 1 && have.has(w))) some.push(x.slug);
    }
  }
  if (!full.length && !some.length) return null;
  const inAny = (slugs: string[]) => {
    const list = slugs.map((sl) => `'${sl}'`).join(",");
    return `(l.category IN (${list}) OR COALESCE(l.subcategory, '') IN (${list}))`;
  };
  return `(CASE${full.length ? ` WHEN ${inAny(full)} THEN 2` : ""}${some.length ? ` WHEN ${inAny(some)} THEN 1` : ""} ELSE 0 END)`;
}

/**
 * Search order: exact code hits, in stock, the categories the query names, every word in the NAME (not only a
 * category / flavour keyword), then the shop's own ranking (featured, popularity: pictures, well-known brands,
 * families) and only then the text score — so "whey" or "протеин" bring up the popular protein powders, not the
 * shortest name that happens to contain the word.
 */
function orderBy(sort: ListingSort, searchable: boolean, boost: string | null = null): string {
  switch (sort) {
    case "new":
      return "l.in_stock DESC, l.created_at DESC, l.id DESC";
    case "price-asc":
      return "l.in_stock DESC, l.price ASC, l.popularity DESC";
    case "price-desc":
      return "l.in_stock DESC, l.price DESC, l.popularity DESC";
    case "discount":
      return "l.in_stock DESC, l.discount DESC, l.popularity DESC";
    case "relevance":
      return searchable
        ? `m.exact DESC, l.in_stock DESC, ${boost ? `${boost} DESC, ` : ""}m.inname DESC, l.featured DESC, l.popularity DESC, m.rank`
        : "l.in_stock DESC, l.featured DESC, l.popularity DESC";
    default:
      return "l.in_stock DESC, l.featured DESC, l.popularity DESC";
  }
}

/** Full card rows for listing ids, in the given order. */
function cardsByIds(ids: number[], lang: Lang): ProductCard[] {
  if (!ids.length) return [];
  const rows = catalogDb().prepare(`SELECT ${CARD_COLS} FROM ${CARD_FROM} WHERE p.id IN (${inList(ids.length)})`).all(...ids) as CardRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is CardRow => !!r)
    .map((r) => toCard(r, lang));
}

/** "до 20 €" / "20 – 40 €" / "над 100 €" (whole euros without ",00"). */
function priceLabel(b: (typeof PRICE_BUCKETS)[number], lang: Lang): string {
  const fmt = (v: number) => formatPrice(v, lang).replace(/[.,]00(?!\d)/, "");
  if (b.min === 0 && b.max !== null) return lang === "en" ? `Under ${fmt(b.max)}` : `до ${fmt(b.max)}`;
  if (b.max === null) return lang === "en" ? `Over ${fmt(b.min)}` : `над ${fmt(b.min)}`;
  return lang === "en" ? `${fmt(b.min)} – ${fmt(b.max)}` : `${fmt(b.min).replace(/\s*€/, "")} – ${fmt(b.max)}`;
}

const EMPTY_FACETS: ListingResult["facets"] = { categories: [], brands: [], prices: [], goals: [], forms: [], flavours: [], diets: [], inStock: 0, sale: 0 };

// Facets and totals of a listing only change with the catalogue: memoized per catalogue version (another process'
// writes change PRAGMA data_version; this process' writes bump the counter via catalogChanged()).
const memo = globalThis as unknown as {
  __catalogWrites?: number;
  __facetMemo?: Map<string, { total: number; facets: ListingResult["facets"] }>;
  __pictureCounts?: { key: string; value: PictureCounts };
};
const MEMO_MAX = 300;

/** Call after writing to the catalogue in this process (drops memoized listing facets). */
export function catalogChanged() {
  memo.__catalogWrites = (memo.__catalogWrites ?? 0) + 1;
}

function catalogVersion(): string {
  return `${catalogDb().pragma("data_version", { simple: true }) as number}:${memo.__catalogWrites ?? 0}`;
}

type Count = { n: number; s: number };
type PictureCounts = { categories: Map<string, Count>; brands: Map<string, Count>; goals: Map<string, number> };

/**
 * Card counts (and in-stock counts) per category / subcategory, brand and goal over the cards WITH a picture — what
 * the navigation shows while "hide products without a picture" is on (the materialized aggregate tables count every
 * card). Memoized per catalogue version.
 */
function pictureCounts(): PictureCounts {
  const key = catalogVersion();
  if (memo.__pictureCounts?.key === key) return memo.__pictureCounts.value;
  const db = catalogDb();
  const categories = new Map<string, Count>();
  const add = (k: string, n: number, s: number) => {
    const c = categories.get(k) ?? { n: 0, s: 0 };
    categories.set(k, { n: c.n + n, s: c.s + s });
  };
  const catRows = db
    .prepare("SELECT category, subcategory, COUNT(*) AS n, COALESCE(SUM(in_stock), 0) AS s FROM listing WHERE has_image = 1 GROUP BY category, subcategory")
    .all() as { category: string; subcategory: string | null; n: number; s: number }[];
  for (const r of catRows) {
    add(r.category, r.n, r.s);
    if (r.subcategory) add(r.subcategory, r.n, r.s);
  }
  const brandRows = db
    .prepare(
      `SELECT brand_slug AS slug, COUNT(*) AS n, COALESCE(SUM(in_stock), 0) AS s FROM listing
       WHERE has_image = 1 AND brand_slug IS NOT NULL AND brand_slug <> '' GROUP BY brand_slug`,
    )
    .all() as { slug: string; n: number; s: number }[];
  const brands = new Map(brandRows.map((r) => [r.slug, { n: r.n, s: r.s }]));
  const goalRows = db
    .prepare("SELECT t.value AS slug, COUNT(*) AS n FROM product_tags t JOIN listing l ON l.id = t.product_id WHERE t.kind = 'goal' AND l.has_image = 1 GROUP BY t.value")
    .all() as { slug: string; n: number }[];
  const goals = new Map(goalRows.map((r) => [r.slug, r.n]));
  const value = { categories, brands, goals };
  memo.__pictureCounts = { key, value };
  return value;
}

/** Cards per category / subcategory slug as the shop counts them (respects "hide products without a picture"). */
export function shopCategoryCounts(): Map<string, number> {
  if (hidesNoImage()) return new Map([...pictureCounts().categories].map(([k, c]) => [k, c.n]));
  const rows = catalogDb().prepare("SELECT slug, count FROM categories").all() as { slug: string; count: number }[];
  return new Map(rows.map((r) => [r.slug, r.count]));
}

/** One page of a listing (one card per family) with disjunctive facets. */
export function listProducts(lang: Lang, scope: ListingScope, filters: ListingFilters, sort: ListingSort, page: number, perPage = PER_PAGE): ListingResult {
  ensurePricesFresh();
  const db = catalogDb();
  const matches = scope.kind === "search" ? searchMatches(scope.q) : undefined;
  const main = build(scope, filters, null, matches);
  if (!main) return { items: [], total: 0, page: 1, pageCount: 1, facets: EMPTY_FACETS };
  const key = JSON.stringify([catalogVersion(), hidesNoImage(), lang, scope, filters]);
  const cache = (memo.__facetMemo ??= new Map());
  let hit = cache.get(key);
  if (!hit) {
    const total = (db.prepare(main.sql.replace("{cols}", "COUNT(*) AS n")).get(...main.params) as { n: number }).n;
    hit = { total, facets: facets(lang, scope, filters, matches) };
    if (cache.size >= MEMO_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, hit);
  }
  const size = Math.max(1, Math.min(100, Math.floor(perPage) || PER_PAGE));
  const pageCount = Math.max(1, Math.ceil(hit.total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const ids = (
    db
      .prepare(`${main.sql.replace("{cols}", "l.id")} ORDER BY ${orderBy(sort, main.searchable, scope.kind === "search" ? categoryBoost(scope.q) : null)} LIMIT ? OFFSET ?`)
      .all(...main.params, size, (current - 1) * size) as { id: number }[]
  ).map((r) => r.id);
  return { items: cardsByIds(ids, lang), total: hit.total, page: current, pageCount, facets: hit.facets };
}

/** Search-as-you-type: the first cards of the search listing (same order, no facets) and the number of matches. */
export function searchSuggestions(lang: Lang, q: string, limit = 6): { items: ProductCard[]; total: number } {
  const scope: ListingScope = { kind: "search", q };
  const main = build(scope, EMPTY_FILTERS, null, searchMatches(q));
  if (!main) return { items: [], total: 0 };
  const db = catalogDb();
  const total = (db.prepare(main.sql.replace("{cols}", "COUNT(*) AS n")).get(...main.params) as { n: number }).n;
  const n = Math.max(1, Math.min(24, Math.floor(limit) || 6));
  const ids = (
    db.prepare(`${main.sql.replace("{cols}", "l.id")} ORDER BY ${orderBy("relevance", true, categoryBoost(q))} LIMIT ?`).all(...main.params, n) as { id: number }[]
  ).map((r) => r.id);
  return { items: cardsByIds(ids, lang), total };
}

// Flavour facet labels: the most common spelling of each flavour tag (cached for a minute).
let flavourCache: { at: number; labels: Map<string, { bg: string; en: string | null }> } | null = null;

function flavourLabels(): Map<string, { bg: string; en: string | null }> {
  if (flavourCache && Date.now() - flavourCache.at < 60_000) return flavourCache.labels;
  const rows = catalogDb()
    .prepare("SELECT flavour, MAX(flavour_en) AS en, COUNT(*) AS n FROM products WHERE flavour IS NOT NULL AND hidden = 0 GROUP BY flavour ORDER BY n DESC")
    .all() as { flavour: string; en: string | null; n: number }[];
  const labels = new Map<string, { bg: string; en: string | null }>();
  for (const r of rows) {
    const k = flavourSlug(r.flavour);
    if (k && !labels.has(k)) labels.set(k, { bg: r.flavour, en: r.en || flavourEn(r.flavour) });
  }
  flavourCache = { at: Date.now(), labels };
  return labels;
}

function facets(lang: Lang, scope: ListingScope, filters: ListingFilters, matches: string | null | undefined): ListingResult["facets"] {
  const db = catalogDb();
  const entries = getCategoryEntries();
  const q = (omit: FacetOmit) => build(scope, filters, omit, matches)!;

  // Brands (most cards first; selected brands stay listed even with 0 results).
  const bq = q("brand");
  const brandRows = db
    .prepare(
      `SELECT x.value, COALESCE(b.name, x.value) AS label, x.count FROM (
         ${bq.sql.replace("{cols}", "l.brand_slug AS value, COUNT(*) AS count")} AND l.brand_slug IS NOT NULL GROUP BY l.brand_slug ORDER BY count DESC LIMIT 80
       ) x LEFT JOIN brands b ON b.slug = x.value ORDER BY x.count DESC, label`,
    )
    .all(...bq.params) as { value: string; label: string; count: number }[];
  for (const selected of filters.brands) {
    if (!brandRows.some((b) => b.value === selected)) {
      const row = db.prepare("SELECT slug AS value, name AS label FROM brands WHERE slug = ?").get(selected) as { value: string; label: string } | undefined;
      if (row) brandRows.unshift({ ...row, count: 0 });
    }
  }
  const brands: Facet[] = brandRows.map((b) => ({ ...b, selected: filters.brands.includes(b.value) }));

  // Prices.
  const pq = q("price");
  const priceCase = PRICE_BUCKETS.map((b) => (b.max !== null ? `WHEN l.price < ${Number(b.max)} THEN '${b.key}'` : `ELSE '${b.key}'`)).join(" ");
  const priceRows = db.prepare(`${pq.sql.replace("{cols}", `CASE ${priceCase} END AS k, COUNT(*) AS count`)} GROUP BY k`).all(...pq.params) as { k: string; count: number }[];
  const prices: Facet[] = PRICE_BUCKETS.map((b) => ({
    value: b.key,
    label: priceLabel(b, lang),
    count: priceRows.find((r) => r.k === b.key)?.count ?? 0,
    selected: filters.price === b.key,
  }));

  // Categories: top categories — or, on a category page, its subcategories; none on a subcategory page.
  let categories: Facet[] = [];
  const scoped = scope.kind === "category" ? findCategoryIn(entries, scope.slug) : null;
  if (!scoped?.sub) {
    const cq = q("category");
    const col = scoped ? "l.subcategory" : "l.category";
    const rows = db.prepare(`${cq.sql.replace("{cols}", `${col} AS value, COUNT(*) AS count`)} AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY count DESC`).all(
      ...cq.params,
    ) as { value: string; count: number }[];
    const names = new Map<string, L10n>();
    for (const c of entries) {
      names.set(c.slug, c.name);
      for (const s of c.subs) names.set(s.slug, s.name);
    }
    categories = rows.map((r) => ({ value: r.value, label: loc(names.get(r.value) ?? r.value, lang), count: r.count, selected: filters.category === r.value }));
  }

  // Tag facets: cards having a (visible) variant with the tag.
  const tagFacet = (omit: FacetOmit, kind: string, limit: number) => {
    const tq = q(omit);
    return db
      .prepare(
        `SELECT value, COUNT(*) AS count FROM product_tags WHERE kind = ? AND product_id IN (${tq.sql.replace("{cols}", "l.id")})
         GROUP BY value ORDER BY count DESC LIMIT ${limit}`,
      )
      .all(kind, ...tq.params) as { value: string; count: number }[];
  };
  const goalNames = new Map(getGoalEntries().map((g) => [g.slug, g.name]));
  const goals: Facet[] =
    scope.kind === "goal"
      ? []
      : tagFacet("goal", "goal", 30)
          .filter((r) => goalNames.has(r.value))
          .map((r) => ({ value: r.value, label: loc(goalNames.get(r.value)!, lang), count: r.count, selected: filters.goal === r.value }));
  const formNames = new Map(FORMS.map((x) => [x.key as string, x.name]));
  const forms: Facet[] = tagFacet("forms", "form", 20).map((r) => ({
    value: r.value,
    label: loc(formNames.get(r.value) ?? r.value, lang),
    count: r.count,
    selected: filters.forms.includes(r.value),
  }));
  const labels = flavourLabels();
  const flavourRows = tagFacet("flavours", "flavour", 40);
  for (const selected of filters.flavours) if (!flavourRows.some((r) => r.value === selected)) flavourRows.push({ value: selected, count: 0 });
  const flavours: Facet[] = flavourRows.map((r) => {
    const l = labels.get(r.value);
    return { value: r.value, label: (lang === "en" ? l?.en || l?.bg : l?.bg) ?? r.value, count: r.count, selected: filters.flavours.includes(r.value) };
  });
  const dietNames = new Map(DIETS.map((d) => [d.key as string, d.name]));
  const diets: Facet[] = tagFacet("diets", "diet", 10)
    .filter((r) => dietNames.has(r.value))
    .map((r) => ({ value: r.value, label: loc(dietNames.get(r.value)!, lang), count: r.count, selected: filters.diets.includes(r.value) }));

  const tq = q("toggles");
  const toggles = db.prepare(tq.sql.replace("{cols}", "SUM(l.in_stock) AS inStock, SUM(l.on_sale) AS sale")).get(...tq.params) as {
    inStock: number | null;
    sale: number | null;
  };
  return { categories, brands, prices, goals, forms, flavours, diets, inStock: toggles.inStock ?? 0, sale: toggles.sale ?? 0 };
}

// ---------------------------------------------------------------------------
// Product page

type DetailRow = CardRow & {
  ean: string | null;
  images: string;
  description: string | null;
  description_en: string | null;
  goals: string;
  diets: string;
  hidden: number;
  updated_at: string | null;
  weight: number | null;
  is_supplement: number;
  product_kind: ProductKind;
  adult_only: number;
  reg_no: string | null;
  servings: number | null;
  serving_size: string | null;
  net_quantity: string | null;
  ingredients: string | null;
  nutrition: string;
  directions: string | null;
  warnings: string | null;
  allergens: string | null;
  storage: string | null;
};

const DETAIL_COLS = `${CARD_COLS}, p.ean, p.images, p.description, p.description_en, p.goals, p.diets, p.hidden, p.updated_at, p.weight,
  p.is_supplement, p.product_kind, p.adult_only, p.reg_no, p.servings, p.serving_size, p.net_quantity, p.ingredients, p.nutrition,
  p.directions, p.warnings, p.allergens, p.storage`;

function parseList(v: string | null): string[] {
  try {
    const x: unknown = JSON.parse(v ?? "[]");
    return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function parseNutrition(v: string | null): NutritionRow[] {
  try {
    const x: unknown = JSON.parse(v ?? "[]");
    if (!Array.isArray(x)) return [];
    const s = (o: Record<string, unknown>, k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
    return x
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
      .map((o) => ({ name: s(o, "name"), perServing: s(o, "perServing"), per100: s(o, "per100"), nrv: s(o, "nrv") }))
      .filter((r) => r.name);
  } catch {
    return [];
  }
}

/** Food business operator of a brand (Admin → Производители; store.db manufacturers). */
function manufacturerOf(brandSlug: string | null, brand: string | null): ManufacturerInfo | null {
  return getManufacturer(brandSlug, brand);
}

function variantsOf(groupId: number | null, lang: Lang, includeHidden: boolean): ProductVariant[] {
  if (groupId === null) return [];
  const rows = catalogDb()
    .prepare(
      `SELECT id, sku, slug, flavour, flavour_en, size_label, price, old_price, lowest30, stock, image FROM products
       WHERE group_id = ? ${includeHidden ? "" : "AND hidden = 0"} ORDER BY variant_sort, id`,
    )
    .all(groupId) as {
    id: number;
    sku: string;
    slug: string;
    flavour: string | null;
    flavour_en: string | null;
    size_label: string | null;
    price: number;
    old_price: number | null;
    lowest30: number | null;
    stock: number;
    image: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    slug: r.slug,
    flavour: flavourOf(r, lang),
    size: sizeOf(r, lang),
    label: variantLabelOf(r, lang) || r.sku,
    price: r.price,
    oldPrice: r.old_price,
    lowest30: r.old_price !== null ? r.lowest30 : null,
    stock: r.stock,
    image: r.image,
  }));
}

function toDetail(r: DetailRow, lang: Lang, includeHidden: boolean): ProductDetail {
  const entries = getCategoryEntries();
  const top = entries.find((c) => c.slug === r.category);
  const sub = r.subcategory ? top?.subs.find((s) => s.slug === r.subcategory) : undefined;
  const goalNames = new Map(getGoalEntries().map((g) => [g.slug, g.name]));
  let images = parseList(r.images);
  if (!images.length && r.image) images = [r.image];
  const card = toCard(r, lang, true);
  return {
    ...card,
    ean: r.ean,
    images,
    description: (lang === "en" && r.description_en) || r.description || "",
    category: sub ? { slug: sub.slug, name: loc(sub.name, lang) } : top ? { slug: top.slug, name: loc(top.name, lang) } : null,
    parentCategory: sub && top ? { slug: top.slug, name: loc(top.name, lang) } : null,
    goals: parseList(r.goals)
      .filter((g) => goalNames.has(g))
      .map((g) => ({ slug: g, name: loc(goalNames.get(g)!, lang) })),
    diets: parseList(r.diets),
    variants: variantsOf(r.group_id, lang, includeHidden),
    supplement: {
      isSupplement: !!r.is_supplement,
      kind: r.product_kind,
      adultOnly: !!r.adult_only,
      regNo: r.reg_no ?? "",
      form: r.form,
      servings: r.servings,
      servingSize: r.serving_size ?? "",
      // The importer writes it from the pack size ("200 г"): translate the units on English pages.
      netQuantity: r.net_quantity ? (lang === "en" ? sizeLabelEn(r.net_quantity) : r.net_quantity) : "",
      ingredients: r.ingredients ?? "",
      nutrition: parseNutrition(r.nutrition),
      directions: r.directions ?? "",
      warnings: r.warnings ?? "",
      allergens: r.allergens ?? "",
      storage: r.storage ?? "",
    },
    manufacturer: manufacturerOf(r.brand_slug, r.brand),
    weightKg: r.weight,
    hidden: !!r.hidden,
    updatedAt: r.updated_at ?? "",
  };
}

/** Visible product by slug (a variant slug returns that variant, its family in .variants); hidden → null. */
export function getProductBySlug(lang: Lang, slug: string): ProductDetail | null {
  ensurePricesFresh();
  const r = catalogDb().prepare(`SELECT ${DETAIL_COLS} FROM ${CARD_FROM} WHERE p.slug = ? AND p.hidden = 0`).get(slug) as DetailRow | undefined;
  return r ? toDetail(r, lang, false) : null;
}

export function getProductById(lang: Lang, id: number, opts: { includeHidden?: boolean } = {}): ProductDetail | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  ensurePricesFresh();
  const r = catalogDb()
    .prepare(`SELECT ${DETAIL_COLS} FROM ${CARD_FROM} WHERE p.id = ? ${opts.includeHidden ? "" : "AND p.hidden = 0"}`)
    .get(id) as DetailRow | undefined;
  return r ? toDetail(r, lang, !!opts.includeHidden) : null;
}

// ---------------------------------------------------------------------------
// Cart / wishlist snapshots and cards by SKU

type SnapshotRow = CardRow & { hidden: number; weight: number | null; adult_only: number };

/** Fresh cart / wishlist data for the given product ids (unknown ids — and hidden ones unless asked — are skipped). */
export function getSnapshots(lang: Lang, ids: number[], opts: { includeHidden?: boolean } = {}): CartSnapshot[] {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
  if (!clean.length) return [];
  ensurePricesFresh();
  const rows = catalogDb()
    .prepare(
      `SELECT ${CARD_COLS}, p.hidden, p.weight, p.adult_only FROM ${CARD_FROM} WHERE p.id IN (${inList(clean.length)}) ${opts.includeHidden ? "" : "AND p.hidden = 0"}`,
    )
    .all(...clean) as SnapshotRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return clean
    .map((id) => byId.get(id))
    .filter((r): r is SnapshotRow => !!r)
    .map((r) => ({
      id: r.id,
      sku: r.sku,
      slug: r.slug,
      groupId: r.group_id,
      name: nameOf(r, lang),
      variant: variantLabelOf(r, lang) || null,
      brand: r.brand,
      brandSlug: r.brand_slug,
      image: r.image,
      price: r.price,
      oldPrice: r.old_price,
      stock: r.stock,
      hidden: !!r.hidden,
      weightKg: r.weight,
      adultOnly: !!r.adult_only,
    }));
}

/**
 * Cards of exactly these SKUs (each variant with its own price), in input order; unknown SKUs are skipped, and so are
 * the ones the shop doesn't show (hidden; without a picture while those are hidden) unless `includeHidden`.
 */
export function getCardsBySkus(lang: Lang, skus: string[], opts: { includeHidden?: boolean } = {}): ProductCard[] {
  const clean = [...new Set(skus.map((s) => s.trim()).filter(Boolean))].slice(0, 500);
  if (!clean.length) return [];
  ensurePricesFresh();
  const rows = catalogDb()
    .prepare(`SELECT ${CARD_COLS} FROM ${CARD_FROM} WHERE p.sku IN (${inList(clean.length)}) ${opts.includeHidden ? "" : `AND ${shopVisibleSql()}`}`)
    .all(...clean) as CardRow[];
  const bySku = new Map(rows.map((r) => [r.sku, r]));
  return clean
    .map((s) => bySku.get(s))
    .filter((r): r is CardRow => !!r)
    .map((r) => toCard(r, lang, !r.is_primary, !r.is_primary));
}

// ---------------------------------------------------------------------------
// Shelves (home page, product page) — in stock, with a picture, one card per family

const SHOWABLE = "l.in_stock = 1 AND l.has_image = 1";

function shelfIds(sql: string, params: unknown[]): number[] {
  return (catalogDb().prepare(sql).all(...params) as { id: number }[]).map((r) => r.id);
}

export function getShelf(lang: Lang, kind: "sale" | "bestsellers" | "new" | "popular", limit = 12, opts: { category?: string } = {}): ProductCard[] {
  ensurePricesFresh();
  const params: unknown[] = [];
  let cat = "";
  if (opts.category) {
    cat = " AND (l.category = ? OR l.subcategory = ?)";
    params.push(opts.category, opts.category);
  }
  const n = Math.max(1, Math.min(48, limit));
  let sql: string;
  switch (kind) {
    case "sale":
      sql = `SELECT l.id FROM listing l WHERE ${SHOWABLE} AND l.on_sale = 1${cat} ORDER BY l.featured DESC, l.discount DESC, l.popularity DESC LIMIT ?`;
      break;
    case "bestsellers":
      sql = `SELECT l.id FROM listing l JOIN products p ON p.id = l.id WHERE ${SHOWABLE} AND (p.bestseller = 1 OR l.featured = 1)${cat}
             ORDER BY l.featured DESC, l.popularity DESC LIMIT ?`;
      break;
    case "new":
      sql = `SELECT l.id FROM listing l WHERE ${SHOWABLE}${cat} ORDER BY l.created_at DESC, l.id DESC LIMIT ?`;
      break;
    default:
      // Best items across categories (two per category), so the shelf isn't all one kind of product.
      sql = `SELECT id FROM (
               SELECT l.id, l.featured, l.popularity, ROW_NUMBER() OVER (PARTITION BY l.category ORDER BY l.featured DESC, l.popularity DESC) AS rn
               FROM listing l WHERE ${SHOWABLE} AND l.category <> 'sportni-aksesoari'${cat}
             ) WHERE ${opts.category ? "1" : "rn <= 2"} ORDER BY featured DESC, popularity DESC LIMIT ?`;
  }
  return cardsByIds(shelfIds(sql, [...params, n]), lang);
}

function cardOfProduct(productId: number): { card_id: number | null; category: string; subcategory: string | null; brand_slug: string | null } | undefined {
  return catalogDb().prepare("SELECT card_id, category, subcategory, brand_slug FROM products WHERE id = ?").get(productId) as
    | { card_id: number | null; category: string; subcategory: string | null; brand_slug: string | null }
    | undefined;
}

/** Other products of the same subcategory (same brand first). */
export function getRelated(lang: Lang, productId: number, limit = 12): ProductCard[] {
  const p0 = cardOfProduct(productId);
  if (!p0) return [];
  const ids = shelfIds(
    `SELECT l.id FROM listing l WHERE ${SHOWABLE} AND l.category = ? AND l.id <> ? AND (? IS NULL OR l.subcategory = ?)
     ORDER BY (l.brand_slug IS ?) DESC, l.popularity DESC LIMIT ?`,
    [p0.category, p0.card_id ?? productId, p0.subcategory, p0.subcategory, p0.brand_slug, Math.max(1, Math.min(48, limit))],
  );
  return cardsByIds(ids, lang);
}

export function getMoreFromBrand(lang: Lang, productId: number, limit = 12): ProductCard[] {
  const p0 = cardOfProduct(productId);
  if (!p0?.brand_slug) return [];
  const ids = shelfIds(`SELECT l.id FROM listing l WHERE ${SHOWABLE} AND l.brand_slug = ? AND l.id <> ? ORDER BY l.popularity DESC LIMIT ?`, [
    p0.brand_slug,
    p0.card_id ?? productId,
    Math.max(1, Math.min(48, limit)),
  ]);
  return cardsByIds(ids, lang);
}

/** A protein, a creatine, a multivitamin, a pre-workout … for the home page hero collage (featured products first). */
export function getHeroProducts(lang: Lang, limit = 4): ProductCard[] {
  const plan = ["surovatachen-protein", "kreatin-monohidrat", "multivitamini", "predtrenirovachni", "bcaa", "proteinovi-barove", "l-karnitin"];
  const q = catalogDb().prepare(`SELECT l.id FROM listing l WHERE ${SHOWABLE} AND l.subcategory = ? ORDER BY l.featured DESC, l.popularity DESC LIMIT 1`);
  const ids: number[] = [];
  for (const slug of plan) {
    if (ids.length >= limit) break;
    const r = q.get(slug) as { id: number } | undefined;
    if (r) ids.push(r.id);
  }
  return cardsByIds(ids, lang);
}

// ---------------------------------------------------------------------------
// Navigation data

type CatRow = { slug: string; parent: string | null; count: number; in_stock: number; image: string | null };

/**
 * Categories in menu order, as edited in Admin → Категории, with card counts and pictures.
 * By default only what the menu shows: not hidden, with products.
 */
export function getCategoryTree(lang: Lang, opts: { includeHidden?: boolean } = {}): CategoryNode[] {
  const rows = catalogDb().prepare("SELECT slug, parent, count, in_stock, image FROM categories").all() as CatRow[];
  const shown = hidesNoImage() ? pictureCounts().categories : null;
  const bySlug = new Map(rows.map((r) => [r.slug, shown ? { ...r, count: shown.get(r.slug)?.n ?? 0, in_stock: shown.get(r.slug)?.s ?? 0 } : r]));
  const all = !!opts.includeHidden;
  return getCategoryEntries()
    .map((c): CategoryNode => {
      const r = bySlug.get(c.slug);
      return {
        slug: c.slug,
        name: loc(c.name, lang),
        tagline: loc(c.tagline, lang),
        icon: c.icon,
        color: c.color,
        image: c.image || r?.image || null,
        count: r?.count ?? 0,
        hidden: c.hidden,
        children: c.subs
          .map((s): CategoryNode => {
            const rs = bySlug.get(s.slug);
            return {
              slug: s.slug,
              name: loc(s.name, lang),
              tagline: loc(s.tagline, lang),
              icon: c.icon,
              color: c.color,
              image: rs?.image ?? null,
              count: rs?.count ?? 0,
              hidden: s.hidden,
              children: [],
            };
          })
          .filter((s) => all || (!s.hidden && s.count > 0)),
      };
    })
    .filter((c) => all || (!c.hidden && c.count > 0));
}

/**
 * A /kategoria/[slug] address → the category or subcategory node (hidden ones still have a page). A category outside
 * the shop's scope (taxonomy.ts IMPORTED_CATEGORIES) with no products — nothing was imported into it and no admin
 * moved a product there — has no page.
 */
export function getCategory(lang: Lang, slug: string): { node: CategoryNode; parent: CategoryNode | null } | null {
  const inScope = importedCategorySlugs();
  const exists = (n: CategoryNode) => n.count > 0 || inScope.has(n.slug) || catalogDb().prepare("SELECT 1 FROM products WHERE (category = ? OR subcategory = ?) AND hidden = 0 LIMIT 1").get(n.slug, n.slug);
  for (const c of getCategoryTree(lang, { includeHidden: true })) {
    if (c.slug === slug) return exists(c) ? { node: { ...c, children: c.children.filter((s) => !s.hidden && s.count > 0) }, parent: null } : null;
    const sub = c.children.find((s) => s.slug === slug);
    if (sub) return exists(sub) ? { node: sub, parent: { ...c, children: c.children.filter((s) => !s.hidden && s.count > 0) } } : null;
  }
  return null;
}

/** A brand's counts as the shop shows them (only cards with a picture while those without are hidden). */
function shopBrand(b: BrandInfo): BrandInfo {
  if (!hidesNoImage()) return b;
  const c = pictureCounts().brands.get(b.slug);
  return { ...b, count: c?.n ?? 0, inStock: c?.s ?? 0 };
}

/**
 * Brands for the brand index (/marki), menus, the sitemap and link pickers: by default only brands with at least two
 * cards in the shop — the ~600 one-product labels (mostly small pharmacy suppliers) would bury the real brands. Their
 * brand page still works (getBrand) and their products stay in listings, filters and search. `minCount: 1` = all.
 */
export function getBrands(opts: { minCount?: number } = {}): BrandInfo[] {
  const min = Math.max(1, Math.floor(opts.minCount ?? 2));
  return (catalogDb().prepare("SELECT slug, name, count, in_stock AS inStock FROM brands ORDER BY name COLLATE NOCASE").all() as BrandInfo[])
    .map(shopBrand)
    .filter((b) => b.count >= min);
}

export function getBrand(slug: string): BrandInfo | null {
  const b = catalogDb().prepare("SELECT slug, name, count, in_stock AS inStock FROM brands WHERE slug = ?").get(slug) as BrandInfo | undefined;
  return b ? shopBrand(b) : null;
}

type GoalRow = { slug: string; count: number; image: string | null };

function goalInfo(g: GoalEntry, r: GoalRow | undefined, lang: Lang): GoalInfo {
  return { slug: g.slug, name: loc(g.name, lang), description: loc(g.description, lang), icon: g.icon, image: g.image || r?.image || null, count: r?.count ?? 0 };
}

/** A goal's card count as the shop shows it (only cards with a picture while those without are hidden). */
function shopGoal(r: GoalRow): GoalRow {
  return hidesNoImage() ? { ...r, count: pictureCounts().goals.get(r.slug) ?? 0 } : r;
}

/**
 * Fewest cards a goal needs to be listed (goal index, home tiles, menus, sitemap). The shop imports sports nutrition
 * only, so goals like "Красота" or "Сърце" keep just a handful of products — their pages still open, but they are not
 * advertised. Hide / show goals for good in Admin → Категории → Цели.
 */
export const MIN_GOAL_CARDS = 25;

/** Goals in display order (Admin → Категории), without hidden and thin ones. */
export function getGoals(lang: Lang): GoalInfo[] {
  const rows = new Map((catalogDb().prepare("SELECT slug, count, image FROM goals").all() as GoalRow[]).map((r) => [r.slug, shopGoal(r)]));
  return getGoalEntries()
    .filter((g) => !g.hidden && (rows.get(g.slug)?.count ?? 0) >= MIN_GOAL_CARDS)
    .map((g) => goalInfo(g, rows.get(g.slug), lang));
}

/** Cards per goal as the shop counts them (Admin → Категории → Цели). */
export function shopGoalCounts(): Record<string, number> {
  return Object.fromEntries((catalogDb().prepare("SELECT slug, count, image FROM goals").all() as GoalRow[]).map((r) => [r.slug, shopGoal(r).count]));
}

/** A /tsel/[slug] address → the goal (hidden ones still have a page). */
export function getGoal(lang: Lang, slug: string): GoalInfo | null {
  const g = getGoalEntries().find((x) => x.slug === slug);
  if (!g) return null;
  const r = catalogDb().prepare("SELECT slug, count, image FROM goals WHERE slug = ?").get(slug) as GoalRow | undefined;
  return goalInfo(g, r ? shopGoal(r) : undefined, lang);
}

/**
 * Flavours the English shop cannot show in English (Bulgarian text, no stored or dictionary translation) — for the
 * admin ("непреведени вкусове"): how many products, and the most common flavours to translate first.
 */
export function untranslatedFlavours(limit = 50): { products: number; flavours: { flavour: string; count: number }[] } {
  const rows = catalogDb()
    .prepare(
      `SELECT flavour, COUNT(*) AS n FROM products WHERE hidden = 0 AND flavour IS NOT NULL AND (flavour_en IS NULL OR flavour_en = '')
       AND flavour GLOB '*[А-Яа-я]*' GROUP BY flavour ORDER BY n DESC`,
    )
    .all() as { flavour: string; n: number }[];
  const missing = rows.filter((r) => !flavourEn(r.flavour));
  return {
    products: missing.reduce((a, r) => a + r.n, 0),
    flavours: missing.slice(0, Math.max(0, limit)).map((r) => ({ flavour: r.flavour, count: r.n })),
  };
}

export function getCatalogMeta(): { demoPrices: boolean; productCount: number; inStockCount: number; importedAt: string | null } {
  const db = catalogDb();
  const m = db.prepare("SELECT value FROM meta WHERE key = 'imported_at'").get() as { value: string } | undefined;
  const c = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(p.stock > 0), 0) AS s, EXISTS (SELECT 1 FROM products WHERE hidden = 0 AND demo_price = 1) AS demo
       FROM products p WHERE ${shopVisibleSql()}`,
    )
    .get() as { n: number; s: number; demo: number };
  return { demoPrices: !!c.demo, productCount: c.n, inStockCount: c.s, importedAt: m?.value ?? null };
}

// ---------------------------------------------------------------------------
// Additional helpers (sitemap, banners)

/** Every product page the shop shows (not hidden; with a picture while those without are hidden). */
export function getAllProductSlugs(): { slug: string; updatedAt: string | null }[] {
  return catalogDb().prepare(`SELECT p.slug, p.updated_at AS updatedAt FROM products p WHERE ${shopVisibleSql()} ORDER BY p.id`).all() as {
    slug: string;
    updatedAt: string | null;
  }[];
}

/** A representative picture for a link to a category, goal or brand page (promo banners, menu columns). */
export function imageForHref(href: string): string | null {
  const m = href.match(/^(?:\/en)?\/(kategoria|tsel|marka)\/([a-z0-9-]+)/);
  if (!m) return null;
  const db = catalogDb();
  if (m[1] === "kategoria") return (db.prepare("SELECT image FROM categories WHERE slug = ?").get(m[2]) as { image: string | null } | undefined)?.image ?? null;
  if (m[1] === "tsel") return (db.prepare("SELECT image FROM goals WHERE slug = ?").get(m[2]) as { image: string | null } | undefined)?.image ?? null;
  return (
    (
      db.prepare("SELECT image FROM products WHERE brand_slug = ? AND hidden = 0 AND is_primary = 1 AND stock > 0 AND image IS NOT NULL ORDER BY popularity DESC LIMIT 1").get(m[2]) as
        | { image: string }
        | undefined
    )?.image ?? null
  );
}

/** Most stocked brands per top category, for the mega menu. */
export function getCategoryTopBrands(limit = 8): Map<string, { slug: string; name: string }[]> {
  const rows = catalogDb()
    .prepare(
      `SELECT category, brand_slug AS slug, name FROM (
         SELECT category, brand_slug, MIN(brand) AS name,
                ROW_NUMBER() OVER (PARTITION BY category ORDER BY SUM(stock > 0) DESC, COUNT(*) DESC) AS rn
         FROM products p WHERE p.brand_slug IS NOT NULL AND ${shopVisibleSql()} AND p.is_primary = 1 GROUP BY category, brand_slug
       ) WHERE rn <= ? ORDER BY category, rn`,
    )
    .all(limit) as { category: string; slug: string; name: string }[];
  const out = new Map<string, { slug: string; name: string }[]>();
  for (const r of rows) out.set(r.category, [...(out.get(r.category) ?? []), { slug: r.slug, name: r.name }]);
  return out;
}

/** Card mapping for search.ts (same module family, not part of the public contract). */
export function cardsForRows(rows: CardRow[], lang: Lang): ProductCard[] {
  return rows.map((r) => toCard(r, lang));
}
export { CARD_COLS, CARD_FROM };
export type { CardRow };
