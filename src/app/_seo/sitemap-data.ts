import "server-only";
import type { MetadataRoute } from "next";
import { LANGS, type Lang } from "@/i18n/config";
import { listPublishedPosts, translationBySlug } from "@/lib/blog";
import { getBrands, getCategoryTree, getGoals, shopVisibleSql } from "@/lib/catalog";
import { catalogDb } from "@/lib/db";
import { localizeHref } from "@/lib/links";
import { absoluteUrl } from "@/lib/seo";

// Data of the XML sitemaps (app/sitemap.ts) and their list in robots.txt (app/robots.ts).
// Sitemap 0: static pages, categories, goals, brands and blog posts. Sitemaps 1…N: product pages (the family's
// primary variant; only what the shop shows — see shopVisibleSql), PRODUCTS_PER_SITEMAP each. Every page appears once per language with hreflang alternates, so a
// product sitemap holds 2 × PRODUCTS_PER_SITEMAP = 20 000 URLs (≈ 12 MB) — well under Google's 50 000 URLs / 50 MB.

export const PRODUCTS_PER_SITEMAP = 10_000;

/** Indexable pages without parameters (language-neutral paths). */
const STATIC_PAGES = [
  "/",
  "/produkti",
  "/promotsii",
  "/novi",
  "/marki",
  "/tseli",
  "/blog",
  "/dostavka",
  "/vrashtane",
  "/kontakti",
  "/obshti-usloviya",
  "/poveritelnost",
  "/biskvitki",
  "/otkaz-ot-dogovor",
];

type Entry = MetadataRoute.Sitemap[number];

/** Both language versions of a page, each pointing at the other (and x-default → Bulgarian). */
function bothLanguages(path: string, lastModified?: string): Entry[] {
  const bg = absoluteUrl(path);
  const en = absoluteUrl(localizeHref(path, "en"));
  const alternates = { languages: { bg, en, "x-default": bg } };
  const lm = lastModified && !Number.isNaN(Date.parse(lastModified)) ? lastModified : undefined;
  return [
    { url: bg, lastModified: lm, alternates },
    { url: en, lastModified: lm, alternates },
  ];
}

function visibleProductCount(): number {
  return (catalogDb().prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${shopVisibleSql()} AND p.is_primary = 1`).get() as { n: number }).n;
}

/** Ids of all sitemaps: "0" + one per product chunk. */
export function sitemapIds(): string[] {
  const chunks = Math.max(1, Math.ceil(visibleProductCount() / PRODUCTS_PER_SITEMAP));
  return ["0", ...Array.from({ length: chunks }, (_, i) => String(i + 1))];
}

/** Blog posts are separate per language; a post and its published translation are linked as alternates. */
function blogEntries(): Entry[] {
  const out: Entry[] = [];
  for (const lang of LANGS) {
    const other: Lang = lang === "bg" ? "en" : "bg";
    for (const p of listPublishedPosts(lang)) {
      const url = absoluteUrl(localizeHref(`/blog/${p.slug}`, lang));
      const translated = translationBySlug(other, p.slug);
      const languages: Record<string, string> = { [lang]: url };
      if (translated) languages[other] = absoluteUrl(localizeHref(`/blog/${translated}`, other));
      if (languages.bg) languages["x-default"] = languages.bg;
      out.push({ url, lastModified: p.updatedAt || undefined, alternates: { languages } });
    }
  }
  return out;
}

export function sitemapEntries(id: string): MetadataRoute.Sitemap {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) return [];
  if (n === 0) {
    const categories = getCategoryTree("bg").flatMap((c) => [c.slug, ...c.children.map((s) => s.slug)]);
    return [
      ...STATIC_PAGES.flatMap((p) => bothLanguages(p)),
      ...categories.flatMap((slug) => bothLanguages(`/kategoria/${slug}`)),
      ...getGoals("bg").flatMap((g) => bothLanguages(`/tsel/${g.slug}`)),
      ...getBrands()
        .filter((b) => b.count > 0)
        .flatMap((b) => bothLanguages(`/marka/${b.slug}`)),
      ...blogEntries(),
    ];
  }
  const rows = catalogDb()
    .prepare(`SELECT p.slug, p.updated_at AS updatedAt FROM products p WHERE ${shopVisibleSql()} AND p.is_primary = 1 ORDER BY p.id LIMIT ? OFFSET ?`)
    .all(PRODUCTS_PER_SITEMAP, (n - 1) * PRODUCTS_PER_SITEMAP) as { slug: string; updatedAt: string | null }[];
  return rows.flatMap((r) => bothLanguages(`/produkt/${r.slug}`, r.updatedAt ?? undefined));
}
