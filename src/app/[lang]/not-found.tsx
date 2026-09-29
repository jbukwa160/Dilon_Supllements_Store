import type { Metadata } from "next";
import Link from "next/link";
import { lang as rootLang } from "next/root-params";
import { ArrowRight, Search } from "lucide-react";
import { getDict } from "@/i18n";
import { DEFAULT_LANG, isLang } from "@/i18n/config";
import { localizeHref } from "@/lib/links";
import { getSettings } from "@/lib/settings";
import { CategoryIcon } from "@/components/layout/CategoryIcon";
import { DocumentTitle } from "@/components/layout/DocumentTitle";
import { navCategories } from "@/components/layout/nav-data";

// Rendered inside app/[lang]/layout.tsx (with the shop header and footer) for notFound() in storefront pages and for
// unknown addresses (app/[lang]/[...rest]). Next adds "noindex" and the 404 status itself.
// Note: Next streams a notFound() page as its error shell (<html id="__next_error__">, the tree renders in the browser),
// so the first HTML has no lang attribute of its own — the <head> below (title, description) is already localized,
// and the Content-Language response header set by src/proxy.ts names the language before hydration.

async function pageLang() {
  const raw = await rootLang();
  return isLang(raw) ? raw : DEFAULT_LANG;
}

/** "Страницата не е намерена | Dilon Nutrition" instead of the shop's generic default title. */
export async function generateMetadata(): Promise<Metadata> {
  const dict = getDict(await pageLang());
  return { title: dict.errors.notFoundTitle, description: dict.errors.notFoundText };
}

export default async function NotFound() {
  const lang = await pageLang();
  const dict = getDict(lang);
  const popular = [...navCategories(lang)].sort((a, b) => b.count - a.count).slice(0, 8);
  return (
    <div className="container-shop flex flex-col items-center py-12 text-center md:py-20">
      <DocumentTitle title={`${dict.errors.notFoundTitle} | ${getSettings().name}`} />
      <p className="h-display text-7xl md:text-9xl" aria-hidden>
        <span className="mark-volt">404</span>
      </p>
      <h1 className="mt-6 text-balance text-3xl font-bold md:text-4xl">{dict.errors.notFoundTitle}</h1>
      <p className="mt-3 max-w-xl text-lg text-muted">{dict.errors.notFoundText}</p>
      <form action={localizeHref("/tarsene", lang)} role="search" className="mt-8 flex w-full max-w-md gap-2">
        <label htmlFor="not-found-q" className="sr-only">
          {dict.search.label}
        </label>
        <input id="not-found-q" name="q" type="search" required maxLength={100} placeholder={dict.search.placeholder} className="field rounded-pill" />
        <button type="submit" className="btn btn-primary shrink-0 px-4" aria-label={dict.search.submit}>
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </form>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={localizeHref("/", lang)} className="btn btn-primary h-12 px-7">
          {dict.common.backHome}
        </Link>
        <Link href={localizeHref("/produkti", lang)} className="btn btn-outline h-12 px-7">
          {dict.nav.allProducts}
        </Link>
      </div>
      {popular.length ? (
        <section aria-labelledby="nf-popular" className="mt-12 w-full max-w-3xl">
          <h2 id="nf-popular" className="text-sm font-bold uppercase tracking-[0.08em] text-muted">
            {dict.errors.notFoundPopular}
          </h2>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {popular.map((c) => (
              <li key={c.slug}>
                <Link href={localizeHref(`/kategoria/${c.slug}`, lang)} className="chip min-h-10 bg-surface">
                  <CategoryIcon icon={c.icon} className="h-4 w-4 text-primary" />
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href={localizeHref("/tseli", lang)} className="chip min-h-10 border-primary bg-primary-50 text-primary-700">
                {dict.nav.goals} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
