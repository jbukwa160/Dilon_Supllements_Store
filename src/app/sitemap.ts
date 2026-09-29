import type { MetadataRoute } from "next";
import { sitemapEntries, sitemapIds } from "./_seo/sitemap-data";

// XML sitemaps: /sitemap/0.xml (pages, categories, goals, brands, blog) and /sitemap/1.xml … (products), each page in
// both languages with hreflang alternates. Next generates no index file: robots.txt lists every sitemap.
// Refreshed daily (and on the first request after a deploy).
export const revalidate = 86400;

export function generateSitemaps() {
  return sitemapIds().map((id) => ({ id }));
}

// Next 16: `id` arrives as a Promise<string>.
export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(await props.id);
}
