// Product search for the storefront (SPEC §5.4): search-as-you-type suggestions and jumping straight to a product
// when a SKU / barcode is typed. Query building lives in search-query.ts (shared with the listing).
import "server-only";
import type { Lang } from "@/i18n/config";
import type { ProductCard } from "./catalog-types";
import { catalogDb } from "./db";
import { getBrand, getCategoryEntries, searchSuggestions, shopCategoryCounts, shopVisibleSql } from "./catalog";
import { loc } from "./l10n";
import { searchMatchSql, tokenize } from "./search-query";

export { searchMatchSql, tokenize, ftsQuery, barcodeKey } from "./search-query";

const SUGGEST_LIMIT = 6;

/** Search-as-you-type: a few product cards (one per family), the total, and matching categories and brands. */
export function suggest(
  lang: Lang,
  q: string,
): { products: ProductCard[]; total: number; categories: { slug: string; name: string }[]; brands: { slug: string; name: string }[] } {
  const out = { products: [] as ProductCard[], total: 0, categories: [] as { slug: string; name: string }[], brands: [] as { slug: string; name: string }[] };
  const text = q.trim().slice(0, 100);
  if (!text || !searchMatchSql(text)) return out;
  const db = catalogDb();
  // The first cards of the search listing, in the same order (hidden products dropped; a matching variant brings up
  // its family's card, one the shop shows).
  const found = searchSuggestions(lang, text, SUGGEST_LIMIT);
  out.products = found.items;
  out.total = found.total;

  const tokens = tokenize(text);
  const first = tokens[0] ?? "";
  if (first.length >= 2) {
    const needle = first.slice(0, Math.max(3, first.length - 1));
    for (const c of getCategoryEntries()) {
      if (c.hidden) continue;
      if (`${c.name.bg} ${c.name.en}`.toLowerCase().includes(needle)) out.categories.push({ slug: c.slug, name: loc(c.name, lang) });
      for (const s of c.subs) {
        if (!s.hidden && `${s.name.bg} ${s.name.en}`.toLowerCase().includes(needle)) out.categories.push({ slug: s.slug, name: loc(s.name, lang) });
      }
    }
    const counts = shopCategoryCounts();
    out.categories = out.categories.filter((c) => (counts.get(c.slug) ?? 0) > 0).slice(0, 4);
    out.brands = (
      db
        .prepare("SELECT slug, name FROM brands WHERE name LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\' ORDER BY in_stock DESC, count DESC LIMIT 12")
        .all(`${first.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, `${first.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) as { slug: string; name: string }[]
    )
      .filter((b) => (getBrand(b.slug)?.count ?? 0) > 0)
      .slice(0, 4);
  }
  return out;
}

/** Where a search for a SKU or barcode goes straight to: the one visible product whose code is exactly what was typed. */
export function productSlugForCode(q: string): string | null {
  const m = searchMatchSql(q.trim().slice(0, 100));
  if (!m) return null;
  const rows = catalogDb()
    .prepare(`WITH m AS (${m.sql}) SELECT p.slug FROM m JOIN products p ON p.id = m.id WHERE m.exact = 2 AND ${shopVisibleSql()} LIMIT 2`)
    .all(...m.params) as { slug: string }[];
  return rows.length === 1 ? rows[0].slug : null;
}
