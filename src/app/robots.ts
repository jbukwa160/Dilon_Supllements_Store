import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { sitemapIds } from "./_seo/sitemap-data";

// Private and endless pages stay out of search engines, in both languages: the admin, the API, cart / checkout /
// account pages, search results, and listing URLs with sorting or filter parameters (the plain listing pages and
// their ?page= pagination stay crawlable). Every sitemap is listed (Next writes no sitemap index).
export const revalidate = 86400;

const PRIVATE = ["/kolichka", "/porachka", "/lyubimi", "/tarsene", "/profil", "/vhod", "/registratsia", "/zabravena-parola", "/nova-parola"];
const FILTER_PARAMS = ["sort", "cena", "nalichni", "promo", "kat", "tsel", "forma", "vkus", "dieta", "q"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        ...PRIVATE,
        ...PRIVATE.map((p) => `/en${p}`),
        ...FILTER_PARAMS.flatMap((p) => [`/*?${p}=`, `/*&${p}=`]),
      ],
    },
    sitemap: sitemapIds().map((id) => `${site.url}/sitemap/${id}.xml`),
  };
}
