// data/prices.csv — the real prices that replace the placeholder ones at import (`npm run import`).
//
//   sku;price;old_price            (header names: sku | код | артикул, price | цена, old_price | стара цена | compare_at_price,
//   Dilon-1;24,90;29,90             sale_price | промо цена — optional; ean | баркод instead of sku)
//
// Written by people in Excel: comma, semicolon or tab separated (detected from the header), quoted values, Bulgarian
// decimal commas ("24,90"), thousands separators ("1 234,50", "1.234,50", "1,234.50"), currency signs ("24,90 €",
// "29.90 лв"). Lines that cannot be read are reported, never guessed.
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { parseMoney as parseAmount } from "../../src/lib/admin/validate";

export type FilePrice = { price: number; oldPrice: number | null; salePrice: number | null; line: number };
export type PriceFile = {
  bySku: Map<string, FilePrice>;
  byEan: Map<string, FilePrice>;
  delimiter: string;
  rows: number;
  skipped: { line: number; reason: string; text: string }[];
  error: string | null;
};

/**
 * A money amount as typed by a person, or null: "24,90", "24.90", "1 234,50", "1.234,50", "1,234.50", "€12.99",
 * "12,99 лв". One separator followed by exactly three digits is a thousands separator ("1,299" = 1299, "1.299" = 1299).
 * The same parser as the admin (src/lib/admin/validate.ts parseMoney); here currency words anywhere are dropped,
 * digit groups must have three digits, and only amounts above 0 are accepted.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/[\s  '’]/g, "")
    .replace(/(?:€|eur|bgn|лв\.?|lv\.?)/giu, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  // "1.234.56" / "1,23,456": more than one separator of a kind must be thousands groups of three digits.
  for (const sep of [".", ","]) {
    const parts = s.split(sep);
    if (parts.length > 2 && !parts.slice(1).every((p, i) => p.length === 3 || (i === parts.length - 2 && /[.,]/.test(p)))) return null;
  }
  const v = parseAmount(s);
  return v != null && v > 0 ? v : null;
}

const HEADERS = {
  sku: ["sku", "код", "артикул", "article", "item", "product code", "код на продукт"],
  ean: ["ean", "баркод", "barcode", "gtin", "upc"],
  price: ["price", "цена", "regular price", "редовна цена", "base price"],
  oldPrice: ["old_price", "old price", "стара цена", "compare_at_price", "compare at price", "предишна цена"],
  salePrice: ["sale_price", "sale price", "промо цена", "промоционална цена", "намалена цена"],
};
const norm = (h: string) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/\s+/g, " ");

/** The delimiter the header line uses most (outside quotes): ";", "," or tab. */
function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const c of first) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c in counts) counts[c]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ",";
}

/** Read a prices file (missing file → empty result). */
export function loadPriceFile(file: string): PriceFile {
  const out: PriceFile = { bySku: new Map(), byEan: new Map(), delimiter: ",", rows: 0, skipped: [], error: null };
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, "utf8");
  return parsePriceText(text, out);
}

export function parsePriceText(text: string, out: PriceFile = { bySku: new Map(), byEan: new Map(), delimiter: ",", rows: 0, skipped: [], error: null }): PriceFile {
  out.delimiter = detectDelimiter(text);
  let records: string[][];
  try {
    records = parse(text, { delimiter: out.delimiter, bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true }) as string[][];
  } catch (e) {
    out.error = `the file cannot be read as CSV: ${(e as Error).message}`;
    return out;
  }
  const head = (records.shift() ?? []).map(norm);
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iSku = col(HEADERS.sku);
  const iEan = col(HEADERS.ean);
  const iPrice = col(HEADERS.price);
  const iOld = col(HEADERS.oldPrice);
  const iSale = col(HEADERS.salePrice);
  if ((iSku < 0 && iEan < 0) || iPrice < 0) {
    out.error = `header must name a code column (sku / код / ean) and a price column (price / цена); found: ${head.join(" | ") || "(empty)"}`;
    return out;
  }
  records.forEach((r, i) => {
    const line = i + 2;
    const text = r.join(out.delimiter);
    const sku = iSku >= 0 ? (r[iSku] ?? "").trim() : "";
    const ean = iEan >= 0 ? (r[iEan] ?? "").replace(/\D/g, "").replace(/^0+/, "") : "";
    if (!sku && !ean) {
      out.skipped.push({ line, reason: "no code", text });
      return;
    }
    const price = parseMoney(r[iPrice]);
    if (price === null) {
      out.skipped.push({ line, reason: `price "${r[iPrice] ?? ""}" is not a number`, text });
      return;
    }
    const rawOld = iOld >= 0 ? (r[iOld] ?? "").trim() : "";
    const rawSale = iSale >= 0 ? (r[iSale] ?? "").trim() : "";
    const oldPrice = rawOld ? parseMoney(rawOld) : null;
    const salePrice = rawSale ? parseMoney(rawSale) : null;
    if ((rawOld && oldPrice === null) || (rawSale && salePrice === null)) {
      out.skipped.push({ line, reason: `old / sale price "${rawOld || rawSale}" is not a number`, text });
      return;
    }
    const entry: FilePrice = { price, oldPrice, salePrice, line };
    out.rows++;
    if (sku) out.bySku.set(sku.toLowerCase(), entry);
    if (ean) out.byEan.set(ean, entry);
  });
  return out;
}

/** Regular price and sale price of a row: "old price" above the price means the price is a sale price. */
export function pricesOf(p: FilePrice): { base: number; sale: number | null } {
  if (p.salePrice !== null && p.salePrice < p.price) return { base: p.price, sale: p.salePrice };
  if (p.oldPrice !== null && p.oldPrice > p.price) return { base: p.oldPrice, sale: p.price };
  return { base: p.price, sale: null };
}
