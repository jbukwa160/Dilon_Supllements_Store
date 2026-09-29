// Price tools of Admin → Цени и промоции → "Цени от Excel": download all prices as a spreadsheet, upload the edited
// file (preview → apply) and change regular prices by a percentage. Every change goes through saveProductEdits (the
// product edit journal survives CSV re-imports) and the price engine recomputes the effective prices.
import "server-only";
import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { catalogDb, storeDb } from "@/lib/db";
import { categoryLabelIn, findCategoryIn, mergeCategories } from "@/lib/categories";
import { getCategoriesConfig } from "@/lib/settings";
import { barcodeKey } from "@/lib/search-query";
import { saveProductEdits, type ProductEditData } from "@/lib/catalog-write";
import { round99 } from "@/lib/price-engine";
import { csvCell } from "@/lib/admin/subscribers";
import { parseMoney } from "@/lib/admin/validate";

// ---------------------------------------------------------------------------
// Numbers and dates typed in Excel

/** Amounts: the same parser as the product editor (thousands separators, decimal comma or point). */
export { parseMoney };

/** "12" / "12,0" → 12 (whole pieces); null when it isn't a number. */
export function parseCount(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.floor(v) : null;
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/** "2026-11-30", "30.11.2026", "30.11.2026 г.", "30/11/2026" → "2026-11-30"; null when it isn't a real date. */
export function parseDay(v: string): string | null {
  const t = v.trim().replace(/\s*г\.?$/i, "");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

const money = (n: number | null) => (n == null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);
const dayText = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");

// ---------------------------------------------------------------------------
// Download

type ExportRow = {
  sku: string;
  ean: string | null;
  name: string;
  flavour: string | null;
  size_label: string | null;
  brand: string | null;
  category: string;
  subcategory: string | null;
  base_price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  stock: number;
};

function exportRows(category: string): ExportRow[] {
  const cats = mergeCategories(getCategoriesConfig());
  const f = category ? findCategoryIn(cats, category) : null;
  const where = f ? (f.sub ? "WHERE subcategory = ?" : "WHERE category = ?") : "";
  return catalogDb()
    .prepare(
      `SELECT sku, ean, name, flavour, size_label, brand, category, subcategory, base_price, sale_price, sale_ends_at, stock
       FROM products ${where} ORDER BY category, subcategory, name COLLATE NOCASE, variant_sort`,
    )
    .all(...(f ? [f.sub?.slug ?? f.category.slug] : [])) as ExportRow[];
}

/** File name part for a category filter ("" = everything). */
export function exportCategory(kat: string): string {
  return kat && findCategoryIn(mergeCategories(getCategoriesConfig()), kat) ? kat : "";
}

const HEADERS = ["Код", "Баркод", "Име", "Марка", "Категория", "Цена (редовна)", "Промо цена", "Промо до", "Наличност"];
/** Without the stock column (the default): stock comes from the catalogue CSV import. */
const headers = (stock: boolean) => (stock ? HEADERS : HEADERS.slice(0, -1));

export type ExportOptions = {
  /** Add the "Наличност" column. Off by default: the next catalogue import overwrites stock anyway. */
  stock?: boolean;
};

function displayName(r: ExportRow): string {
  const v = [r.flavour, r.size_label].filter(Boolean).join(" · ");
  return v ? `${r.name} (${v})` : r.name;
}

const HELP = (stock: boolean) => [
  "Как да промените цените с този файл:",
  `1. Променете колоните „Цена (редовна)“, „Промо цена“${stock ? ", „Промо до“ и/или „Наличност“" : " и/или „Промо до“"}. Не променяйте колоната „Код“.`,
  "2. „Цена (редовна)“ е нормалната цена на продукта (с ДДС, в евро).",
  "3. „Промо цена“ е намалена цена само за този продукт — трябва да е по-ниска от редовната. Изтрийте я, за да спрете намалението.",
  "4. „Промо до“ е последният ден на намалението (напр. 30.11.2026). Празно = без край.",
  "5. Можете да изтриете редовете, които не променяте — те остават както са.",
  "6. Запазете файла и го качете в админ панела → Цени и промоции → „Цени от Excel“ → „Качи файл“. Ще видите какво ще се промени, преди да потвърдите.",
  "Колоните „Баркод“, „Име“, „Марка“ и „Категория“ са само за ориентация — промени в тях не се взимат предвид (продукт без код се търси по баркод).",
  "Промоциите с процент (напр. -20% за цяла марка) се правят от раздел „Промоции“ — не е нужно да пишете промо цени една по една.",
  "Клиентите виждат като зачертана цена най-ниската цена от последните 30 дни (правило на ЕС „Омнибус“).",
  ...(stock ? ["„Наличност“ важи до следващото зареждане на каталога от CSV файла — той е водещ за наличностите."] : []),
];

/** Let other requests in while a big file is built (the whole catalogue is ~30 000 rows). */
const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));

export async function exportPricesXlsx(category: string, opts: ExportOptions = {}): Promise<Buffer> {
  const stock = !!opts.stock;
  const cats = mergeCategories(getCategoriesConfig());
  // The streaming writer serialises and zips row by row, so building the whole catalogue (~30 000 rows) can pause for
  // other requests instead of blocking the shop for a second or two at the end.
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c: Buffer) => chunks.push(c));
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
  const ws = wb.addWorksheet("Цени", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns: Partial<ExcelJS.Column>[] = [
    { header: HEADERS[0], key: "sku", width: 18 },
    // Text, so Excel keeps leading zeros and doesn't show 5,9E+12.
    { header: HEADERS[1], key: "ean", width: 16, style: { numFmt: "@" } },
    { header: HEADERS[2], key: "name", width: 64 },
    { header: HEADERS[3], key: "brand", width: 20 },
    { header: HEADERS[4], key: "category", width: 26 },
    { header: HEADERS[5], key: "price", width: 15, style: { numFmt: "0.00" } },
    { header: HEADERS[6], key: "sale", width: 13, style: { numFmt: "0.00" } },
    { header: HEADERS[7], key: "until", width: 13, style: { numFmt: "dd.mm.yyyy" } },
  ];
  if (stock) columns.push({ header: HEADERS[8], key: "stock", width: 12 });
  ws.columns = columns;
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4D1" } };
  head.commit();
  const rows = exportRows(category);
  for (let i = 0; i < rows.length; i++) {
    if (i && i % 250 === 0) await breathe();
    const r = rows[i];
    const until = r.sale_ends_at ? new Date(`${r.sale_ends_at.slice(0, 10)}T00:00:00Z`) : null;
    ws.addRow({
      sku: r.sku,
      ean: r.ean ?? "",
      name: displayName(r),
      brand: r.brand ?? "",
      category: categoryLabelIn(cats, "bg", r.category, r.subcategory),
      price: r.base_price,
      sale: r.sale_price ?? null,
      until: until && !Number.isNaN(until.getTime()) ? until : null,
      ...(stock ? { stock: r.stock } : {}),
    }).commit();
  }
  ws.commit();
  const help = wb.addWorksheet("Как се попълва");
  help.getColumn(1).width = 130;
  HELP(stock).forEach((t, i) => {
    const row = help.addRow([t]);
    if (i === 0) row.font = { bold: true, size: 13 };
    row.commit();
  });
  help.commit();
  await wb.commit();
  return Buffer.concat(chunks);
}

export function exportPricesCsv(category: string, opts: ExportOptions = {}): Buffer {
  const cats = mergeCategories(getCategoriesConfig());
  const num = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));
  const lines = [headers(!!opts.stock).join(";")];
  for (const r of exportRows(category)) {
    const cells = [
      r.sku,
      r.ean ?? "",
      displayName(r),
      r.brand ?? "",
      categoryLabelIn(cats, "bg", r.category, r.subcategory),
      num(r.base_price),
      num(r.sale_price),
      dayText(r.sale_ends_at),
    ];
    if (opts.stock) cells.push(String(r.stock));
    // csvCell: quotes ";" and neutralises cells Excel would run as a formula (=, +, -, @).
    lines.push(cells.map(csvCell).join(";"));
  }
  // BOM so Excel opens Cyrillic correctly; ";" + decimal comma match Bulgarian Excel.
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

// ---------------------------------------------------------------------------
// Upload

type Columns = { sku: number; ean: number; price: number; sale: number; until: number; stock: number };

const HEADER_ALIASES: Record<keyof Columns, string[]> = {
  sku: ["код", "sku", "код sku", "артикул", "артикулен номер", "product code", "code"],
  ean: ["ean", "баркод", "баркод ean", "barcode"],
  price: ["цена", "редовна цена", "price", "regular price", "продажна цена", "цена с ддс"],
  sale: ["промо цена", "промоционална цена", "намалена цена", "цена в промоция", "sale price", "promo price"],
  until: ["промо до", "промоция до", "промо цена до", "край на промоцията", "sale ends", "sale end", "promo until"],
  stock: ["наличност", "stock", "количество", "бройки", "наличност бр", "inventory"],
};

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[€.:_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumns(header: string[]): Columns | null {
  const cols: Columns = { sku: -1, ean: -1, price: -1, sale: -1, until: -1, stock: -1 };
  header.forEach((h, i) => {
    const n = normHeader(h);
    for (const key of Object.keys(HEADER_ALIASES) as (keyof Columns)[]) {
      if (cols[key] === -1 && HEADER_ALIASES[key].includes(n)) cols[key] = i;
    }
  });
  if (cols.sku === -1 && cols.ean === -1) return null;
  if (cols.price === -1 && cols.sale === -1 && cols.stock === -1) return null;
  return cols;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "1" : "0";
  // Excel dates arrive as UTC midnight.
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
  }
  return String(v).trim();
}

async function readTable(buf: Buffer, filename: string): Promise<string[][]> {
  if (/\.xlsx$/i.test(filename) || buf.subarray(0, 2).toString("ascii") === "PK") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as ExcelJS.CellValue[];
      rows.push(values.slice(1).map(cellText));
    });
    return rows;
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  return parseCsv(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: false }) as string[][];
}

export type PricePreview = {
  /** Id of the stored preview to apply, null when nothing would change. */
  id: string | null;
  totalRows: number;
  changed: number;
  unchanged: number;
  unmatched: string[];
  unmatchedCount: number;
  errors: { line: number; message: string }[];
  samples: { sku: string; name: string; before: string; after: string }[];
  /** Regular prices that change by more than ±50 %, and promo prices more than 50 % under the regular price — worth a second look (a typo, a wrong column, "1,299" meant as 1,30). */
  bigChanges: { sku: string; name: string; before: string; after: string; note: string }[];
  bigChangeCount: number;
  /** The file has a "Наличност" column (stock changes last until the next catalogue import). */
  stockColumn: boolean;
};

type StoredChange = { sku: string; data: ProductEditData };

type Current = {
  sku: string;
  ean: string | null;
  name: string;
  flavour: string | null;
  size_label: string | null;
  base_price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  stock: number;
};

/** "24,90 € · промо 19,90 € до 30.11.2026 · 7 бр." (the stock only when the file has a stock column). */
function describe(price: number, sale: number | null, until: string | null, stock: number | null): string {
  return [money(price), sale != null ? `промо ${money(sale)}${until ? ` до ${dayText(until)}` : ""}` : null, stock != null ? `${stock} бр.` : null]
    .filter(Boolean)
    .join(" · ");
}

/** A change by more than this fraction is listed in the preview for a second look. */
const BIG_CHANGE = 0.5;

export async function previewPriceFile(buf: Buffer, filename: string): Promise<PricePreview | { error: string }> {
  let table: string[][];
  try {
    table = await readTable(buf, filename);
  } catch {
    return { error: "Файлът не може да бъде прочетен. Качете .xlsx (Excel) или .csv файл." };
  }
  const headerIndex = table.slice(0, 10).findIndex((r) => findColumns(r));
  if (headerIndex === -1) {
    return { error: "Не намерихме колони „Код“ и „Цена“. Използвайте файла от бутона „Изтегли за Excel“ и не променяйте заглавията." };
  }
  const cols = findColumns(table[headerIndex])!;
  const get = (r: string[], c: number) => (c >= 0 ? String(r[c] ?? "").trim() : "");

  // SKUs match whatever the letter case; barcodes match even when Excel has dropped their leading zeros.
  const all = catalogDb().prepare("SELECT sku, ean, name, flavour, size_label, base_price, sale_price, sale_ends_at, stock FROM products").all() as Current[];
  const bySku = new Map(all.map((p) => [p.sku.toLowerCase(), p]));
  const byEan = new Map(all.filter((p) => p.ean && barcodeKey(p.ean)).map((p) => [barcodeKey(p.ean!), p]));

  const preview: PricePreview = {
    id: null,
    totalRows: 0,
    changed: 0,
    unchanged: 0,
    unmatched: [],
    unmatchedCount: 0,
    errors: [],
    samples: [],
    bigChanges: [],
    bigChangeCount: 0,
    stockColumn: cols.stock >= 0,
  };
  const changes: StoredChange[] = [];
  const seen = new Set<string>();
  const fail = (line: number, message: string): void => {
    preview.errors.push({ line, message: `Ред ${line}: ${message}` });
  };

  table.slice(headerIndex + 1).forEach((r, i) => {
    const line = headerIndex + i + 2;
    const sku = get(r, cols.sku);
    const ean = get(r, cols.ean);
    if (!sku && !ean) return;
    preview.totalRows++;
    const p = (sku && bySku.get(sku.toLowerCase())) || (ean && barcodeKey(ean) && byEan.get(barcodeKey(ean))) || undefined;
    if (!p) {
      preview.unmatchedCount++;
      if (preview.unmatched.length < 20) preview.unmatched.push(sku || ean);
      return;
    }
    if (seen.has(p.sku)) return;
    seen.add(p.sku);

    const data: ProductEditData = {};
    let price = p.base_price;
    const priceText = get(r, cols.price);
    if (priceText) {
      const v = parseMoney(priceText);
      if (v == null || v <= 0 || v > 100000) return fail(line, `невалидна цена „${priceText}“`);
      price = v;
      if (Math.abs(v - p.base_price) > 0.001) data.price = v;
    }

    let sale = p.sale_price;
    let until = p.sale_ends_at;
    if (cols.sale >= 0) {
      const saleText = get(r, cols.sale);
      const v = saleText ? parseMoney(saleText) : null;
      if (saleText && (v == null || v <= 0)) return fail(line, `невалидна промо цена „${saleText}“`);
      if (v != null && v >= price) return fail(line, `промо цената (${money(v)}) трябва да е по-ниска от редовната (${money(price)})`);
      sale = v;
    }
    if (cols.until >= 0) {
      const untilText = get(r, cols.until);
      const d = untilText ? parseDay(untilText) : null;
      if (untilText && !d) return fail(line, `невалидна дата „${untilText}“ в „Промо до“ (пример: 30.11.2026)`);
      // Keep a stored time of day when the date itself did not change.
      until = d && d === p.sale_ends_at?.slice(0, 10) ? p.sale_ends_at : d;
    }
    if (sale == null) until = null;
    if (sale !== p.sale_price) data.salePrice = sale;
    if (until !== p.sale_ends_at) data.saleEndsAt = until;

    let stock = p.stock;
    const stockText = get(r, cols.stock);
    if (stockText) {
      const v = parseCount(stockText);
      if (v == null || v < 0 || v > 1_000_000) return fail(line, `невалидна наличност „${stockText}“`);
      stock = v;
      if (v !== p.stock) data.stock = v;
    }

    if (!Object.keys(data).length) {
      preview.unchanged++;
      return;
    }
    // The file states the promo price explicitly: keep it (a new regular price would otherwise drop an imported one).
    if (cols.sale >= 0 && !("salePrice" in data)) data.salePrice = sale;
    changes.push({ sku: p.sku, data });
    const name = [p.name, [p.flavour, p.size_label].filter(Boolean).join(" · ")].filter(Boolean).join(" — ");
    const before = describe(p.base_price, p.sale_price, p.sale_ends_at, cols.stock >= 0 ? p.stock : null);
    const after = describe(price, sale, until, cols.stock >= 0 ? stock : null);
    if (preview.samples.length < 30) preview.samples.push({ sku: p.sku, name, before, after });
    const notes: string[] = [];
    if (data.price !== undefined && p.base_price > 0 && Math.abs(price / p.base_price - 1) > BIG_CHANGE) {
      notes.push(`редовната цена ${price > p.base_price ? "+" : "−"}${Math.round(Math.abs(price / p.base_price - 1) * 100)} %`);
    }
    if ("salePrice" in data && sale != null && sale < price * (1 - BIG_CHANGE)) notes.push(`промо цената е ${Math.round((1 - sale / price) * 100)} % под редовната`);
    if (notes.length) {
      preview.bigChangeCount++;
      if (preview.bigChanges.length < 30) preview.bigChanges.push({ sku: p.sku, name, before, after, note: notes.join("; ") });
    }
  });

  preview.errors = preview.errors.slice(0, 30);
  preview.changed = changes.length;
  if (changes.length) {
    const store = storeDb();
    store.prepare("DELETE FROM price_imports WHERE created_at < ?").run(new Date(Date.now() - 24 * 3600_000).toISOString());
    const id = randomBytes(12).toString("hex");
    store.prepare("INSERT INTO price_imports (id, created_at, data) VALUES (?, ?, ?)").run(id, new Date().toISOString(), JSON.stringify(changes));
    preview.id = id;
  }
  return preview;
}

/** Apply a stored preview; null when it expired or was already applied. */
export function applyPriceImport(id: string): number | null {
  const store = storeDb();
  const row = store.prepare("SELECT data FROM price_imports WHERE id = ?").get(id) as { data: string } | undefined;
  if (!row) return null;
  store.prepare("DELETE FROM price_imports WHERE id = ?").run(id);
  return saveProductEdits(JSON.parse(row.data) as StoredChange[]).changed;
}

// ---------------------------------------------------------------------------
// Regular prices up / down by a percentage

export type BulkInput = {
  scope: "all" | "category" | "brand";
  /** Category / subcategory slug, or brand slug. */
  value: string;
  direction: "increase" | "decrease";
  percent: number;
  round99: boolean;
};

export type BulkPreview = {
  count: number;
  inScope: number;
  /** Products whose price comes out the same after rounding (cents or ,99) — they are left as they are. */
  unchanged: number;
  samples: { sku: string; name: string; before: string; after: string }[];
};

/**
 * `old` × `factor`, in cents or at the nearest ,99 (the same helper as the promotions). The ,99 rounding never moves a
 * price against the requested direction (+10 % on 1,09 must not give 0,99): then the exact price is used.
 */
function bulkPrice(old: number, factor: number, input: BulkInput): number {
  const x = old * factor;
  const bounds = input.direction === "increase" ? { above: old } : { below: old };
  return Math.max(0.01, input.round99 ? round99(x, bounds) : Math.round(x * 100) / 100);
}

/** Validated input, or null. */
export function cleanBulk(input: unknown): BulkInput | null {
  const r = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const scope = r.scope === "all" || r.scope === "category" || r.scope === "brand" ? r.scope : null;
  const direction = r.direction === "increase" || r.direction === "decrease" ? r.direction : null;
  const percent = Math.round(Number(String(r.percent ?? "").replace(",", ".")) * 100) / 100;
  const value = String(r.value ?? "").trim().slice(0, 100);
  if (!scope || !direction || !Number.isFinite(percent) || percent < 1 || percent > 90) return null;
  if (scope === "category" && !findCategoryIn(mergeCategories(getCategoriesConfig()), value)) return null;
  if (scope === "brand" && !catalogDb().prepare("SELECT 1 FROM brands WHERE slug = ?").get(value)) return null;
  return { scope, value: scope === "all" ? "" : value, direction, percent, round99: r.round99 === true };
}

function bulkChanges(input: BulkInput): { changes: StoredChange[]; samples: BulkPreview["samples"]; inScope: number; unchanged: number } {
  let where = "";
  const params: string[] = [];
  if (input.scope === "category") {
    where = "WHERE category = ? OR subcategory = ?";
    params.push(input.value, input.value);
  } else if (input.scope === "brand") {
    where = "WHERE brand_slug = ?";
    params.push(input.value);
  }
  const rows = catalogDb()
    .prepare(`SELECT sku, name, flavour, size_label, base_price, sale_price FROM products ${where} ORDER BY popularity DESC`)
    .all(...params) as { sku: string; name: string; flavour: string | null; size_label: string | null; base_price: number; sale_price: number | null }[];
  const f = input.direction === "increase" ? 1 + input.percent / 100 : 1 - input.percent / 100;
  const changes: StoredChange[] = [];
  const samples: BulkPreview["samples"] = [];
  let unchanged = 0;
  for (const r of rows) {
    const price = bulkPrice(r.base_price, f, input);
    // A product's own promo price moves by the same percentage (and goes away if it would no longer be lower).
    let sale = r.sale_price != null ? bulkPrice(r.sale_price, f, input) : null;
    if (sale != null && sale >= price) sale = null;
    const data: ProductEditData = {};
    if (Math.abs(price - r.base_price) > 0.001) data.price = price;
    if (sale !== r.sale_price) data.salePrice = sale;
    if (!Object.keys(data).length) {
      unchanged++;
      continue;
    }
    changes.push({ sku: r.sku, data });
    if (samples.length < 8) {
      const variant = [r.flavour, r.size_label].filter(Boolean).join(" · ");
      samples.push({
        sku: r.sku,
        name: variant ? `${r.name} — ${variant}` : r.name,
        before: `${money(r.base_price)}${r.sale_price != null ? ` (промо ${money(r.sale_price)})` : ""}`,
        after: `${money(price)}${sale != null ? ` (промо ${money(sale)})` : ""}`,
      });
    }
  }
  return { changes, samples, inScope: rows.length, unchanged };
}

export function previewBulk(input: BulkInput): BulkPreview {
  const { changes, samples, inScope, unchanged } = bulkChanges(input);
  return { count: changes.length, inScope, unchanged, samples };
}

export function applyBulk(input: BulkInput): number {
  return saveProductEdits(bulkChanges(input).changes).changed;
}
