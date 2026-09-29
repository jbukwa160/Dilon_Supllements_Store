// Canonical URLs and hreflang alternates for generateMetadata.
import { site } from "@/config/site";
import { OG_LOCALE, type Lang } from "@/i18n/config";
import { localizeHref } from "./links";

/** "/produkt/x" -> "https://shop.example/produkt/x". Absolute URLs are returned unchanged. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * `alternates` for a page whose language-neutral (Bulgarian) path is `path`, e.g. "/produkt/x":
 * canonical = this language's URL; languages = bg, en and x-default (-> Bulgarian).
 * Usage: `return { title, alternates: alternates("/produkt/x", lang) }`.
 */
export function alternates(path: string, lang: Lang): { canonical: string; languages: Record<"bg" | "en" | "x-default", string> } {
  const bg = absoluteUrl(path);
  const en = absoluteUrl(localizeHref(path, "en"));
  return { canonical: lang === "en" ? en : bg, languages: { bg, en, "x-default": bg } };
}

/** Open Graph locale for the language ("bg_BG" / "en_GB"). */
export function ogLocale(lang: Lang): string {
  return OG_LOCALE[lang];
}
