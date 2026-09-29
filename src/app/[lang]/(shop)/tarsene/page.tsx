import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { isLang, type Lang } from "@/i18n/config";
import { getShelf } from "@/lib/catalog";
import { localizeHref } from "@/lib/links";
import { productSlugForCode } from "@/lib/search";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Listing } from "@/components/listing/Listing";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { ProductGrid } from "@/components/product/ProductGrid";

// Search results (/tarsene?q=…). A SKU or barcode that belongs to exactly one product (typed or scanned) opens
// that product; no results → popular products. Not indexed.

function query(sp: Record<string, string | string[] | undefined>): string {
  const v = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/tarsene">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).listing;
  const q = query(await searchParams);
  return { title: q ? fmt(t.search.title, { q }) : t.titles.search, alternates: alternates("/tarsene", lang), robots: { index: false, follow: true } };
}

function Popular({ lang }: { lang: Lang }) {
  const t = getDict(lang).listing.search;
  const products = getShelf(lang, "popular", 8);
  if (!products.length) return null;
  return (
    <section>
      <h2 className="h-display mb-4 text-[1.25rem] md:text-[1.625rem]">{t.popular}</h2>
      <ProductGrid products={products} lang={lang} eagerCount={0} />
    </section>
  );
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[lang]/tarsene">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const q = query(sp);
  const slug = q ? productSlugForCode(q) : null;
  if (slug) redirect(localizeHref(`/produkt/${slug}`, lang));
  const t = getDict(lang).listing;

  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ label: t.titles.search }]} />
      <ListingHeader title={q ? fmt(t.search.resultsFor, { q }) : t.titles.search} subtitle={q ? undefined : t.search.noQuery} />
      {q ? (
        <Listing
          lang={lang}
          scope={{ kind: "search", q }}
          basePath={`/tarsene?q=${encodeURIComponent(q)}`}
          searchParams={sp}
          defaultSort="relevance"
          emptyText={fmt(t.search.noResults, { q })}
          emptyExtra={() => (
            <>
              <p className="mb-8 text-center text-muted">{t.search.noResultsHint}</p>
              <Popular lang={lang} />
            </>
          )}
        />
      ) : (
        <Popular lang={lang} />
      )}
    </div>
  );
}
