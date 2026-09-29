// Keeps the derived catalogue data in sync with the products table: families (product_groups, primary card),
// facet tags, the FTS index, category / brand / goal aggregates — and applies admin edits to a product row.
// Shared by the admin panel (catalog-write.ts) and the CSV importer, so no Next-only imports here; every function
// takes the catalogue connection explicitly.
import type Database from "better-sqlite3";
import type { NutritionRow, ProductForm, ProductKind } from "./catalog-types";
import type { CategoryEntry, GoalEntry } from "./categories";
import { brandKey } from "./brands";
import { slugify } from "./slug";
import { CATEGORIES, DIETS, GOALS, detectDiets, detectGoals, isAdultOnly, productKindFor } from "./taxonomy";
import { familyDisplayName, parseSizeText, sizeSortKey } from "./variants";

type DB = Database.Database;

/** Fields an admin can change (SPEC §5.5). A key that is present (even with null) is applied. */
export type ProductEditData = Partial<{
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  brand: string;
  /** Top or sub category slug. */
  category: string;
  /** REGULAR (base) price. */
  price: number;
  /** Manual per-product sale (null = none). */
  salePrice: number | null;
  saleEndsAt: string | null;
  stock: number;
  hidden: boolean;
  ean: string;
  images: string[];
  flavour: string;
  flavourEn: string;
  size: string;
  /** Family override: "" = standalone, null = automatic. */
  groupKey: string | null;
  form: ProductForm;
  servings: number | null;
  servingSize: string;
  netQuantity: string;
  ingredients: string;
  nutrition: NutritionRow[];
  directions: string;
  warnings: string;
  allergens: string;
  storage: string;
  goals: string[];
  diets: string[];
  isSupplement: boolean;
  kind: ProductKind;
  adultOnly: boolean;
  regNo: string;
  featured: boolean;
  weightKg: number | null;
}>;

/**
 * Additive to ProductEditData (kept apart so the admin's "every field" types don't change): the name of the product's
 * family card ("" = automatic — the members' name without flavour / size). Journaled and re-applied like any edit.
 */
export type FamilyNameEdit = { familyName?: string };

const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");

/** Run `fn` over `items` in chunks (SQLite limits the number of bound parameters). */
function chunked<T>(items: T[], size: number, fn: (part: T[]) => void) {
  for (let i = 0; i < items.length; i += size) fn(items.slice(i, i + size));
}

function parseList(v: string | null): string[] {
  try {
    const x: unknown = JSON.parse(v ?? "[]");
    return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** Facet value of a flavour ("Бисквита с крем" → "biskvita-s-krem"). */
export function flavourSlug(flavour: string): string {
  return slugify(flavour, 40);
}

// `popularity` = stock bonus + picture bonus + up to ~1500 points of brand / family / random spread (importer), so
// in-stock products come first and, among them, the ones with a picture.
/** In-stock bonus inside `popularity`. */
export function stockBoost(stock: number): number {
  return stock > 0 ? 4000 : 0;
}

/** Picture bonus inside `popularity`. */
export function imageBoost(image: string | null | undefined): number {
  return image ? 2000 : 0;
}

/**
 * A picture URL safe for HTML attributes and HTTP headers (the preload `Link` header must be ASCII): spaces,
 * non-ASCII characters ("©", "ö", Cyrillic file names) and quotes are percent-encoded; existing %XX escapes stay.
 */
export function encodeImageUrl(url: string): string {
  return url
    .trim()
    .replace(/[^!-~]|["<>\^`{}]/gu, (c) => encodeURIComponent(c))
    .replace(/%(?![0-9a-f]{2})/giu, "%25");
}

// ---------------------------------------------------------------------------
// Facet tags: goal / diet / flavour / form per listing CARD (a family has a tag when any visible variant has it)

/**
 * The cards touched by a change of these products: the products themselves (they may have stopped being cards) and
 * every member of their families (the primary may have moved).
 */
export function affectedCards(db: DB, productIds: number[]): number[] {
  const out = new Set<number>(productIds);
  chunked([...new Set(productIds)], 400, (part) => {
    const rows = db
      .prepare(
        `SELECT id FROM products WHERE card_id IN (SELECT card_id FROM products WHERE id IN (${inList(part.length)}))
         OR group_id IN (SELECT group_id FROM products WHERE group_id IS NOT NULL AND id IN (${inList(part.length)}))`,
      )
      .all(...part, ...part) as { id: number }[];
    for (const r of rows) out.add(r.id);
  });
  return [...out];
}

/** Rebuild the tags of all cards, or of the given cards (product ids; non-cards among them just lose their tags). */
export function refreshTags(db: DB, ids?: number[]) {
  type Row = { card_id: number; goals: string; diets: string; flavour: string | null; form: string | null };
  const ins = db.prepare("INSERT OR IGNORE INTO product_tags (product_id, kind, value) VALUES (?, ?, ?)");
  const apply = (rows: Row[]) => {
    for (const r of rows) {
      for (const g of parseList(r.goals)) ins.run(r.card_id, "goal", g);
      for (const d of parseList(r.diets)) ins.run(r.card_id, "diet", d);
      if (r.flavour) {
        const f = flavourSlug(r.flavour);
        if (f) ins.run(r.card_id, "flavour", f);
      }
      if (r.form) ins.run(r.card_id, "form", r.form);
    }
  };
  const cols = "card_id, goals, diets, flavour, form";
  if (!ids) {
    db.exec("DELETE FROM product_tags");
    apply(db.prepare(`SELECT ${cols} FROM products WHERE hidden = 0 AND card_id IS NOT NULL`).all() as Row[]);
    return;
  }
  chunked([...new Set(ids)], 400, (part) => {
    db.prepare(`DELETE FROM product_tags WHERE product_id IN (${inList(part.length)})`).run(...part);
    apply(db.prepare(`SELECT ${cols} FROM products WHERE hidden = 0 AND card_id IN (${inList(part.length)})`).all(...part) as Row[]);
  });
}

// ---------------------------------------------------------------------------
// Listing rows: one narrow row per visible card (family "от" price, card-level stock / sale state)

// A family card shows ONE variant's price: the cheapest in-stock main size (refreshGroupPrices). Its sale state is
// that variant's, so "Промоции", the sale filter, the discount sort and the card's "Промо" badge always agree.
const LISTING_SELECT = `
  SELECT p.id, p.category, p.subcategory, p.brand_slug,
    COALESCE(g.min_price, p.price),
    COALESCE(g.in_stock_any, p.stock > 0),
    CASE WHEN g.id IS NULL THEN p.old_price IS NOT NULL ELSE COALESCE(g.sale_any, 0) = 1 END,
    COALESCE(CASE WHEN g.id IS NULL THEN (p.old_price - p.price) / p.old_price ELSE (g.min_old_price - g.min_price) / g.min_old_price END, 0),
    p.featured, p.popularity, p.created_at, p.image IS NOT NULL
  FROM products p LEFT JOIN product_groups g ON g.id = p.group_id
  WHERE p.is_primary = 1 AND p.hidden = 0`;

/** Rebuild the listing rows of all cards, or of the given product ids (see affectedCards). */
export function refreshListing(db: DB, ids?: number[]) {
  const cols = "id, category, subcategory, brand_slug, price, in_stock, on_sale, discount, featured, popularity, created_at, has_image";
  if (!ids) {
    db.exec(`DELETE FROM listing; INSERT INTO listing (${cols}) ${LISTING_SELECT};`);
    return;
  }
  chunked([...new Set(ids)], 400, (part) => {
    db.prepare(`DELETE FROM listing WHERE id IN (${inList(part.length)})`).run(...part);
    db.prepare(`INSERT INTO listing (${cols}) ${LISTING_SELECT} AND p.id IN (${inList(part.length)})`).run(...part);
  });
}

// ---------------------------------------------------------------------------
// Full-text index: names, brand, codes + keywords (category / goal / diet names in both languages, flavour)

const CATEGORY_WORDS = new Map<string, string>();
for (const c of CATEGORIES) {
  CATEGORY_WORDS.set(c.slug, `${c.name.bg} ${c.name.en}`);
  for (const s of c.subs) CATEGORY_WORDS.set(s.slug, `${s.name.bg} ${s.name.en}`);
}
const GOAL_WORDS = new Map(GOALS.map((g) => [g.slug, `${g.name.bg} ${g.name.en}`]));
const DIET_WORDS = new Map(DIETS.map((d) => [d.key as string, `${d.name.bg} ${d.name.en}`]));

type FtsRow = {
  id: number;
  name: string;
  name_en: string | null;
  brand: string | null;
  sku: string;
  ean: string | null;
  category: string;
  subcategory: string | null;
  flavour: string | null;
  flavour_en: string | null;
  goals: string;
  diets: string;
};

function keywords(r: FtsRow): string {
  const parts = [CATEGORY_WORDS.get(r.category), r.subcategory ? CATEGORY_WORDS.get(r.subcategory) : undefined, r.flavour, r.flavour_en];
  for (const g of parseList(r.goals)) parts.push(GOAL_WORDS.get(g));
  for (const d of parseList(r.diets)) parts.push(DIET_WORDS.get(d));
  return parts.filter(Boolean).join(" ");
}

export function reindexFts(db: DB, ids?: number[]) {
  const cols = "id, name, name_en, brand, sku, ean, category, subcategory, flavour, flavour_en, goals, diets";
  const ins = db.prepare("INSERT INTO products_fts (rowid, name, name_en, brand, sku, ean, keywords) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const apply = (rows: FtsRow[]) => {
    for (const r of rows) ins.run(r.id, r.name, r.name_en ?? "", r.brand ?? "", r.sku, r.ean ?? "", keywords(r));
  };
  if (!ids) {
    db.exec("DELETE FROM products_fts");
    apply(db.prepare(`SELECT ${cols} FROM products`).all() as FtsRow[]);
    return;
  }
  chunked(ids, 500, (part) => {
    db.prepare(`DELETE FROM products_fts WHERE rowid IN (${inList(part.length)})`).run(...part);
    apply(db.prepare(`SELECT ${cols} FROM products WHERE id IN (${inList(part.length)})`).all(...part) as FtsRow[]);
  });
}

// ---------------------------------------------------------------------------
// Families: rows sharing a group_key form a family (>= 2 members); one visible member is the primary card.

type FamilyRow = {
  id: number;
  sku: string;
  slug: string;
  name: string;
  name_en: string | null;
  brand: string | null;
  brand_slug: string | null;
  category: string;
  subcategory: string | null;
  group_key: string | null;
  hidden: number;
  stock: number;
  image: string | null;
  popularity: number;
  flavour: string | null;
  flavour_en: string | null;
  size_value: number | null;
  size_unit: string | null;
  size_label: string | null;
  family_name: string | null;
  updated_at: string | null;
};

const FAMILY_COLS =
  "id, sku, slug, name, name_en, brand, brand_slug, category, subcategory, group_key, hidden, stock, image, popularity, flavour, flavour_en, size_value, size_unit, size_label, family_name, updated_at";

/** Effective family key of a row: its group_key, or a key of its own. */
const keyOf = (r: { sku: string; group_key: string | null }) => r.group_key || `single#${r.sku}`;

type SizedRow = { id: number; size_value: number | null; size_unit: string | null; size_label: string | null };

/**
 * Members whose pack is a SAMPLE next to the family's main sizes — a 25 g sachet of a 2.27 kg protein (g / ml under
 * 10 % of the largest pack). A single bar or gel of a "12 x 60 г" box is a unit of the box, not a sample.
 */
export function sampleSizes(members: SizedRow[]): Set<number> {
  const out = new Set<number>();
  const mass = members.filter((m) => m.size_value && m.size_value > 0 && (m.size_unit === "g" || m.size_unit === "ml"));
  if (mass.length < 2) return out;
  const max = Math.max(...mass.map((m) => m.size_value!));
  const units = mass
    .map((m) => {
      const mult = Number(/^(\d+)\s*[xх×]\s/iu.exec(m.size_label ?? "")?.[1] ?? 1);
      return mult > 1 ? m.size_value! / mult : null;
    })
    .filter((u): u is number => u !== null);
  for (const m of mass) {
    if (m.size_value! >= 0.1 * max) continue;
    if (units.some((u) => Math.abs(u - m.size_value!) <= 0.1 * u)) continue;
    out.add(m.id);
  }
  return out;
}

/** "2,27 кг" → 2270 — orders the size selector by the label it shows (near-equal sizes share one label). */
function labelAmount(label: string | null, fallback: number | null): number {
  const sz = label ? parseSizeText(label) : null;
  return sz ? sizeSortKey(sz) : (fallback ?? 0);
}

/**
 * Recompute group_id / is_primary / card_id / variant_sort and the product_groups rows — for all products, or only
 * the families with the given keys (pass the old AND new key when a product moves between families). A family's
 * name is its members' name without flavour and pack size (or the name set in the admin).
 */
export function refreshFamilies(db: DB, keys?: string[]) {
  let rows: FamilyRow[];
  if (keys) {
    const real = [...new Set(keys.filter(Boolean))];
    rows = [];
    chunked(real, 400, (part) => {
      rows.push(...(db.prepare(`SELECT ${FAMILY_COLS} FROM products WHERE group_key IN (${inList(part.length)})`).all(...part) as FamilyRow[]));
      // Rows whose key is their own (single#sku) are addressed by SKU.
      const skus = part.filter((k) => k.startsWith("single#")).map((k) => k.slice(7));
      if (skus.length) {
        rows.push(
          ...(db.prepare(`SELECT ${FAMILY_COLS} FROM products WHERE group_key IS NULL AND sku IN (${inList(skus.length)})`).all(...skus) as FamilyRow[]),
        );
      }
    });
  } else {
    rows = db.prepare(`SELECT ${FAMILY_COLS} FROM products`).all() as FamilyRow[];
  }
  const byKey = new Map<string, FamilyRow[]>();
  for (const r of rows) {
    const list = byKey.get(keyOf(r));
    if (list) list.push(r);
    else byKey.set(keyOf(r), [r]);
  }

  const existing = new Map<string, number>();
  const groupRows = keys
    ? (() => {
        const out: { id: number; key: string }[] = [];
        chunked([...new Set(keys)], 400, (part) =>
          out.push(...(db.prepare(`SELECT id, key FROM product_groups WHERE key IN (${inList(part.length)})`).all(...part) as { id: number; key: string }[])),
        );
        return out;
      })()
    : (db.prepare("SELECT id, key FROM product_groups").all() as { id: number; key: string }[]);
  for (const g of groupRows) existing.set(g.key, g.id);

  const setMember = db.prepare("UPDATE products SET group_id = ?, is_primary = ?, card_id = ?, variant_sort = ? WHERE id = ?");
  const insGroup = db.prepare(
    `INSERT INTO product_groups (key, slug, name, name_en, brand_slug, category, subcategory, primary_product_id)
     VALUES (@key, @slug, @name, @name_en, @brand_slug, @category, @subcategory, @primary_product_id)`,
  );
  const updGroup = db.prepare(
    `UPDATE product_groups SET slug = @slug, name = @name, name_en = @name_en, brand_slug = @brand_slug, category = @category,
       subcategory = @subcategory, primary_product_id = @primary_product_id WHERE id = @id`,
  );
  const delGroup = db.prepare("DELETE FROM product_groups WHERE id = ?");
  const touched: number[] = [];
  const collator = new Intl.Collator("bg");

  for (const [key, members] of byKey) {
    if (members.length < 2) {
      const r = members[0];
      setMember.run(null, 1, r.id, 0, r.id);
      const gid = existing.get(key);
      if (gid !== undefined) delGroup.run(gid);
      existing.delete(key);
      continue;
    }
    // Selector order: flavour (A–Я), then pack size; the in-stock row first among rows with the same label.
    const sorted = [...members].sort(
      (a, b) =>
        collator.compare(a.flavour ?? "", b.flavour ?? "") ||
        labelAmount(a.size_label, a.size_value) - labelAmount(b.size_label, b.size_value) ||
        Number(b.stock > 0) - Number(a.stock > 0) ||
        (a.size_value ?? 0) - (b.size_value ?? 0) ||
        a.id - b.id,
    );
    const visible = sorted.filter((m) => !m.hidden);
    const pool = visible.length ? visible : sorted;
    const samples = sampleSizes(pool);
    // The card: in stock, with a picture, a main size (not a sample sachet), then the most popular.
    const primary = [...pool].sort(
      (a, b) =>
        Number(b.stock > 0) - Number(a.stock > 0) ||
        Number(!!b.image) - Number(!!a.image) ||
        Number(!samples.has(b.id)) - Number(!samples.has(a.id)) ||
        b.popularity - a.popularity ||
        sorted.indexOf(a) - sorted.indexOf(b),
    )[0];
    // A family name set in the admin (on any member; the latest wins), else the members' name without flavour / size.
    const override = [...members]
      .filter((m) => m.family_name?.trim())
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0]
      ?.family_name?.trim();
    const withEn = pool.filter((m) => m.name_en?.trim());
    const data = {
      key,
      slug: primary.slug,
      name:
        override ||
        familyDisplayName(
          pool.map((m) => ({ name: m.name, flavour: m.flavour, flavourEn: m.flavour_en, brand: m.brand })),
          pool.indexOf(primary),
        ),
      name_en: withEn.length
        ? familyDisplayName(
            withEn.map((m) => ({ name: m.name_en!, flavour: m.flavour, flavourEn: m.flavour_en, brand: m.brand })),
            Math.max(0, withEn.indexOf(primary)),
          )
        : null,
      brand_slug: primary.brand_slug,
      category: primary.category,
      subcategory: primary.subcategory,
      primary_product_id: primary.id,
    };
    let gid = existing.get(key);
    if (gid === undefined) gid = Number(insGroup.run(data).lastInsertRowid);
    else updGroup.run({ ...data, id: gid });
    existing.delete(key);
    touched.push(gid);
    sorted.forEach((m, i) => setMember.run(gid, m.id === primary.id ? 1 : 0, primary.id, i, m.id));
  }
  // Families that lost their members.
  if (!keys) for (const gid of existing.values()) delGroup.run(gid);
  else for (const [key, gid] of existing) if (!byKey.has(key)) delGroup.run(gid);
  refreshGroupPrices(db, keys ? touched : undefined);
}

/**
 * Price and stock state of families (visible members only) — after prices, stock or visibility change. The card's
 * "от" price is ONE variant's: the cheapest in-stock main size (any in-stock size when all are samples; any variant
 * when none is in stock). Its old price / Omnibus price / sale state go with it; max_price spans every visible variant.
 */
export function refreshGroupPrices(db: DB, groupIds?: number[]) {
  type Row = SizedRow & { group_id: number; price: number; old_price: number | null; lowest30: number | null; stock: number; flavour: string | null };
  const rows: Row[] = [];
  const cols = "id, group_id, price, old_price, lowest30, stock, flavour, size_value, size_unit, size_label";
  if (groupIds) {
    chunked([...new Set(groupIds)], 500, (part) =>
      rows.push(...(db.prepare(`SELECT ${cols} FROM products WHERE hidden = 0 AND group_id IN (${inList(part.length)})`).all(...part) as Row[])),
    );
  } else {
    rows.push(...(db.prepare(`SELECT ${cols} FROM products WHERE hidden = 0 AND group_id IS NOT NULL`).all() as Row[]));
  }
  const agg = new Map<number, Row[]>();
  for (const r of rows) {
    const list = agg.get(r.group_id);
    if (list) list.push(r);
    else agg.set(r.group_id, [r]);
  }
  const upd = db.prepare(
    `UPDATE product_groups SET variant_count = ?, flavour_count = ?, min_price = ?, max_price = ?, in_stock_any = ?, sale_any = ?,
       min_old_price = ?, min_lowest30 = ? WHERE id = ?`,
  );
  const ids = groupIds ?? (db.prepare("SELECT id FROM product_groups").all() as { id: number }[]).map((r) => r.id);
  for (const id of ids) {
    const m = agg.get(id) ?? [];
    if (!m.length) {
      upd.run(0, 0, null, null, 0, 0, null, null, id);
      continue;
    }
    const inStock = m.filter((x) => x.stock > 0);
    const pool0 = inStock.length ? inStock : m;
    const samples = sampleSizes(m);
    const main = pool0.filter((x) => !samples.has(x.id));
    const pool = main.length ? main : pool0;
    // The cheapest; at the same price the one on sale (so the card may say "Промо").
    const rep = pool.reduce((a, b) =>
      b.price < a.price - 0.0001 || (Math.abs(b.price - a.price) < 0.0001 && b.old_price !== null && a.old_price === null) ? b : a,
    );
    upd.run(
      m.length,
      new Set(m.map((x) => x.flavour).filter(Boolean)).size,
      rep.price,
      Math.max(...m.map((x) => x.price)),
      inStock.length ? 1 : 0,
      rep.old_price !== null ? 1 : 0,
      rep.old_price,
      rep.lowest30,
      id,
    );
  }
}

// ---------------------------------------------------------------------------
// Aggregates for navigation and filters (visible cards only: one per family)

/** Recompute category / brand / goal counts and tile pictures, for the categories and goals as edited in the admin. */
export function refreshAggregates(db: DB, categories: CategoryEntry[], goals: GoalEntry[]) {
  const run = db.transaction(() => {
    db.exec("DELETE FROM categories; DELETE FROM brands; DELETE FROM goals;");
    const catInsert = db.prepare("INSERT OR REPLACE INTO categories (slug, parent, name, name_en, position, count, in_stock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const count = (where: string) => db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(l.in_stock), 0) AS s FROM listing l WHERE ${where}`);
    const image = (where: string) =>
      db.prepare(
        `SELECT p.image FROM listing l JOIN products p ON p.id = l.id WHERE l.has_image = 1 AND ${where}
         ORDER BY l.in_stock DESC, l.featured DESC, l.popularity DESC LIMIT 1`,
      );
    const countCat = count("l.category = ?");
    const countSub = count("l.category = ? AND l.subcategory = ?");
    const imgCat = image("l.category = ?");
    const imgSub = image("l.category = ? AND l.subcategory = ?");
    categories.forEach((c, i) => {
      const r = countCat.get(c.slug) as { n: number; s: number };
      const img = (imgCat.get(c.slug) as { image: string } | undefined)?.image ?? null;
      catInsert.run(c.slug, null, c.name.bg, c.name.en || null, i, r.n, r.s, img);
      c.subs.forEach((s, j) => {
        const rs = countSub.get(c.slug, s.slug) as { n: number; s: number };
        const simg = (imgSub.get(c.slug, s.slug) as { image: string } | undefined)?.image ?? null;
        catInsert.run(s.slug, c.slug, s.name.bg, s.name.en || null, j, rs.n, rs.s, simg);
      });
    });
    db.exec(`
      INSERT INTO brands (slug, name, count, in_stock)
        SELECT x.slug, (SELECT p.brand FROM products p WHERE p.id = x.first), x.n, x.s FROM (
          SELECT l.brand_slug AS slug, MIN(l.id) AS first, COUNT(*) AS n, COALESCE(SUM(l.in_stock), 0) AS s FROM listing l
          WHERE l.brand_slug IS NOT NULL AND l.brand_slug <> '' GROUP BY l.brand_slug
        ) x;
    `);
    const goalCards = "l.id IN (SELECT product_id FROM product_tags WHERE kind = 'goal' AND value = ?)";
    const countGoal = count(goalCards);
    const imgGoal = image(goalCards);
    const goalInsert = db.prepare("INSERT OR REPLACE INTO goals (slug, name, name_en, position, count, image) VALUES (?, ?, ?, ?, ?, ?)");
    goals.forEach((g, i) => {
      const r = countGoal.get(g.slug) as { n: number };
      goalInsert.run(g.slug, g.name.bg, g.name.en || null, i, r.n, (imgGoal.get(g.slug) as { image: string } | undefined)?.image ?? null);
    });
  });
  run();
}

// ---------------------------------------------------------------------------
// Admin edits

/** Existing brands by normalised key, so "olimp" typed in the admin joins "Olimp Sport Nutrition". */
export type BrandIndex = Map<string, { name: string; slug: string }>;

export function brandIndex(db: DB): BrandIndex {
  const out: BrandIndex = new Map();
  const rows = db
    .prepare("SELECT brand, brand_slug, COUNT(*) AS n FROM products WHERE brand IS NOT NULL AND brand_slug IS NOT NULL GROUP BY brand_slug ORDER BY n DESC")
    .all() as { brand: string; brand_slug: string }[];
  for (const r of rows) {
    const k = brandKey(r.brand);
    if (k && !out.has(k)) out.set(k, { name: r.brand, slug: r.brand_slug });
  }
  return out;
}

export type EditContext = {
  /** A top or sub category slug → { category, sub } among the categories as edited in the admin; null = unknown. */
  resolveCategory: (slug: string) => { category: string; sub: string | null } | null;
  brands?: BrandIndex;
  /** ISO timestamp of the change. */
  now: string;
};

/** What has to be refreshed after an edit. */
export type EditEffects = {
  id: number;
  /** The card the product belonged to before the edit (its tags / listing row need a refresh too). */
  oldCard: number | null;
  fts: boolean;
  tags: boolean;
  familyKeys: string[];
  prices: boolean;
  aggregates: boolean;
};

type EditRow = {
  id: number;
  sku: string;
  stock: number;
  image: string | null;
  popularity: number;
  group_key: string | null;
  auto_group_key: string | null;
  demo_price: number;
  card_id: number | null;
};

const clip = (v: string, max: number) => v.trim().slice(0, max);
const orNull = (v: string, max: number) => clip(v, max) || null;

/** Apply an admin edit to the product with this SKU. Returns null if the SKU isn't in the catalogue. */
export function applyProductEdit(db: DB, sku: string, edit: ProductEditData & FamilyNameEdit, ctx: EditContext): EditEffects | null {
  const old = db.prepare("SELECT id, sku, stock, image, popularity, group_key, auto_group_key, demo_price, card_id FROM products WHERE sku = ?").get(sku) as EditRow | undefined;
  if (!old) return null;
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  const fx: EditEffects = { id: old.id, oldCard: old.card_id, fts: false, tags: false, familyKeys: [], prices: false, aggregates: false };
  const has = (k: keyof ProductEditData) => k in edit && edit[k] !== undefined;
  let popularity = old.popularity;

  if (has("name") && edit.name!.trim()) {
    set("name", clip(edit.name!, 300));
    fx.fts = true;
    fx.familyKeys.push(keyOf(old));
  }
  if (has("nameEn")) {
    set("name_en", orNull(edit.nameEn!, 300));
    fx.fts = true;
  }
  if (has("description")) set("description", orNull(edit.description!, 20000));
  if (has("descriptionEn")) set("description_en", orNull(edit.descriptionEn!, 20000));
  if (has("brand")) {
    const raw = clip(edit.brand!, 80);
    const known = raw ? (ctx.brands ?? brandIndex(db)).get(brandKey(raw)) : undefined;
    set("brand", raw ? (known?.name ?? raw) : null);
    set("brand_slug", raw ? (known?.slug ?? (slugify(raw) || null)) : null);
    fx.fts = fx.prices = fx.aggregates = true;
  }
  if (has("category")) {
    const c = ctx.resolveCategory(edit.category!);
    if (c) {
      set("category", c.category);
      set("subcategory", c.sub);
      fx.fts = fx.prices = fx.aggregates = true;
      fx.familyKeys.push(keyOf(old));
    }
  }
  if (has("price") && Number.isFinite(edit.price) && edit.price! > 0) {
    set("base_price", Math.round(edit.price! * 100) / 100);
    set("demo_price", 0);
    // A placeholder sale made up by the importer goes away with the placeholder price.
    if (old.demo_price && !has("salePrice")) set("sale_price", null);
    fx.prices = true;
  }
  if (has("salePrice")) {
    const v = edit.salePrice;
    set("sale_price", v != null && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
    fx.prices = true;
  }
  if (has("saleEndsAt") || "saleEndsAt" in edit) {
    set("sale_ends_at", edit.saleEndsAt || null);
    fx.prices = true;
  }
  if (has("stock") && Number.isFinite(edit.stock)) {
    const stock = Math.max(0, Math.floor(edit.stock!));
    set("stock", stock);
    popularity += stockBoost(stock) - stockBoost(old.stock);
    fx.aggregates = true;
    fx.familyKeys.push(keyOf(old));
  }
  if (has("hidden")) {
    set("hidden", edit.hidden ? 1 : 0);
    fx.aggregates = true;
    fx.familyKeys.push(keyOf(old));
  }
  if (has("ean")) {
    set("ean", orNull(edit.ean!, 20));
    fx.fts = true;
  }
  if (has("images")) {
    const imgs = edit.images!.filter((u) => typeof u === "string" && u.trim()).map(encodeImageUrl).slice(0, 20);
    set("images", JSON.stringify(imgs));
    set("image", imgs[0] ?? null);
    popularity += imageBoost(imgs[0]) - imageBoost(old.image);
    fx.aggregates = true;
    fx.familyKeys.push(keyOf(old));
  }
  if (has("flavour")) {
    set("flavour", orNull(edit.flavour!, 80));
    fx.fts = fx.tags = true;
    fx.familyKeys.push(keyOf(old));
  }
  if (has("flavourEn")) {
    set("flavour_en", orNull(edit.flavourEn!, 80));
    fx.fts = true;
  }
  if (has("size")) {
    const label = clip(edit.size!, 60);
    const sz = label ? parseSizeText(label) : null;
    set("size_label", label || null);
    set("size_value", sz ? sizeSortKey(sz) : null);
    set("size_unit", sz ? sz.unit : null);
    fx.familyKeys.push(keyOf(old));
  }
  if (typeof edit.familyName === "string") {
    set("family_name", orNull(edit.familyName, 200));
    fx.familyKeys.push(keyOf(old));
  }
  if ("groupKey" in edit) {
    const k = edit.groupKey;
    const next = k === null || k === undefined ? old.auto_group_key : k.trim() === "" ? `single#${old.sku}` : clip(k, 200);
    set("group_key", next);
    fx.familyKeys.push(keyOf(old), next || `single#${old.sku}`);
    fx.aggregates = true;
  }
  if (has("form")) {
    set("form", edit.form);
    fx.tags = true;
  }
  if ("servings" in edit) set("servings", edit.servings != null && Number.isFinite(edit.servings) ? Math.max(0, Math.round(edit.servings)) : null);
  if (has("servingSize")) set("serving_size", orNull(edit.servingSize!, 120));
  if (has("netQuantity")) set("net_quantity", orNull(edit.netQuantity!, 120));
  if (has("ingredients")) set("ingredients", orNull(edit.ingredients!, 10000));
  if (has("nutrition")) set("nutrition", JSON.stringify(edit.nutrition ?? []));
  if (has("directions")) set("directions", orNull(edit.directions!, 5000));
  if (has("warnings")) set("warnings", orNull(edit.warnings!, 5000));
  if (has("allergens")) set("allergens", orNull(edit.allergens!, 2000));
  if (has("storage")) set("storage", orNull(edit.storage!, 1000));
  if (has("goals")) {
    set("goals", JSON.stringify([...new Set(edit.goals!)].slice(0, 12)));
    fx.fts = fx.tags = fx.prices = fx.aggregates = true;
  }
  if (has("diets")) {
    set("diets", JSON.stringify([...new Set(edit.diets!)].slice(0, 12)));
    fx.fts = fx.tags = true;
  }
  if (has("isSupplement")) set("is_supplement", edit.isSupplement ? 1 : 0);
  if (has("kind")) set("product_kind", edit.kind);
  if (has("adultOnly")) set("adult_only", edit.adultOnly ? 1 : 0);
  if (has("regNo")) set("reg_no", orNull(edit.regNo!, 120));
  if (has("featured")) set("featured", edit.featured ? 1 : 0);
  if ("weightKg" in edit) set("weight", edit.weightKg != null && Number.isFinite(edit.weightKg) && edit.weightKg > 0 ? edit.weightKg : null);

  if (!sets.length) return fx;
  if (popularity !== old.popularity) set("popularity", popularity);
  set("admin_edited", 1);
  set("updated_at", ctx.now);
  db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).run(...vals, old.id);
  return fx;
}

/** Everything an admin can edit, as currently in the catalogue (the "original" snapshot for "restore"). */
export type ProductSnapshot = ProductEditData & FamilyNameEdit & { demoPrice?: boolean };

type SnapshotRow = {
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  brand: string | null;
  category: string;
  subcategory: string | null;
  base_price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  stock: number;
  hidden: number;
  ean: string | null;
  images: string;
  flavour: string | null;
  flavour_en: string | null;
  size_label: string | null;
  group_key: string | null;
  auto_group_key: string | null;
  family_name: string | null;
  sku: string;
  form: ProductForm | null;
  servings: number | null;
  serving_size: string | null;
  net_quantity: string | null;
  ingredients: string | null;
  nutrition: string;
  directions: string | null;
  warnings: string | null;
  allergens: string | null;
  storage: string | null;
  goals: string;
  diets: string;
  is_supplement: number;
  product_kind: ProductKind;
  adult_only: number;
  reg_no: string | null;
  featured: number;
  weight: number | null;
  demo_price: number;
};

export function snapshotProduct(db: DB, sku: string): ProductSnapshot | null {
  const r = db.prepare("SELECT * FROM products WHERE sku = ?").get(sku) as SnapshotRow | undefined;
  if (!r) return null;
  let nutrition: NutritionRow[] = [];
  try {
    const x: unknown = JSON.parse(r.nutrition || "[]");
    if (Array.isArray(x)) nutrition = x as NutritionRow[];
  } catch {
    nutrition = [];
  }
  return {
    name: r.name,
    nameEn: r.name_en ?? "",
    description: r.description ?? "",
    descriptionEn: r.description_en ?? "",
    brand: r.brand ?? "",
    category: r.subcategory ?? r.category,
    price: r.base_price,
    salePrice: r.sale_price,
    saleEndsAt: r.sale_ends_at,
    stock: r.stock,
    hidden: !!r.hidden,
    ean: r.ean ?? "",
    images: parseList(r.images),
    flavour: r.flavour ?? "",
    flavourEn: r.flavour_en ?? "",
    size: r.size_label ?? "",
    groupKey: r.group_key && r.group_key !== r.auto_group_key ? (r.group_key === `single#${r.sku}` ? "" : r.group_key) : null,
    familyName: r.family_name ?? "",
    ...(r.form ? { form: r.form } : {}),
    servings: r.servings,
    servingSize: r.serving_size ?? "",
    netQuantity: r.net_quantity ?? "",
    ingredients: r.ingredients ?? "",
    nutrition,
    directions: r.directions ?? "",
    warnings: r.warnings ?? "",
    allergens: r.allergens ?? "",
    storage: r.storage ?? "",
    goals: parseList(r.goals),
    diets: parseList(r.diets),
    isSupplement: !!r.is_supplement,
    kind: r.product_kind,
    adultOnly: !!r.adult_only,
    regNo: r.reg_no ?? "",
    featured: !!r.featured,
    weightKg: r.weight,
    demoPrice: !!r.demo_price,
  };
}

/** Insert a product created in the admin panel (not from the CSV); the rest of `data` is applied as an edit. Returns its id. */
export function insertCustomProduct(
  db: DB,
  sku: string,
  data: ProductEditData & FamilyNameEdit & { name: string; price: number; category: string },
  opts: { ctx: EditContext; id?: number; created?: string },
): number {
  const c = opts.ctx.resolveCategory(data.category) ?? { category: CATEGORIES[0].slug, sub: null };
  let slug = `${slugify(data.name, 70)}-${slugify(sku)}`.replace(/^-+/, "");
  while (db.prepare("SELECT 1 FROM products WHERE slug = ?").get(slug)) slug += "-x";
  const created = opts.created ?? opts.ctx.now;
  const info = db
    .prepare(
      `INSERT INTO products (id, sku, slug, name, category, subcategory, base_price, price, stock, custom, admin_edited, popularity,
         source_category, created_at, updated_at, group_key, auto_group_key, is_primary, product_kind, is_supplement)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, 400, 'admin', ?, ?, ?, ?, 1, 'supplement', 1)`,
    )
    .run(opts.id ?? null, sku, slug, data.name.trim(), c.category, c.sub, data.price, data.price, created, created, `single#${sku}`, `single#${sku}`);
  const id = Number(info.lastInsertRowid);
  db.prepare("UPDATE products SET card_id = id WHERE id = ?").run(id);
  // What the importer would derive from the name and category; anything the admin set wins.
  const kind = productKindFor(data.name, c.category, c.sub);
  const defaults: ProductEditData = {
    kind,
    isSupplement: kind === "supplement",
    adultOnly: isAdultOnly(data.name, c.category, c.sub),
    goals: detectGoals(data.name, c.category, c.sub),
    diets: detectDiets(data.name, c.sub),
    ...(c.category === "sportni-aksesoari" ? { form: "accessory" as const } : {}),
  };
  const rest: ProductEditData & FamilyNameEdit = { ...defaults, ...data };
  delete rest.category;
  applyProductEdit(db, sku, rest, opts.ctx);
  return id;
}

/** Remove a product row and its derived rows (FTS, tags). The caller refreshes its family and the aggregates. */
export function deleteProductRow(db: DB, sku: string): { id: number; key: string } | null {
  const r = db.prepare("SELECT id, sku, group_key FROM products WHERE sku = ?").get(sku) as { id: number; sku: string; group_key: string | null } | undefined;
  if (!r) return null;
  db.prepare("DELETE FROM products_fts WHERE rowid = ?").run(r.id);
  db.prepare("DELETE FROM product_tags WHERE product_id = ?").run(r.id);
  db.prepare("DELETE FROM products WHERE id = ?").run(r.id);
  return { id: r.id, key: keyOf(r) };
}
