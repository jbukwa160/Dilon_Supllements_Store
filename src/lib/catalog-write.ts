// Catalogue writes from the admin panel (SPEC §5.5). Every change is journaled in store.db product_edits (merged with
// earlier edits, keeping an `original` snapshot of the catalogue values before the first change) so it survives the
// next CSV import, then applied to catalog.db with its derived data refreshed: FTS, facet tags, family, prices,
// category / brand / goal counts.
import "server-only";
import type Database from "better-sqlite3";
import { catalogDb, storeDb } from "./db";
import { findCategoryIn, mergeCategories, mergeGoals, type CategoryEntry } from "./categories";
import {
  affectedCards,
  applyProductEdit,
  brandIndex,
  deleteProductRow,
  insertCustomProduct,
  refreshAggregates,
  refreshFamilies,
  refreshListing,
  refreshTags,
  reindexFts,
  snapshotProduct,
  type EditContext,
  type EditEffects,
  type FamilyNameEdit,
  type ProductEditData,
  type ProductSnapshot,
} from "./catalog-sync";
import { recomputePrices } from "./pricing-rules";

export type { FamilyNameEdit, ProductEditData, ProductSnapshot } from "./catalog-sync";

type DB = Database.Database;
type JournalRow = { sku: string; custom: number; deleted: number; data: string; original: string | null; updated_at: string };

/** A setting read fresh from store.db (not the per-request cache: an action may have just saved it). */
function readSetting(key: string): unknown {
  const row = storeDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

function currentCategories(): CategoryEntry[] {
  return mergeCategories(readSetting("categories"));
}

function editContext(db: DB, categories: CategoryEntry[], now: string): EditContext {
  return {
    resolveCategory: (slug) => {
      const f = findCategoryIn(categories, slug);
      return f ? { category: f.category.slug, sub: f.sub?.slug ?? null } : null;
    },
    brands: brandIndex(db),
    now,
  };
}

/** Drop keys whose value is `undefined` (JSON would lose them anyway). */
function clean(data: ProductEditData & FamilyNameEdit): ProductEditData & FamilyNameEdit {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as ProductEditData & FamilyNameEdit;
}

function parseData(v: string | null): Record<string, unknown> {
  try {
    const x: unknown = JSON.parse(v ?? "{}");
    return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Listing facets are memoized per catalogue version (catalog.ts): count this process' writes. */
function catalogWritten() {
  const g = globalThis as unknown as { __catalogWrites?: number };
  g.__catalogWrites = (g.__catalogWrites ?? 0) + 1;
}

/** Refresh everything derived from the touched products. */
function refreshAfter(db: DB, effects: (EditEffects & { sku: string })[], categories: CategoryEntry[]) {
  catalogWritten();
  if (!effects.length) return;
  const ids = effects.map((e) => e.id);
  db.transaction(() => {
    const ftsIds = effects.filter((e) => e.fts).map((e) => e.id);
    if (ftsIds.length) reindexFts(db, ftsIds);
    const keys = effects.flatMap((e) => e.familyKeys);
    // Family membership of the touched rows after the edit (a new group key joins another family).
    const rows = db.prepare(`SELECT sku, group_key FROM products WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as { sku: string; group_key: string | null }[];
    for (const r of rows) keys.push(r.group_key || `single#${r.sku}`);
    refreshFamilies(db, keys);
    const cards = affectedCards(db, [...ids, ...effects.map((e) => e.oldCard).filter((c): c is number => c !== null)]);
    refreshTags(db, cards);
    refreshListing(db, cards);
  })();
  const priced = effects.filter((e) => e.prices).map((e) => e.sku);
  if (priced.length) recomputePrices({ skus: priced });
  refreshAggregates(db, categories, mergeGoals(readSetting("goals")));
}

/**
 * Apply admin edits (by SKU). Journals them into store.db product_edits (merged with earlier edits; the first edit
 * stores the `original` catalogue values), applies them to the catalogue and refreshes FTS, tags, families, prices of
 * the touched SKUs and the aggregates. Unknown SKUs are skipped. Returns how many products were changed.
 */
export function saveProductEdits(edits: { sku: string; data: ProductEditData & FamilyNameEdit }[]): { changed: number } {
  const db = catalogDb();
  const store = storeDb();
  const now = new Date().toISOString();
  const categories = currentCategories();
  const ctx = editContext(db, categories, now);
  const getJournal = store.prepare("SELECT sku, custom, deleted, data, original, updated_at FROM product_edits WHERE sku = ?");
  const journal: { sku: string; custom: number; data: string; original: string | null }[] = [];
  const effects: (EditEffects & { sku: string })[] = [];

  db.transaction(() => {
    for (const e of edits) {
      const sku = e.sku?.trim();
      const data = clean(e.data ?? {});
      if (!sku || !Object.keys(data).length) continue;
      const prev = getJournal.get(sku) as JournalRow | undefined;
      const snapshot = prev?.original ? null : snapshotProduct(db, sku);
      const fx = applyProductEdit(db, sku, data, ctx);
      if (!fx) continue;
      effects.push({ ...fx, sku });
      journal.push({
        sku,
        custom: prev?.custom ?? 0,
        data: JSON.stringify({ ...parseData(prev?.data ?? null), ...data }),
        original: prev?.original ?? (snapshot ? JSON.stringify(snapshot) : null),
      });
    }
  })();

  const upsert = store.prepare(
    `INSERT INTO product_edits (sku, custom, deleted, data, original, updated_at) VALUES (?, ?, 0, ?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET data = excluded.data, original = COALESCE(product_edits.original, excluded.original), deleted = 0,
       updated_at = excluded.updated_at`,
  );
  store.transaction(() => {
    for (const j of journal) upsert.run(j.sku, j.custom, j.data, j.original, now);
  })();
  refreshAfter(db, effects, categories);
  return { changed: effects.length };
}

// Product ids are never reused: saved carts, wishlists and links refer to products by id, so the id of a deleted
// product must not come back as a different one. The highest id ever given out is kept in store.db (settings
// "_last_product_id"); the CSV importer allocates new ids above it too.
const LAST_ID_KEY = "_last_product_id";

function lastProductId(): number {
  const row = storeDb().prepare("SELECT value FROM settings WHERE key = ?").get(LAST_ID_KEY) as { value: string } | undefined;
  const n = Number(row ? JSON.parse(row.value) : 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Remember that ids up to `id` have been used. */
function noteProductId(id: number) {
  if (id <= lastProductId()) return;
  storeDb()
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(LAST_ID_KEY, JSON.stringify(id), new Date().toISOString());
}

/** Next free "SP-…" SKU for a product created in the admin. */
function nextCustomSku(db: DB): string {
  const used = [
    ...(db.prepare("SELECT sku FROM products WHERE sku LIKE 'SP-%'").all() as { sku: string }[]),
    ...(storeDb().prepare("SELECT sku FROM product_edits WHERE sku LIKE 'SP-%'").all() as { sku: string }[]),
  ].map((r) => Number(r.sku.slice(3)) || 0);
  return `SP-${Math.max(1000, ...used) + 1}`;
}

/** A product that is not in the CSV (created in Admin → Продукти → Нов). Returns its id and SKU. */
export function createCustomProduct(data: ProductEditData & FamilyNameEdit & { name: string; price: number; category: string }): { id: number; sku: string } {
  const db = catalogDb();
  const store = storeDb();
  if (!data.name?.trim()) throw new Error("Името е задължително.");
  if (!(data.price > 0)) throw new Error("Цената трябва да е по-голяма от 0.");
  const now = new Date().toISOString();
  const categories = currentCategories();
  const ctx = editContext(db, categories, now);
  if (!ctx.resolveCategory(data.category)) throw new Error("Непозната категория.");
  const sku = nextCustomSku(db);
  const { id: maxId } = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM products").get() as { id: number };
  let id = 0;
  const payload = clean(data) as ProductEditData & FamilyNameEdit & { name: string; price: number; category: string };
  db.transaction(() => {
    id = insertCustomProduct(db, sku, payload, { ctx, id: Math.max(maxId, lastProductId()) + 1, created: now });
  })();
  noteProductId(id);
  store
    .prepare("INSERT OR REPLACE INTO product_edits (sku, custom, deleted, data, original, updated_at) VALUES (?, 1, 0, ?, NULL, ?)")
    .run(sku, JSON.stringify({ ...payload, created: now }), now);
  const row = db.prepare("SELECT group_key FROM products WHERE id = ?").get(id) as { group_key: string | null };
  refreshAfter(db, [{ id, sku, oldCard: null, fts: true, tags: true, familyKeys: [row.group_key || `single#${sku}`], prices: true, aggregates: true }], categories);
  return { id, sku };
}

/** Delete a product created in the admin (CSV products can only be hidden). */
export function deleteCustomProduct(sku: string): void {
  const db = catalogDb();
  const store = storeDb();
  const j = store.prepare("SELECT custom FROM product_edits WHERE sku = ?").get(sku) as { custom: number } | undefined;
  const row = db.prepare("SELECT custom FROM products WHERE sku = ?").get(sku) as { custom: number } | undefined;
  if (!j?.custom && !row?.custom) throw new Error("Само продукти, създадени в админ панела, могат да се изтриват.");
  db.transaction(() => {
    const members = db.prepare("SELECT id FROM products WHERE card_id = (SELECT card_id FROM products WHERE sku = ?)").all(sku) as { id: number }[];
    const gone = deleteProductRow(db, sku);
    if (!gone) return;
    noteProductId(gone.id);
    refreshFamilies(db, [gone.key]);
    const cards = affectedCards(db, [gone.id, ...members.map((m) => m.id)]);
    refreshTags(db, cards);
    refreshListing(db, cards);
  })();
  store.prepare("UPDATE product_edits SET deleted = 1, updated_at = ? WHERE sku = ?").run(new Date().toISOString(), sku);
  refreshAggregates(db, currentCategories(), mergeGoals(readSetting("goals")));
  catalogWritten();
}

/** Undo every admin change of a CSV product: back to the catalogue values before the first edit. */
export function restoreProductOriginal(sku: string): void {
  const db = catalogDb();
  const store = storeDb();
  const j = store.prepare("SELECT sku, custom, deleted, data, original, updated_at FROM product_edits WHERE sku = ?").get(sku) as JournalRow | undefined;
  if (!j || j.custom) return;
  const now = new Date().toISOString();
  const categories = currentCategories();
  const effects: (EditEffects & { sku: string })[] = [];
  if (j.original) {
    const original = parseData(j.original) as ProductSnapshot;
    const { demoPrice, ...data } = original;
    db.transaction(() => {
      const fx = applyProductEdit(db, sku, data, editContext(db, categories, now));
      if (fx) {
        db.prepare("UPDATE products SET admin_edited = 0, demo_price = ? WHERE sku = ?").run(demoPrice ? 1 : 0, sku);
        effects.push({ ...fx, sku, fts: true, tags: true, prices: true, aggregates: true });
      }
    })();
  }
  store.prepare("DELETE FROM product_edits WHERE sku = ?").run(sku);
  refreshAfter(db, effects, categories);
}

// ---------------------------------------------------------------------------
// Additional helpers for the admin (additive to SPEC §5.5)

/** The admin journal of a product: its merged edit data and the original catalogue values, or null. */
export function getProductEdit(sku: string): { custom: boolean; data: ProductEditData; original: ProductSnapshot | null; updatedAt: string } | null {
  const j = storeDb().prepare("SELECT sku, custom, deleted, data, original, updated_at FROM product_edits WHERE sku = ?").get(sku) as JournalRow | undefined;
  if (!j || j.deleted) return null;
  return {
    custom: !!j.custom,
    data: parseData(j.data) as ProductEditData,
    original: j.original ? (parseData(j.original) as ProductSnapshot) : null,
    updatedAt: j.updated_at,
  };
}

/** Recount categories / brands / goals — after Admin → Категории saved new names, order or goals. */
export function refreshCatalogAggregates(): void {
  refreshAggregates(catalogDb(), currentCategories(), mergeGoals(readSetting("goals")));
  catalogWritten();
}
