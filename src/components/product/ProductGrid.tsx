// Product grids (listings, wishlist) and titled shelves (home, product page). No server-only code, no hooks.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { ProductCard as Card } from "@/lib/catalog-types";
import { localizeHref } from "@/lib/links";
import { ProductCard } from "./ProductCard";

/** 2 columns on phones, 3 on tablets and next to the filter sidebar, 4 from xl. The first `eagerCount` photos load at once. */
export function ProductGrid({ products, lang, eagerCount = 4 }: { products: Card[]; lang: Lang; eagerCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 xl:grid-cols-4 xl:gap-x-5">
      {products.map((p, i) => (
        <li key={p.id} className="min-w-0">
          <ProductCard product={p} lang={lang} eager={i < eagerCount} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A titled row of products: a swipeable snap-scroll row on phones and tablets, a grid of up to two full rows of four
 * on desktop (the first 8 cards). `href` (language-neutral) adds "Виж всички". Renders nothing when there are no products.
 */
export function ProductShelf({ title, subtitle, href, products, lang }: { title: string; subtitle?: string; href?: string; products: Card[]; lang: Lang }) {
  if (!products.length) return null;
  const seeAll = getDict(lang).common.seeAll;
  return (
    <section className="container-shop py-8 md:py-10">
      <div className="mb-4 flex items-end justify-between gap-4 md:mb-5">
        <div className="min-w-0">
          <h2 className="h-display text-[1.25rem] md:text-[1.625rem]">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-muted md:text-base">{subtitle}</p> : null}
        </div>
        {href ? (
          <Link
            href={localizeHref(href, lang)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-extrabold uppercase tracking-[0.02em] text-ink hover:text-primary hover:underline"
          >
            {seeAll} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className="scroll-row -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible lg:pb-0 lg:[&>li:nth-child(n+9)]:hidden">
        {products.map((p) => (
          <li key={p.id} className="min-w-0">
            <ProductCard product={p} lang={lang} />
          </li>
        ))}
      </ul>
    </section>
  );
}
