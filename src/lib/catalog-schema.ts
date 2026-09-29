// Schema of data/catalog.db (SPEC §7.2). Shared by the importer (which builds a fresh file) and the site
// (which upgrades an older file on open), so no Next-only imports here.
import type Database from "better-sqlite3";
import { refreshListing, refreshTags } from "./catalog-sync";

type DB = Database.Database;

/** Bump when a table, column or index below is added; an open connection then re-runs ensureCatalogSchema. */
export const CATALOG_SCHEMA_REV = 3;

/** Columns of `products`, in table order. New columns go at the end (older files get them via ALTER TABLE). */
export const PRODUCT_COLUMNS: [string, string][] = [
  ["id", "INTEGER PRIMARY KEY"],
  ["sku", "TEXT NOT NULL UNIQUE"],
  ["slug", "TEXT NOT NULL UNIQUE"],
  ["name", "TEXT NOT NULL"],
  ["name_en", "TEXT"],
  ["brand", "TEXT"],
  ["brand_slug", "TEXT"],
  ["ean", "TEXT"],
  // Top category slug and subcategory slug (NULL = directly in the top category).
  ["category", "TEXT NOT NULL"],
  ["subcategory", "TEXT"],
  ["description", "TEXT"],
  ["description_en", "TEXT"],
  ["image", "TEXT"],
  ["images", "TEXT NOT NULL DEFAULT '[]'"],
  // Prices (EUR). base_price = regular price; price/old_price/lowest30/promo_* are materialized by recomputePrices().
  ["base_price", "REAL NOT NULL DEFAULT 0"],
  ["sale_price", "REAL"],
  ["sale_ends_at", "TEXT"],
  ["price", "REAL NOT NULL DEFAULT 0"],
  ["old_price", "REAL"],
  ["lowest30", "REAL"],
  ["discount_since", "TEXT"],
  ["promo_id", "INTEGER"],
  ["promo_label", "TEXT"],
  ["demo_price", "INTEGER NOT NULL DEFAULT 0"],
  ["stock", "INTEGER NOT NULL DEFAULT 0"],
  ["hidden", "INTEGER NOT NULL DEFAULT 0"],
  ["custom", "INTEGER NOT NULL DEFAULT 0"],
  // Families: every row is a purchasable product; rows of one family share group_id, one of them is the primary card.
  ["group_id", "INTEGER"],
  ["is_primary", "INTEGER NOT NULL DEFAULT 1"],
  ["flavour", "TEXT"],
  ["flavour_en", "TEXT"],
  ["size_label", "TEXT"],
  ["size_value", "REAL"],
  ["size_unit", "TEXT"],
  ["servings", "INTEGER"],
  ["variant_sort", "INTEGER NOT NULL DEFAULT 0"],
  // Label information (SPEC §11b).
  ["form", "TEXT"],
  ["serving_size", "TEXT"],
  ["net_quantity", "TEXT"],
  ["ingredients", "TEXT"],
  ["nutrition", "TEXT NOT NULL DEFAULT '[]'"],
  ["directions", "TEXT"],
  ["warnings", "TEXT"],
  ["allergens", "TEXT"],
  ["storage", "TEXT"],
  ["is_supplement", "INTEGER NOT NULL DEFAULT 0"],
  ["product_kind", "TEXT NOT NULL DEFAULT 'supplement'"],
  ["adult_only", "INTEGER NOT NULL DEFAULT 0"],
  ["reg_no", "TEXT"],
  ["goals", "TEXT NOT NULL DEFAULT '[]'"],
  ["diets", "TEXT NOT NULL DEFAULT '[]'"],
  ["featured", "INTEGER NOT NULL DEFAULT 0"],
  ["weight", "REAL"],
  ["vat_code", "TEXT"],
  ["popularity", "INTEGER NOT NULL DEFAULT 0"],
  ["source_category", "TEXT"],
  ["created_at", "TEXT"],
  ["updated_at", "TEXT"],
  // Additive (not in SPEC §7.2): family key computed by the importer, the admin override ("" = standalone),
  // and whether the admin changed the row (edits are re-applied after every import).
  ["auto_group_key", "TEXT"],
  ["group_key", "TEXT"],
  ["admin_edited", "INTEGER NOT NULL DEFAULT 0"],
  // The family's primary product (the listing card) — the product itself when standalone.
  ["card_id", "INTEGER"],
  // Placeholder "bestseller" flag until there are real sales (top products per category at import).
  ["bestseller", "INTEGER NOT NULL DEFAULT 0"],
  // rev 3: the name of the product's family card set in the admin (NULL = automatic, see refreshFamilies).
  ["family_name", "TEXT"],
];

const TABLES = `
CREATE TABLE IF NOT EXISTS products (
  ${PRODUCT_COLUMNS.map(([n, d]) => `${n} ${d}`).join(",\n  ")}
);
CREATE TABLE IF NOT EXISTS product_groups (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  slug TEXT,
  name TEXT NOT NULL,
  name_en TEXT,
  brand_slug TEXT,
  category TEXT,
  subcategory TEXT,
  primary_product_id INTEGER,
  variant_count INTEGER NOT NULL DEFAULT 1,
  flavour_count INTEGER NOT NULL DEFAULT 0,
  min_price REAL,
  max_price REAL,
  in_stock_any INTEGER NOT NULL DEFAULT 0,
  -- additive: any visible variant on sale; old price / Omnibus price of the cheapest variant (card "от" price)
  sale_any INTEGER NOT NULL DEFAULT 0,
  min_old_price REAL,
  min_lowest30 REAL
);
-- Facet tags per listing CARD (product_id = the family's primary product): a family has a tag when any visible
-- variant has it (flavour filter matches any variant of the family).
CREATE TABLE IF NOT EXISTS product_tags (
  product_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (kind, value, product_id)
) WITHOUT ROWID;
-- Additive: one narrow row per visible listing card (materialized from products + product_groups) so listings and
-- facets scan small rows. price = the card's "от" price; discount = (old − price) / old of that price.
CREATE TABLE IF NOT EXISTS listing (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  brand_slug TEXT,
  price REAL NOT NULL,
  in_stock INTEGER NOT NULL,
  on_sale INTEGER NOT NULL,
  discount REAL NOT NULL,
  featured INTEGER NOT NULL,
  popularity INTEGER NOT NULL,
  created_at TEXT,
  has_image INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  parent TEXT,
  name TEXT NOT NULL,
  name_en TEXT,
  position INTEGER,
  count INTEGER NOT NULL DEFAULT 0,
  in_stock INTEGER NOT NULL DEFAULT 0,
  image TEXT
);
CREATE TABLE IF NOT EXISTS brands (slug TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, in_stock INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS goals (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  position INTEGER,
  count INTEGER NOT NULL DEFAULT 0,
  image TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
-- Importer bookkeeping: the id and address every SKU ever had, so a product that leaves the shop (out of scope,
-- excluded, missing from one export) gets the same id and slug when it comes back. Not read by the site.
CREATE TABLE IF NOT EXISTS sku_registry (sku TEXT PRIMARY KEY, id INTEGER NOT NULL, slug TEXT NOT NULL) WITHOUT ROWID;
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, name_en, brand, sku, ean, keywords,
  tokenize = "unicode61 remove_diacritics 2"
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_products_list ON products (is_primary, hidden, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products (category, subcategory, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_products_sub ON products (subcategory, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand_slug, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_products_group ON products (group_id, variant_sort);
CREATE INDEX IF NOT EXISTS idx_products_price ON products (price);
CREATE INDEX IF NOT EXISTS idx_products_created ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_ean ON products (ean);
CREATE INDEX IF NOT EXISTS idx_products_sale ON products (popularity DESC) WHERE old_price IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_tags_product ON product_tags (product_id);
CREATE INDEX IF NOT EXISTS idx_products_card ON products (card_id);
CREATE INDEX IF NOT EXISTS idx_listing_rank ON listing (in_stock DESC, featured DESC, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_listing_cat ON listing (category, subcategory);
CREATE INDEX IF NOT EXISTS idx_listing_brand ON listing (brand_slug);
CREATE INDEX IF NOT EXISTS idx_listing_created ON listing (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_group_key ON products (group_key);
`;

/** Full schema of a fresh catalogue file (tables, FTS index and secondary indexes). */
export const CATALOG_SCHEMA = TABLES + INDEXES;

function readRev(db: DB): number {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_rev'").get() as { value: string } | undefined;
    return Number(row?.value ?? 0) || 0;
  } catch {
    return 0; // no meta table yet
  }
}

/**
 * Creates missing tables / indexes and adds missing `products` columns (additive only). Safe to call on every
 * open: an up-to-date file costs one small query. Returns true if anything changed (the caller then refreshes
 * the aggregate tables).
 */
export function ensureCatalogSchema(db: DB): boolean {
  const hasProducts = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'products'").get();
  if (hasProducts && readRev(db) >= CATALOG_SCHEMA_REV) return false;
  // Several processes (e.g. a production build) may open the file at once: the first one migrates, the others
  // wait for its lock and then find everything done.
  const timeout = db.pragma("busy_timeout", { simple: true }) as number;
  db.pragma("busy_timeout = 120000");
  try {
    return db.transaction(() => {
      if (hasProducts && readRev(db) >= CATALOG_SCHEMA_REV) return false;
      const hadListing = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'listing'").get();
      db.exec(TABLES);
      const cols = new Set((db.prepare("PRAGMA table_info(products)").all() as { name: string }[]).map((c) => c.name));
      for (const [name, def] of PRODUCT_COLUMNS) {
        if (cols.has(name)) continue;
        // ALTER TABLE cannot add PRIMARY KEY / UNIQUE columns; those exist since the first revision.
        db.exec(`ALTER TABLE products ADD COLUMN ${name} ${def.replace(/\s+UNIQUE\b/, "")}`);
      }
      const addMissing = (table: string, columns: [string, string][]) => {
        const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
        for (const [name, def] of columns) if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      };
      addMissing("categories", [["name_en", "TEXT"]]);
      addMissing("product_groups", [["sale_any", "INTEGER NOT NULL DEFAULT 0"], ["min_old_price", "REAL"], ["min_lowest30", "REAL"]]);
      db.exec(INDEXES);
      // A catalogue built before the listing table existed: derive it (and the card-level tags) once.
      if (hasProducts && !hadListing) {
        refreshTags(db);
        refreshListing(db);
      }
      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_rev', ?)").run(String(CATALOG_SCHEMA_REV));
      return true;
    }).immediate();
  } finally {
    db.pragma(`busy_timeout = ${Number(timeout) || 5000}`);
  }
}
