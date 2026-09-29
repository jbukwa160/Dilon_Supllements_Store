// Storefront links. Stored links (menu, banners, blog…) are language-neutral Bulgarian paths such as
// "/kategoria/proteini"; they get the "/en" prefix only when rendered in English. Path segments are the same in
// both languages, so switching the language is a pure prefix swap.
// Pure functions: safe in client components, server code and scripts.
import { DEFAULT_LANG, type Lang } from "@/i18n/config";

/** Paths that are not storefront pages (never prefixed with /en): API, admin, uploaded files, Next internals, files. */
const NOT_A_PAGE = /^\/(?:api|admin|uploads|_next)(?:[/?#]|$)|^[^?#]*\.[A-Za-z0-9]+(?:[?#]|$)/;

/** Internal "/x" -> "/en/x" for English; external, mailto:, tel:, "#…" and already localized links are left alone. */
export function localizeHref(href: string, lang: Lang): string {
  if (lang === DEFAULT_LANG) return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (/^\/en(?:[/?#]|$)/.test(href) || NOT_A_PAGE.test(href)) return href;
  // "/" and "/?q=x" -> "/en", "/en?q=x"
  if (href === "/" || href.startsWith("/?") || href.startsWith("/#")) return `/${lang}${href.slice(1)}`;
  return `/${lang}${href}`;
}

/** "/en/produkt/x" -> { lang: "en", path: "/produkt/x" }. Also strips the internal "/bg" prefix. */
export function stripLang(pathname: string): { lang: Lang; path: string } {
  const m = pathname.match(/^\/(bg|en)(?=\/|$)(.*)$/);
  if (!m) return { lang: DEFAULT_LANG, path: pathname || "/" };
  return { lang: m[1] as Lang, path: m[2] || "/" };
}

/** The same page in the other language (the language switcher). `search` may be "" or "?a=b" / "a=b". */
export function switchLangHref(pathname: string, search: string, to: Lang): string {
  const { path } = stripLang(pathname);
  const q = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return localizeHref(path, to) + q;
}

/**
 * Links typed by the admin end up in href attributes, so only safe kinds are allowed:
 * "/path", "http(s)://…", "mailto:…", "tel:…". Returns "" for an empty value and null for anything else
 * ("javascript:", "//evil", quotes, angle brackets…).
 */
export function safeHref(v: string): string | null {
  const t = v.trim();
  if (!t) return "";
  if (/^\/(?!\/)[^\s<>"'\\]*$/.test(t)) return t;
  if (/^https?:\/\/[^\s<>"'\\]+$/i.test(t)) return t;
  if (/^(mailto|tel):[^\s<>"'\\]+$/i.test(t)) return t;
  return null;
}

export function isExternalHref(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

/** A "next" parameter that may be redirected to after sign-in: a local path only (no "//host", no backslashes). */
export function safeNextPath(v: unknown, fallback = "/"): string {
  return typeof v === "string" && /^\/(?![/\\])[^\s\\]*$/.test(v) && v.length <= 500 ? v : fallback;
}
