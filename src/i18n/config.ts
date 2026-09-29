// Languages of the storefront. Bulgarian is the main one and lives at the root ("/produkt/x");
// English lives under /en ("/en/produkt/x"). The admin panel is Bulgarian only.
// Pure data: safe to import from client components, server code and scripts.

export const LANGS = ["bg", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "bg";

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

/** Locale for Intl formatting (numbers, prices, dates). */
export const INTL_LOCALE: Record<Lang, string> = { bg: "bg-BG", en: "en-GB" };

/** Open Graph locale per language. */
export const OG_LOCALE: Record<Lang, string> = { bg: "bg_BG", en: "en_GB" };

/** Cookie that remembers the language the visitor picked (a preference only: "/" is always Bulgarian). */
export const LANG_COOKIE = "sp_lang";
