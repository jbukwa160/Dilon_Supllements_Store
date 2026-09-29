"use server";

import { requireAdmin } from "@/lib/auth";
import { catalogDb } from "@/lib/db";

/** One product (variant) in the admin's pickers: links, gift tiers, blog product cards, chat. */
export type PickerProduct = {
  id: number;
  sku: string;
  slug: string;
  name: string;
  /** "Шоколад · 1 кг" (flavour and size of this variant), null for standalone products. */
  variant: string | null;
  brand: string | null;
  ean: string | null;
  image: string | null;
  price: number;
  stock: number;
  hidden: boolean;
  /** Top category slug. */
  category: string;
};

type Row = Omit<PickerProduct, "variant" | "hidden"> & { flavour: string | null; size_label: string | null; hidden: number };

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** FTS5 query: every word typed must start a word of the name (BG/EN), brand, SKU, barcode or keywords. */
function ftsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(" AND ") : null;
}

/**
 * Product search for the admin's pickers: by name, brand, SKU or barcode (also part of a code, and barcodes that lost
 * their leading zeros). Exact code matches come first, then products in stock. Hidden products are found with
 * `includeHidden` (threshold gifts may be samples that aren't sold separately) and always by their exact code.
 * Every variant of a family is its own result.
 */
export async function findProductsAction(q: string, opts: { includeHidden?: boolean } = {}): Promise<PickerProduct[]> {
  await requireAdmin();
  const term = String(q ?? "").trim().slice(0, 100);
  if (term.length < 2) return [];
  const includeHidden = opts?.includeHidden === true;

  const parts: string[] = [];
  const params: string[] = [];
  // A code is one "word" with a digit in it: "SP-00012", "5901234123457" (scanners may print it with spaces).
  const code = term.replace(/\s+/g, "");
  if (/\d/.test(code) && /^[\p{L}\p{N}._/-]{2,40}$/u.test(code)) {
    const digits = /^\d{4,14}$/.test(code) ? code.replace(/^0+/, "") : null;
    // exact = 2: the SKU or barcode is exactly what was typed; 1: it contains it.
    parts.push(`SELECT id, 2 AS exact, 0 AS rank FROM products WHERE sku = ? COLLATE NOCASE${digits ? " OR ltrim(ean, '0') = ?" : ""}`);
    params.push(code);
    if (digits) params.push(digits);
    const like = `%${likeEscape(code)}%`;
    parts.push(`SELECT id, 1 AS exact, 0 AS rank FROM products WHERE sku LIKE ? ESCAPE '\\'${digits ? " OR ean LIKE ?" : ""}`);
    params.push(like);
    if (digits) params.push(like);
  }
  const fts = ftsQuery(term);
  if (fts) {
    parts.push("SELECT rowid AS id, 0 AS exact, rank FROM products_fts WHERE products_fts MATCH ? AND rank MATCH 'bm25(1, 1, 1, 0.1, 0.1, 0.5)'");
    params.push(fts);
  }
  if (!parts.length) return [];

  let rows: Row[];
  try {
    rows = catalogDb()
      .prepare(
        `WITH m AS (SELECT id, MAX(exact) AS exact, MIN(rank) AS rank FROM (${parts.join(" UNION ALL ")}) GROUP BY id)
         SELECT p.id, p.sku, p.slug, p.name, p.flavour, p.size_label, p.brand, p.ean, p.image, p.price, p.stock, p.hidden, p.category
         FROM m JOIN products p ON p.id = m.id
         WHERE ? = 1 OR m.exact = 2 OR p.hidden = 0
         ORDER BY m.exact DESC, (p.stock > 0) DESC, m.rank, p.popularity DESC
         LIMIT 12`,
      )
      .all(...params, includeHidden ? 1 : 0) as Row[];
  } catch (e) {
    // An odd search string FTS5 can't parse, or the catalogue is being re-imported right now.
    console.error("[admin] product search:", (e as Error).message);
    return [];
  }
  return rows.map(({ flavour, size_label, hidden, ...r }) => ({
    ...r,
    variant: [flavour, size_label].filter(Boolean).join(" · ") || null,
    hidden: !!hidden,
  }));
}
