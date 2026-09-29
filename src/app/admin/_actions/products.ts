"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { catalogDb } from "@/lib/db";
import { snapshotProduct } from "@/lib/catalog-sync";
import { createCustomProduct, deleteCustomProduct, restoreProductOriginal, saveProductEdits, type FamilyNameEdit, type ProductEditData } from "@/lib/catalog-write";
import type { ProductKind } from "@/lib/catalog-types";
import {
  ADMIN_FILTERS,
  STOCK_FILTERS,
  adminProductSkus,
  adminRowsById,
  categorySlugs,
  dietChoices,
  familyOfProduct,
  getAdminProduct,
  goalChoices,
  productPayload,
  skusByIds,
  type AdminFilter,
  type AdminQuery,
  type FamilyMember,
  type StockFilter,
} from "@/lib/admin/products";
import { isProductKind, validateProduct, validateRow, type ProductPayload, type RowInput, type ValidationContext } from "@/lib/admin/validate";

// Admin → Продукти. Every action checks the session; the catalogue writes are journaled by lib/catalog-write.ts so a
// later CSV import keeps them, and refresh the search index, families, prices and category counts themselves.

export type ActionResult = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; id?: number; product?: ProductPayload };

/** Most products changed by one bulk action (the table's "everything found"). */
const BULK_MAX = 5000;

function publish() {
  revalidatePath("/", "layout");
}

function validationContext(): ValidationContext {
  return {
    categories: categorySlugs(),
    goals: new Set(goalChoices().map((g) => g.key)),
    diets: new Set(dietChoices().map((d) => d.key)),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Only the fields that differ from the catalogue, so a later CSV import still updates the rest. */
function changedFields(before: ProductEditData, after: ProductEditData): ProductEditData {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    const prev = (before as Record<string, unknown>)[k];
    // Empty text and "not set" are the same thing in the catalogue.
    if (typeof v === "string" && !v && (prev === null || prev === undefined || prev === "")) continue;
    if (!same(prev, v)) out[k] = v;
  }
  return out as ProductEditData;
}

export async function saveProductAction(id: number, payload: ProductPayload): Promise<ActionResult> {
  await requireAdmin();
  const current = getAdminProduct(Number(id));
  if (!current) return { error: "Продуктът не е намерен — може да е изтрит." };
  const { value, errors } = validateProduct(payload, validationContext());
  if (!value) return { error: "Моля, поправете маркираните полета.", fieldErrors: errors };
  const before = snapshotProduct(catalogDb(), current.sku);
  if (!before) return { error: "Продуктът не е намерен — може да е изтрит." };
  const { familyName, ...fields } = value;
  const edit: ProductEditData & FamilyNameEdit = changedFields(before, fields);
  // The family is chosen explicitly in the editor: "automatic" (null) differs from a key that happens to be the same.
  const movesFamily = !same(before.groupKey ?? null, value.groupKey);
  if (movesFamily) edit.groupKey = value.groupKey;
  else delete edit.groupKey;
  // The family card's name belongs to the whole family: written on every member, so clearing it clears it everywhere
  // (when the product changes family in the same save, only on this product).
  const edits: { sku: string; data: ProductEditData & FamilyNameEdit }[] = [];
  if (familyName !== current.familyName) {
    edit.familyName = familyName;
    if (!movesFamily)
      for (const m of current.family) if (m.sku !== current.sku) edits.push({ sku: m.sku, data: { familyName } });
  }
  if (!Object.keys(edit).length) return { ok: true, product: productPayload(current) };
  try {
    saveProductEdits([{ sku: current.sku, data: edit }, ...edits]);
  } catch (e) {
    console.error("[admin] save product", current.sku, e);
    return { error: "Промените не бяха запазени. Опитайте отново." };
  }
  publish();
  // What was actually saved (texts cleaned up, a placeholder sale dropped with the placeholder price …).
  const saved = getAdminProduct(current.id);
  return { ok: true, product: saved ? productPayload(saved) : undefined };
}

export async function createProductAction(payload: ProductPayload): Promise<ActionResult> {
  await requireAdmin();
  const { value, errors } = validateProduct(payload, validationContext());
  if (!value) return { error: "Моля, поправете маркираните полета.", fieldErrors: errors };
  // Only what was filled in (yes / no switches always): the rest keeps the catalogue defaults.
  const data = Object.fromEntries(
    Object.entries(value).filter(([, v]) => !(v === "" || v === null || (Array.isArray(v) && !v.length))),
  ) as ProductEditData & { name: string; price: number; category: string };
  try {
    const { id } = createCustomProduct(data);
    publish();
    return { ok: true, id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Продуктът не беше създаден." };
  }
}

export async function restoreProductAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  const current = getAdminProduct(Number(id));
  if (!current) return { error: "Продуктът не е намерен." };
  if (!current.canRestore) return { error: "Няма промени за връщане — продуктът е с данните от файла на доставчика." };
  restoreProductOriginal(current.sku);
  publish();
  return { ok: true };
}

export async function deleteProductAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  const current = getAdminProduct(Number(id));
  if (!current) return { error: "Продуктът не е намерен." };
  if (!current.custom) return { error: "Само ръчно добавени продукти могат да се изтриват. Скрийте продукта вместо това." };
  try {
    deleteCustomProduct(current.sku);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Продуктът не беше изтрит." };
  }
  publish();
  return { ok: true };
}

/** "Join the family of …" in the editor: the family of the picked product (its key and members). */
export async function productFamilyAction(id: number): Promise<{ key: string; name: string; members: FamilyMember[] } | null> {
  await requireAdmin();
  return familyOfProduct(Number(id));
}

// ---------------------------------------------------------------------------
// The table: inline edits (price, sale price, stock, visibility) saved together

export async function saveProductRowsAction(rows: RowInput[]): Promise<{ ok?: boolean; saved?: number; error?: string; rowErrors?: Record<number, string> }> {
  await requireAdmin();
  const input = (Array.isArray(rows) ? rows : []).slice(0, 200);
  if (!input.length) return { ok: true, saved: 0 };
  const current = adminRowsById(input.map((r) => Number(r?.id)));
  const rowErrors: Record<number, string> = {};
  const edits: { sku: string; data: ProductEditData }[] = [];
  for (const r of input) {
    const id = Number(r?.id);
    const cur = current.get(id);
    if (!cur) {
      rowErrors[id] = "Продуктът не е намерен.";
      continue;
    }
    const { value, error } = validateRow(r);
    if (!value) {
      rowErrors[id] = error ?? "Невалидни стойности.";
      continue;
    }
    const data: ProductEditData = {};
    if (Math.abs(value.price - cur.basePrice) > 0.001) data.price = value.price;
    if (!same(value.salePrice, cur.salePrice)) {
      data.salePrice = value.salePrice;
      if (value.salePrice === null) data.saleEndsAt = null;
    }
    if (value.stock !== cur.stock) data.stock = value.stock;
    if (value.hidden !== cur.hidden) data.hidden = value.hidden;
    if (Object.keys(data).length) edits.push({ sku: cur.sku, data });
  }
  if (Object.keys(rowErrors).length) return { error: "Някои редове имат грешки — поправете ги и запазете отново.", rowErrors };
  const { changed } = edits.length ? saveProductEdits(edits) : { changed: 0 };
  if (changed) publish();
  return { ok: true, saved: changed };
}

// ---------------------------------------------------------------------------
// Bulk actions on the ticked products (or everything the search found)

export type BulkTarget = { ids: number[] } | { all: AdminQuery };

export type BulkChange =
  | { kind: "move"; category: string }
  | { kind: "hidden"; hidden: boolean }
  | { kind: "goals"; mode: "add" | "remove" | "set"; values: string[] }
  | { kind: "diets"; mode: "add" | "remove" | "set"; values: string[] }
  | { kind: "adult"; adultOnly: boolean }
  | { kind: "productKind"; value: ProductKind };

function cleanQuery(q: Partial<AdminQuery> | undefined): AdminQuery {
  const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const filter = s(q?.filter, 20);
  const stock = s(q?.stock, 5);
  const kind = s(q?.kind, 20);
  return {
    q: s(q?.q, 100),
    category: s(q?.category, 60),
    brand: s(q?.brand, 80),
    stock: stock in STOCK_FILTERS ? (stock as StockFilter) : "",
    kind: isProductKind(kind) ? kind : "",
    filter: filter in ADMIN_FILTERS ? (filter as AdminFilter) : "all",
  };
}

function targetSkus(target: BulkTarget): { skus?: string[]; error?: string } {
  if (target && "ids" in target) {
    const ids = (Array.isArray(target.ids) ? target.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return { error: "Не са избрани продукти." };
    if (ids.length > 1000) return { error: "Наведнъж могат да се отметнат до 1000 продукта." };
    return { skus: skusByIds(ids) };
  }
  if (target && "all" in target) {
    const skus = adminProductSkus(cleanQuery(target.all));
    if (skus.length > BULK_MAX) return { error: `Намерени са ${skus.length.toLocaleString("bg-BG")} продукта — наведнъж могат да се променят до ${BULK_MAX.toLocaleString("bg-BG")}. Стеснете търсенето.` };
    return { skus };
  }
  return { error: "Не са избрани продукти." };
}

type ListRow = { sku: string; category: string; subcategory: string | null; hidden: number; goals: string; diets: string; adult_only: number; product_kind: string };

function currentRows(skus: string[]): ListRow[] {
  const out: ListRow[] = [];
  for (let i = 0; i < skus.length; i += 500) {
    const part = skus.slice(i, i + 500);
    out.push(
      ...(catalogDb()
        .prepare(`SELECT sku, category, subcategory, hidden, goals, diets, adult_only, product_kind FROM products WHERE sku IN (${part.map(() => "?").join(",")})`)
        .all(...part) as ListRow[]),
    );
  }
  return out;
}

const parseList = (v: string) => {
  try {
    const x: unknown = JSON.parse(v || "[]");
    return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
};

function applyTags(current: string[], mode: "add" | "remove" | "set", values: string[]): string[] {
  if (mode === "set") return values;
  if (mode === "remove") return current.filter((g) => !values.includes(g));
  return [...new Set([...current, ...values])].slice(0, 12);
}

export async function bulkProductsAction(target: BulkTarget, change: BulkChange): Promise<{ ok?: boolean; changed?: number; error?: string }> {
  await requireAdmin();
  const found = targetSkus(target);
  if (!found.skus) return { error: found.error };
  if (!found.skus.length) return { ok: true, changed: 0 };
  const rows = currentRows(found.skus);
  const edits: { sku: string; data: ProductEditData }[] = [];

  switch (change?.kind) {
    case "move": {
      const slug = String(change.category ?? "");
      if (!categorySlugs().has(slug)) return { error: "Изберете категория." };
      for (const r of rows) if ((r.subcategory ?? r.category) !== slug) edits.push({ sku: r.sku, data: { category: slug } });
      break;
    }
    case "hidden":
      for (const r of rows) if (!!r.hidden !== !!change.hidden) edits.push({ sku: r.sku, data: { hidden: !!change.hidden } });
      break;
    case "goals":
    case "diets": {
      const known = new Set((change.kind === "goals" ? goalChoices() : dietChoices()).map((c) => c.key));
      const values = [...new Set((Array.isArray(change.values) ? change.values : []).filter((v) => known.has(v)))];
      if (!["add", "remove", "set"].includes(change.mode)) return { error: "Изберете какво да се направи." };
      if (!values.length && change.mode !== "set") return { error: change.kind === "goals" ? "Изберете поне една цел." : "Изберете поне един хранителен режим." };
      for (const r of rows) {
        const cur = parseList(change.kind === "goals" ? r.goals : r.diets);
        const next = applyTags(cur, change.mode, values);
        if (!same(cur, next)) edits.push({ sku: r.sku, data: change.kind === "goals" ? { goals: next } : { diets: next } });
      }
      break;
    }
    case "adult":
      for (const r of rows) if (!!r.adult_only !== !!change.adultOnly) edits.push({ sku: r.sku, data: { adultOnly: !!change.adultOnly } });
      break;
    case "productKind": {
      if (!isProductKind(change.value)) return { error: "Изберете вид на продукта." };
      for (const r of rows) if (r.product_kind !== change.value) edits.push({ sku: r.sku, data: { kind: change.value, isSupplement: change.value === "supplement" } });
      break;
    }
    default:
      return { error: "Изберете действие." };
  }
  const { changed } = edits.length ? saveProductEdits(edits) : { changed: 0 };
  if (changed) publish();
  return { ok: true, changed };
}
