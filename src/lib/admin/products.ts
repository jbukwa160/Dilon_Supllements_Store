import "server-only";
import type { NutritionRow, ProductForm, ProductKind } from "@/lib/catalog-types";
import { catalogDb, parseJson, storeDb } from "@/lib/db";
import { getCategoryEntries, getGoalEntries, shopVisibleSql } from "@/lib/catalog";
import { categoryLabelIn, categoryOptionsIn } from "@/lib/categories";
import { getProductEdit } from "@/lib/catalog-write";
import { lowestPrice30 } from "@/lib/pricing-rules";
import { searchMatchSql } from "@/lib/search-query";
import { isManufacturerComplete, getManufacturer } from "@/lib/manufacturers";
import { DIETS, FORMS } from "@/lib/taxonomy";
import { KIND_LABELS, isProductKind, moneyText, type ProductPayload } from "./validate";

// Admin → Продукти: the searchable product table (every variant is its own row) and the data of the product
// editor. Writes go through lib/catalog-write.ts (journaled, survive re-imports).

// ---------------------------------------------------------------------------
// Search, filters, sorting

export const ADMIN_FILTERS = {
  all: "Всички",
  visible: "Показани в сайта",
  hidden: "Скрити",
  sale: "В промоция",
  noimage: "Без снимка",
  demo: "С демо цена",
  adult: "Само за 18+",
  nolabel: "Без етикетна информация",
  custom: "Добавени ръчно",
  edited: "Редактирани от мен",
} as const;
export type AdminFilter = keyof typeof ADMIN_FILTERS;

export const STOCK_FILTERS = { "": "Всички", in: "Налични", out: "Изчерпани" } as const;
export type StockFilter = keyof typeof STOCK_FILTERS;

export const ADMIN_SORTS = {
  popular: "Популярни",
  name: "Име (А–Я)",
  "price-asc": "Цена ↑",
  "price-desc": "Цена ↓",
  "stock-desc": "Наличност ↓",
  newest: "Най-нови",
  edited: "Последно редактирани",
} as const;
export type AdminSort = keyof typeof ADMIN_SORTS;

export const ADMIN_PER_PAGE = 40;

export type AdminQuery = {
  q: string;
  /** Top or sub category slug, "" = all. */
  category: string;
  /** Brand name as typed ("" = all). */
  brand: string;
  stock: StockFilter;
  kind: ProductKind | "";
  filter: AdminFilter;
};

type RawParams = Record<string, string | string[] | undefined>;

/** The table's state from the address bar (/admin/produkti?q=&kat=&marka=&nalichnost=&vid=&filter=&sort=&page=). */
export function parseAdminQuery(sp: RawParams): AdminQuery & { sort: AdminSort; page: number } {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const filter = one("filter");
  const sort = one("sort");
  const stock = one("nalichnost");
  const kind = one("vid");
  return {
    q: one("q").trim().slice(0, 100),
    category: one("kat").slice(0, 60),
    brand: one("marka").trim().slice(0, 80),
    stock: stock in STOCK_FILTERS ? (stock as StockFilter) : "",
    kind: isProductKind(kind) ? kind : "",
    filter: filter in ADMIN_FILTERS ? (filter as AdminFilter) : "all",
    sort: sort in ADMIN_SORTS ? (sort as AdminSort) : "popular",
    page: Math.max(1, Math.min(100000, parseInt(one("page") || "1", 10) || 1)),
  };
}

/** Link to the table with this state (defaults left out). */
export function adminProductsHref(s: AdminQuery & { sort: AdminSort; page: number }): string {
  const u = new URLSearchParams();
  if (s.q) u.set("q", s.q);
  if (s.category) u.set("kat", s.category);
  if (s.brand) u.set("marka", s.brand);
  if (s.stock) u.set("nalichnost", s.stock);
  if (s.kind) u.set("vid", s.kind);
  if (s.filter !== "all") u.set("filter", s.filter);
  if (s.sort !== "popular") u.set("sort", s.sort);
  if (s.page > 1) u.set("page", String(s.page));
  return `/admin/produkti${u.size ? `?${u}` : ""}`;
}

export const hasAdminFilters = (s: AdminQuery) => !!(s.q || s.category || s.brand || s.stock || s.kind || s.filter !== "all");

/** Label information a food still lacks (keep close to labelChecklist in validate.ts; the brand's operator is checked in the editor). */
const NO_LABEL_SQL = `(p.product_kind <> 'non-food' AND (
  COALESCE(p.ingredients, '') = '' OR COALESCE(p.allergens, '') = '' OR COALESCE(p.net_quantity, '') = '' OR COALESCE(p.storage, '') = ''
  OR p.nutrition = '[]' OR (p.product_kind = 'supplement' AND (COALESCE(p.serving_size, '') = '' OR COALESCE(p.directions, '') = '' OR COALESCE(p.reg_no, '') = ''))))`;

/** WITH / FROM / WHERE of the admin search (shared by the table and "apply to everything found"). */
function adminQuerySql(opts: AdminQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  let from = "products p";
  let cte = "";
  let cteParams: unknown[] = [];
  // Name, brand, SKU or barcode (whole or a part); exact SKU / barcode matches are listed first.
  const m = opts.q ? searchMatchSql(opts.q, { admin: true }) : null;
  if (opts.q && !m) where.push("0");
  if (m) {
    cte = `WITH m AS (${m.sql}) `;
    from += " JOIN m ON m.id = p.id";
    cteParams = m.params;
  }
  if (opts.category) {
    where.push("(p.category = ? OR p.subcategory = ?)");
    params.push(opts.category, opts.category);
  }
  if (opts.brand) {
    // A brand picked from the list (exact name) → its products; any other text → brands containing it.
    const exact = catalogDb().prepare("SELECT slug FROM brands WHERE name = ? COLLATE NOCASE").get(opts.brand) as { slug: string } | undefined;
    if (exact) {
      where.push("p.brand_slug = ?");
      params.push(exact.slug);
    } else {
      where.push("p.brand LIKE ? ESCAPE '\\'");
      params.push(`%${opts.brand.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
  }
  if (opts.stock === "in") where.push("p.stock > 0");
  if (opts.stock === "out") where.push("p.stock <= 0");
  if (opts.kind) {
    where.push("p.product_kind = ?");
    params.push(opts.kind);
  }
  switch (opts.filter) {
    case "visible":
      // What the shop really shows: not hidden and — with "Скрий продукти без снимка" on — with a picture.
      where.push(`(${shopVisibleSql("p")})`);
      break;
    case "hidden":
      where.push("p.hidden = 1");
      break;
    case "sale":
      where.push("p.price < p.base_price - 0.001");
      break;
    case "noimage":
      where.push("p.image IS NULL");
      break;
    case "demo":
      where.push("p.demo_price = 1");
      break;
    case "adult":
      where.push("p.adult_only = 1");
      break;
    case "nolabel":
      where.push(NO_LABEL_SQL);
      break;
    case "custom":
      where.push("p.custom = 1");
      break;
    case "edited":
      where.push("p.admin_edited = 1");
      break;
  }
  return { cte, from, whereSql: where.length ? ` WHERE ${where.join(" AND ")}` : "", params: [...cteParams, ...params], searched: !!m };
}

/** SKUs of every product the search finds (all pages) — for "apply to all found". */
export function adminProductSkus(opts: AdminQuery): string[] {
  const { cte, from, whereSql, params } = adminQuerySql(opts);
  return (catalogDb().prepare(`${cte}SELECT p.sku FROM ${from}${whereSql}`).all(...params) as { sku: string }[]).map((r) => r.sku);
}

// ---------------------------------------------------------------------------
// Table rows

export type AdminProductRow = {
  id: number;
  sku: string;
  ean: string | null;
  slug: string;
  name: string;
  /** "Шоколад · 1 кг" for a family member. */
  variant: string | null;
  brand: string | null;
  /** Name of the subcategory (or category), as edited in Admin → Категории. */
  categoryLabel: string;
  /** Regular price. */
  basePrice: number;
  salePrice: number | null;
  saleEndsAt: string | null;
  /** What the customer pays now (after the sale price and promotions). */
  price: number;
  /** Struck-through Omnibus reference price, if any. */
  oldPrice: number | null;
  promoId: number | null;
  stock: number;
  hidden: boolean;
  image: string | null;
  adminEdited: boolean;
  custom: boolean;
  demoPrice: boolean;
  adultOnly: boolean;
  kind: ProductKind;
  familySize: number;
};

type RowRaw = {
  id: number;
  sku: string;
  ean: string | null;
  slug: string;
  name: string;
  flavour: string | null;
  size_label: string | null;
  brand: string | null;
  category: string;
  subcategory: string | null;
  base_price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  price: number;
  old_price: number | null;
  promo_id: number | null;
  stock: number;
  hidden: number;
  image: string | null;
  admin_edited: number;
  custom: number;
  demo_price: number;
  adult_only: number;
  product_kind: string;
  variant_count: number | null;
};

const ROW_COLS = `p.id, p.sku, p.ean, p.slug, p.name, p.flavour, p.size_label, p.brand, p.category, p.subcategory, p.base_price, p.sale_price,
  p.sale_ends_at, p.price, p.old_price, p.promo_id, p.stock, p.hidden, p.image, p.admin_edited, p.custom, p.demo_price, p.adult_only,
  p.product_kind, (SELECT g.variant_count FROM product_groups g WHERE g.id = p.group_id) AS variant_count`;

function toRow(r: RowRaw, entries = getCategoryEntries()): AdminProductRow {
  return {
    id: r.id,
    sku: r.sku,
    ean: r.ean,
    slug: r.slug,
    name: r.name,
    variant: [r.flavour, r.size_label].filter(Boolean).join(" · ") || null,
    brand: r.brand,
    categoryLabel: categoryLabelIn(entries, "bg", r.category, r.subcategory),
    basePrice: r.base_price,
    salePrice: r.sale_price,
    saleEndsAt: r.sale_ends_at,
    price: r.price,
    oldPrice: r.old_price,
    promoId: r.promo_id,
    stock: r.stock,
    hidden: !!r.hidden,
    image: r.image,
    adminEdited: !!r.admin_edited,
    custom: !!r.custom,
    demoPrice: !!r.demo_price,
    adultOnly: !!r.adult_only,
    kind: isProductKind(r.product_kind) ? r.product_kind : "supplement",
    familySize: r.variant_count ?? 1,
  };
}

const ORDER: Record<AdminSort, string> = {
  popular: "p.popularity DESC, p.id",
  name: "p.name COLLATE NOCASE, p.id",
  "price-asc": "p.price ASC, p.id",
  "price-desc": "p.price DESC, p.id",
  "stock-desc": "p.stock DESC, p.id",
  newest: "p.created_at DESC, p.id DESC",
  edited: "p.admin_edited DESC, p.updated_at DESC, p.id DESC",
};

export function listAdminProducts(opts: AdminQuery & { sort: AdminSort; page: number }) {
  const db = catalogDb();
  const { cte, from, whereSql, params, searched } = adminQuerySql(opts);
  const order = (searched ? "m.exact DESC, m.rank, " : "") + ORDER[opts.sort];
  const total = (db.prepare(`${cte}SELECT COUNT(*) AS n FROM ${from}${whereSql}`).get(...params) as { n: number }).n;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PER_PAGE));
  const page = Math.min(Math.max(1, opts.page), pageCount);
  const entries = getCategoryEntries();
  const items = (
    db.prepare(`${cte}SELECT ${ROW_COLS} FROM ${from}${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, ADMIN_PER_PAGE, (page - 1) * ADMIN_PER_PAGE) as RowRaw[]
  ).map((r) => toRow(r, entries));
  return { items, total, page, pageCount };
}

/** Current table values of these products (for the inline-edit action). */
export function adminRowsById(ids: number[]): Map<number, AdminProductRow> {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);
  if (!clean.length) return new Map();
  const rows = catalogDb()
    .prepare(`SELECT ${ROW_COLS} FROM products p WHERE p.id IN (${clean.map(() => "?").join(",")})`)
    .all(...clean) as RowRaw[];
  const entries = getCategoryEntries();
  return new Map(rows.map((r) => [r.id, toRow(r, entries)]));
}

export function skusByIds(ids: number[]): string[] {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);
  if (!clean.length) return [];
  return (catalogDb().prepare(`SELECT sku FROM products WHERE id IN (${clean.map(() => "?").join(",")})`).all(...clean) as { sku: string }[]).map((r) => r.sku);
}

// ---------------------------------------------------------------------------
// The product editor

export type FamilyMember = {
  id: number;
  sku: string;
  slug: string;
  name: string;
  flavour: string | null;
  size: string | null;
  price: number;
  stock: number;
  hidden: boolean;
  image: string | null;
  isPrimary: boolean;
};

export type PriceHistoryRow = { price: number; at: string };

export type ActivePromotion = { id: number; name: string; percent: number; endsAt: string | null };

export type AdminProduct = {
  id: number;
  sku: string;
  slug: string;
  name: string;
  nameEn: string;
  brand: string;
  brandSlug: string | null;
  /** Subcategory slug if any, else the category slug. */
  category: string;
  categoryLabel: string;
  ean: string;
  kind: ProductKind;
  form: ProductForm | null;
  featured: boolean;
  hidden: boolean;
  weightKg: number | null;
  basePrice: number;
  salePrice: number | null;
  saleEndsAt: string | null;
  price: number;
  oldPrice: number | null;
  lowest30: number | null;
  /** Lowest price of the last 30 days — the Omnibus reference a new reduction would be compared with. */
  omnibus: number | null;
  discountSince: string | null;
  promotion: ActivePromotion | null;
  stock: number;
  adultOnly: boolean;
  regNo: string;
  servingSize: string;
  servings: number | null;
  netQuantity: string;
  ingredients: string;
  allergens: string;
  nutrition: NutritionRow[];
  directions: string;
  warnings: string;
  storage: string;
  description: string;
  descriptionEn: string;
  images: string[];
  flavour: string;
  flavourEn: string;
  size: string;
  /** Effective family key (the product's own "single#SKU" when standalone). */
  familyKey: string;
  /** How the family was set: automatic (importer), by hand into another family, or standalone by hand. */
  familyMode: "auto" | "manual" | "single";
  family: FamilyMember[];
  /** The family card's name set by hand ("" = automatic: the members' name without flavour / size). */
  familyName: string;
  /** The name the family card shows now (automatic or set by hand). */
  familyCardName: string;
  goals: string[];
  diets: string[];
  custom: boolean;
  adminEdited: boolean;
  demoPrice: boolean;
  canRestore: boolean;
  editedAt: string | null;
  createdAt: string | null;
  sourceCategory: string | null;
  /** The brand's food business operator is filled in (Производители). */
  manufacturerComplete: boolean;
  manufacturerName: string | null;
};

type DetailRaw = RowRaw & {
  name_en: string | null;
  brand_slug: string | null;
  form: string | null;
  featured: number;
  weight: number | null;
  lowest30: number | null;
  discount_since: string | null;
  reg_no: string | null;
  serving_size: string | null;
  servings: number | null;
  net_quantity: string | null;
  ingredients: string | null;
  allergens: string | null;
  nutrition: string;
  directions: string | null;
  warnings: string | null;
  storage: string | null;
  description: string | null;
  description_en: string | null;
  images: string;
  flavour_en: string | null;
  group_id: number | null;
  group_key: string | null;
  auto_group_key: string | null;
  goals: string;
  diets: string;
  created_at: string | null;
  source_category: string | null;
  family_name: string | null;
  family_card_name: string | null;
};

const list = (v: string | null): string[] => (parseJson<unknown[]>(v) ?? []).filter((x): x is string => typeof x === "string");

export function getAdminProduct(id: number): AdminProduct | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = catalogDb();
  const r = db
    .prepare(
      `SELECT ${ROW_COLS}, p.name_en, p.brand_slug, p.form, p.featured, p.weight, p.lowest30, p.discount_since, p.reg_no, p.serving_size,
         p.servings, p.net_quantity, p.ingredients, p.allergens, p.nutrition, p.directions, p.warnings, p.storage, p.description,
         p.description_en, p.images, p.flavour_en, p.group_id, p.group_key, p.auto_group_key, p.goals, p.diets, p.created_at, p.source_category,
         p.family_name, (SELECT g.name FROM product_groups g WHERE g.id = p.group_id) AS family_card_name
       FROM products p WHERE p.id = ?`,
    )
    .get(id) as DetailRaw | undefined;
  if (!r) return null;
  const row = toRow(r);
  let images = list(r.images);
  if (!images.length && r.image) images = [r.image];
  const nutrition = (parseJson<unknown[]>(r.nutrition) ?? []).flatMap((x): NutritionRow[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
    return s("name") ? [{ name: s("name"), perServing: s("perServing"), per100: s("per100"), nrv: s("nrv") }] : [];
  });
  const familyKey = r.group_key || `single#${r.sku}`;
  const familyMode = r.group_key && r.group_key !== r.auto_group_key ? (r.group_key === `single#${r.sku}` ? "single" : "manual") : "auto";
  const edit = getProductEdit(r.sku);
  const manufacturer = getManufacturer(r.brand_slug, r.brand);
  return {
    id: r.id,
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    nameEn: r.name_en ?? "",
    brand: r.brand ?? "",
    brandSlug: r.brand_slug,
    category: r.subcategory ?? r.category,
    categoryLabel: row.categoryLabel,
    ean: r.ean ?? "",
    kind: row.kind,
    form: FORMS.some((f) => f.key === r.form) ? (r.form as ProductForm) : null,
    featured: !!r.featured,
    hidden: row.hidden,
    weightKg: r.weight,
    basePrice: r.base_price,
    salePrice: r.sale_price,
    saleEndsAt: r.sale_ends_at,
    price: r.price,
    oldPrice: r.old_price,
    lowest30: r.lowest30,
    omnibus: lowestPrice30(r.sku),
    discountSince: r.discount_since,
    promotion: r.promo_id ? promotionById(r.promo_id) : null,
    stock: r.stock,
    adultOnly: row.adultOnly,
    regNo: r.reg_no ?? "",
    servingSize: r.serving_size ?? "",
    servings: r.servings,
    netQuantity: r.net_quantity ?? "",
    ingredients: r.ingredients ?? "",
    allergens: r.allergens ?? "",
    nutrition,
    directions: r.directions ?? "",
    warnings: r.warnings ?? "",
    storage: r.storage ?? "",
    description: r.description ?? "",
    descriptionEn: r.description_en ?? "",
    images,
    flavour: r.flavour ?? "",
    flavourEn: r.flavour_en ?? "",
    size: r.size_label ?? "",
    familyKey,
    familyMode,
    family: r.group_id !== null ? familyMembers(r.group_id) : [],
    familyName: familyNameOverride(r.group_id, r.family_name),
    familyCardName: r.family_card_name ?? r.name,
    goals: list(r.goals),
    diets: list(r.diets),
    custom: row.custom,
    adminEdited: row.adminEdited,
    demoPrice: row.demoPrice,
    canRestore: !!edit && !edit.custom && !!edit.original,
    editedAt: edit?.updatedAt ?? null,
    createdAt: r.created_at,
    sourceCategory: r.source_category,
    manufacturerComplete: isManufacturerComplete(manufacturer),
    manufacturerName: manufacturer?.name ?? null,
  };
}

/** The editor's form values of a saved product (numbers as text, the way the admin types them). */
export function productPayload(p: AdminProduct): ProductPayload {
  return {
    name: p.name,
    nameEn: p.nameEn,
    brand: p.brand,
    category: p.category,
    ean: p.ean,
    kind: p.kind,
    form: p.form ?? "",
    featured: p.featured,
    hidden: p.hidden,
    weightKg: p.weightKg == null ? "" : String(p.weightKg).replace(".", ","),
    price: moneyText(p.basePrice),
    salePrice: moneyText(p.salePrice),
    saleEndsAt: p.salePrice != null ? (p.saleEndsAt ?? "") : "",
    stock: String(p.stock),
    adultOnly: p.adultOnly,
    regNo: p.regNo,
    servingSize: p.servingSize,
    servings: p.servings == null ? "" : String(p.servings),
    netQuantity: p.netQuantity,
    ingredients: p.ingredients,
    allergens: p.allergens,
    nutrition: p.nutrition,
    directions: p.directions,
    warnings: p.warnings,
    storage: p.storage,
    description: p.description,
    descriptionEn: p.descriptionEn,
    images: p.images,
    flavour: p.flavour,
    flavourEn: p.flavourEn,
    size: p.size,
    groupKey: p.familyMode === "auto" ? null : p.familyMode === "single" ? "" : p.familyKey,
    familyName: p.familyName,
    goals: p.goals,
    diets: p.diets,
  };
}

/**
 * The family card name set by hand: any member may carry it (the importer / catalogue use the most recently edited
 * one), so the editor shows the family's value, not only this product's.
 */
export function familyNameOverride(groupId: number | null, own: string | null): string {
  if (groupId === null) return own?.trim() ?? "";
  const r = catalogDb()
    .prepare("SELECT family_name FROM products WHERE group_id = ? AND TRIM(COALESCE(family_name, '')) <> '' ORDER BY updated_at DESC LIMIT 1")
    .get(groupId) as { family_name: string } | undefined;
  return r?.family_name.trim() ?? "";
}

/** Members of a family, in selector order. */
export function familyMembers(groupId: number): FamilyMember[] {
  const rows = catalogDb()
    .prepare("SELECT id, sku, slug, name, flavour, size_label, price, stock, hidden, image, is_primary FROM products WHERE group_id = ? ORDER BY variant_sort, id")
    .all(groupId) as {
    id: number;
    sku: string;
    slug: string;
    name: string;
    flavour: string | null;
    size_label: string | null;
    price: number;
    stock: number;
    hidden: number;
    image: string | null;
    is_primary: number;
  }[];
  return rows.map((m) => ({
    id: m.id,
    sku: m.sku,
    slug: m.slug,
    name: m.name,
    flavour: m.flavour,
    size: m.size_label,
    price: m.price,
    stock: m.stock,
    hidden: !!m.hidden,
    image: m.image,
    isPrimary: !!m.is_primary,
  }));
}

/** The family a product belongs to (its key and members), for "join the family of …" in the editor. */
export function familyOfProduct(id: number): { key: string; name: string; members: FamilyMember[] } | null {
  const r = catalogDb().prepare("SELECT id, sku, name, group_id, group_key FROM products WHERE id = ?").get(id) as
    | { id: number; sku: string; name: string; group_id: number | null; group_key: string | null }
    | undefined;
  if (!r) return null;
  const members = r.group_id !== null ? familyMembers(r.group_id) : [];
  return { key: r.group_key || `single#${r.sku}`, name: r.name, members };
}

function promotionById(id: number): ActivePromotion | null {
  try {
    const p = storeDb().prepare("SELECT id, name, percent, ends_at FROM promotions WHERE id = ?").get(id) as
      | { id: number; name: string; percent: number; ends_at: string | null }
      | undefined;
    return p ? { id: p.id, name: p.name, percent: p.percent, endsAt: p.ends_at } : null;
  } catch {
    return null;
  }
}

/** Effective price changes of a product, newest first (store.db price_history). */
export function priceHistory(sku: string, limit = 30): { rows: PriceHistoryRow[]; total: number } {
  const db = storeDb();
  const rows = db.prepare("SELECT price, at FROM price_history WHERE sku = ? ORDER BY at DESC, id DESC LIMIT ?").all(sku, limit) as PriceHistoryRow[];
  const total = (db.prepare("SELECT COUNT(*) AS n FROM price_history WHERE sku = ?").get(sku) as { n: number }).n;
  return { rows, total };
}

// ---------------------------------------------------------------------------
// Choices for the editor and the filters

export type CategoryOption = { slug: string; name: string; hidden: boolean; subs: { slug: string; name: string }[] };
export type Choice = { key: string; label: string; hidden?: boolean };

/** Categories as edited in Admin → Категории (hidden ones too). */
export function categoryChoices(): CategoryOption[] {
  return categoryOptionsIn(getCategoryEntries());
}

/** Every category and subcategory address (validation). */
export function categorySlugs(): Set<string> {
  return new Set(getCategoryEntries().flatMap((c) => [c.slug, ...c.subs.map((s) => s.slug)]));
}

export function goalChoices(): Choice[] {
  return getGoalEntries().map((g) => ({ key: g.slug, label: g.name.bg, hidden: g.hidden }));
}

export function dietChoices(): Choice[] {
  return DIETS.map((d) => ({ key: d.key, label: d.name.bg }));
}

export const kindChoices = (): Choice[] => Object.entries(KIND_LABELS).map(([key, label]) => ({ key, label }));

/** Brand names for the "Марка" suggestions, most products first. */
export function brandNames(): string[] {
  return (catalogDb().prepare("SELECT name FROM brands ORDER BY count DESC, name COLLATE NOCASE").all() as { name: string }[]).map((r) => r.name);
}

export type ProductInfo = { sku: string; slug: string; name: string; image: string | null; price: number; stock: number; hidden: boolean; category: string };

/** Short product info by SKU (hidden products included), for admin pickers. */
export function productInfosBySku(skus: string[]): Record<string, ProductInfo> {
  const clean = [...new Set(skus.map((s) => String(s).trim()).filter(Boolean))].slice(0, 2000);
  if (!clean.length) return {};
  const out: Record<string, ProductInfo> = {};
  for (let i = 0; i < clean.length; i += 500) {
    const part = clean.slice(i, i + 500);
    const rows = catalogDb()
      .prepare(`SELECT sku, slug, name, image, price, stock, hidden, category FROM products WHERE sku IN (${part.map(() => "?").join(",")})`)
      .all(...part) as (Omit<ProductInfo, "hidden"> & { hidden: number })[];
    for (const r of rows) out[r.sku] = { ...r, hidden: !!r.hidden };
  }
  return out;
}
