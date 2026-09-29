import { NextResponse, type NextRequest } from "next/server";

// Bulgarian (default) lives at the root without a prefix; English under /en.
// Internally every storefront route is app/[lang]/..., so:
//   /produkt/x      -> rewrite  -> /bg/produkt/x   (URL in the browser stays /produkt/x)
//   /bg/produkt/x   -> 308      -> /produkt/x      (one canonical URL per page)
//   /en/produkt/x   -> untouched
// The language is never guessed from a cookie or Accept-Language: "/" is always Bulgarian.
//
// File-like paths (a "." in the last segment) and /uploads/… are checked against an allowlist of the files that
// really exist; everything else gets a plain 404 right here. Without this, /whatever.php, /x.jpg or /uploads/a/b
// would reach app/[lang] with lang = "whatever.php", and a production server writes a cached "not found" page to
// .next/server/app for every such URL (disk fill). Storefront slugs never contain a "." (slugify drops dots).

/** Real files served without a language prefix: metadata routes at the app root and the contents of public/. */
// Add new public/ files here (Next only serves the files that were in public/ at build time anyway).
const FILES = new Set(["/favicon.ico", "/icon.svg", "/robots.txt", "/sitemap-index.xml", "/placeholder.svg"]);
/** Sitemaps from app/sitemap.ts (generateSitemaps). */
const SITEMAP_RE = /^\/sitemap\/\d{1,4}\.xml$/;
/** Uploaded pictures (app/uploads/[file]/route.ts; same pattern as UPLOAD_NAME_RE in lib/uploads.ts). */
const UPLOAD_RE = /^\/uploads\/[a-z0-9]{20,40}\.(?:jpg|png|webp|gif|avif)$/;

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Content-Language on every storefront page (U1 / F-19): user agents get the page's language from the HTTP header when
 * the markup has no lang attribute yet — the case for a 404, which Next streams as an error shell without <html lang>.
 */
function withLang(res: NextResponse, lang: "bg" | "en"): NextResponse {
  res.headers.set("Content-Language", lang);
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/uploads" || pathname.startsWith("/uploads/")) return UPLOAD_RE.test(pathname) ? NextResponse.next() : notFound();
  if (pathname.slice(pathname.lastIndexOf("/") + 1).includes(".")) {
    return FILES.has(pathname) || SITEMAP_RE.test(pathname) ? NextResponse.next() : notFound();
  }

  if (pathname === "/bg" || pathname.startsWith("/bg/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) return withLang(NextResponse.next(), "en");

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/bg" : `/bg${pathname}`;
  return withLang(NextResponse.rewrite(url), "bg");
}

export const config = {
  // Everything except /api and /admin (their own catch-alls answer 404) and Next internals. File-like paths and
  // /uploads DO run through the proxy (allowlist above).
  matcher: ["/((?!api(?:/|$)|admin(?:/|$)|_next/).*)"],
};
