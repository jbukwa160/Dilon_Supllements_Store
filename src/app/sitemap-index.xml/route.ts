import { site } from "@/config/site";
import { sitemapIds } from "../_seo/sitemap-data";

// /sitemap-index.xml: one address that lists every sitemap (for Google Search Console / Bing Webmaster Tools).
// Next generates /sitemap/<id>.xml from app/sitemap.ts but no index of them.
export const revalidate = 86400;

export function GET() {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapIds()
      .map((id) => `<sitemap><loc>${site.url}/sitemap/${id}.xml</loc></sitemap>`)
      .join("\n") +
    `\n</sitemapindex>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
