// The product listing used by every browse page (all products, category, brand, goal, sale, new, search): filter
// sidebar (sticky on desktop, a bottom sheet on phones and tablets), selected-filter chips, sorting, the grid and
// pagination. Server Component — every filter, chip, sort option and page is a plain link built with listingHref()
// (rel="nofollow", no scroll jump), so the listing works without JavaScript and each state has its own URL.
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronLeft, ChevronRight, SearchX, X } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { PER_PAGE, listProducts } from "@/lib/catalog";
import { EMPTY_FILTERS, type Facet, type ListingFilters, type ListingScope, type ListingSort } from "@/lib/catalog-types";
import { formatNumber, plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { SORT_KEYS, hasFilters, listingHref, parseListingParams, type RawParams } from "@/lib/params";
import { ProductGrid } from "@/components/product/ProductGrid";
import { FacetLink, type FacetOption } from "./FacetLink";
import { FacetList } from "./FacetList";
import { MobileFilters } from "./MobileFilters";
import { SortSelect } from "./SortSelect";

export type SubNavItem = { href: string; label: string; count: number; active: boolean };

type Props = {
  lang: Lang;
  scope: ListingScope;
  /** Language-neutral path of the page, with the query parameters that are part of the page ("/tarsene?q=whey"). */
  basePath: string;
  searchParams: RawParams;
  defaultSort?: ListingSort;
  /** Links to the subcategories (category pages): shown as the first sidebar group. */
  subNav?: { title: string; items: SubNavItem[] };
  /** Text of the empty state when no filter is set. */
  emptyText?: string;
  /** Rendered under the empty state only (e.g. popular products after a search without results). */
  emptyExtra?: () => React.ReactNode;
};

const SORT_LABEL: Record<ListingSort, "popular" | "relevance" | "new" | "priceAsc" | "priceDesc" | "discount"> = {
  popular: "popular",
  relevance: "relevance",
  new: "new",
  "price-asc": "priceAsc",
  "price-desc": "priceDesc",
  discount: "discount",
};

/** 1 … c-1 c c+1 … last */
function pageList(current: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const pages = [...new Set([1, total, current - 1, current, current + 1])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  let prev = 0;
  for (const n of pages) {
    if (n - prev === 2) out.push(n - 1);
    else if (n - prev > 2) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

function FilterGroup({ title, open = true, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group/fg border-b border-line py-3.5 last:border-b-0">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-sm text-[0.85rem] font-extrabold uppercase tracking-[0.02em] [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open/fg:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function Listing({ lang, scope, basePath, searchParams, defaultSort = "popular", subNav, emptyText, emptyExtra }: Props) {
  const dict = getDict(lang);
  const t = dict.listing;
  const state = parseListingParams(searchParams, defaultSort);
  const result = listProducts(lang, scope, state.filters, state.sort, state.page);
  const { facets, total } = result;
  const f = state.filters;
  const href = (patch: { filters?: Partial<ListingFilters>; sort?: ListingSort; page?: number }) =>
    localizeHref(listingHref(basePath, state, patch, defaultSort), lang);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // --- Filter options ------------------------------------------------------------------------------------------
  const opts = (list: Facet[], patch: (v: string, selected: boolean) => Partial<ListingFilters>, prefix: string): FacetOption[] =>
    list.map((x) => ({ key: `${prefix}:${x.value}`, label: x.label, count: x.count, selected: x.selected, href: href({ filters: patch(x.value, x.selected) }) }));
  const categories = scope.kind === "category" ? [] : opts(facets.categories, (v, s) => ({ category: s ? null : v }), "category");
  const goals = scope.kind === "goal" ? [] : opts(facets.goals, (v, s) => ({ goal: s ? null : v }), "goal");
  const brands = scope.kind === "brand" ? [] : opts(facets.brands, (v) => ({ brands: toggle(f.brands, v) }), "brand");
  const prices = opts(facets.prices, (v, s) => ({ price: s ? null : v }), "price");
  const forms = opts(facets.forms, (v) => ({ forms: toggle(f.forms, v) }), "form");
  const flavours = opts(facets.flavours, (v) => ({ flavours: toggle(f.flavours, v) }), "flavour");
  const diets = opts(facets.diets, (v) => ({ diets: toggle(f.diets, v) }), "diet");
  const toggles: FacetOption[] = [
    { key: "stock", label: t.filters.inStock, count: facets.inStock, selected: f.inStock, href: href({ filters: { inStock: !f.inStock } }) },
    ...(scope.kind === "sale" ? [] : [{ key: "sale", label: t.filters.sale, count: facets.sale, selected: f.sale, href: href({ filters: { sale: !f.sale } }) }]),
  ];
  const hasAny = (list: FacetOption[]) => list.some((o) => o.selected || (o.count ?? 0) > 0);

  // --- Selected filters as removable chips (keyed type:value — a brand and a flavour may share a label) ----------
  const label = (list: Facet[], v: string) => list.find((x) => x.value === v)?.label ?? v;
  const chips: { key: string; label: string; href: string }[] = [];
  if (f.category) chips.push({ key: `category:${f.category}`, label: label(facets.categories, f.category), href: href({ filters: { category: null } }) });
  if (f.goal) chips.push({ key: `goal:${f.goal}`, label: label(facets.goals, f.goal), href: href({ filters: { goal: null } }) });
  for (const b of f.brands) chips.push({ key: `brand:${b}`, label: label(facets.brands, b), href: href({ filters: { brands: toggle(f.brands, b) } }) });
  if (f.price) chips.push({ key: `price:${f.price}`, label: label(facets.prices, f.price), href: href({ filters: { price: null } }) });
  for (const v of f.forms) chips.push({ key: `form:${v}`, label: label(facets.forms, v), href: href({ filters: { forms: toggle(f.forms, v) } }) });
  for (const v of f.flavours) chips.push({ key: `flavour:${v}`, label: label(facets.flavours, v), href: href({ filters: { flavours: toggle(f.flavours, v) } }) });
  for (const v of f.diets) chips.push({ key: `diet:${v}`, label: label(facets.diets, v), href: href({ filters: { diets: toggle(f.diets, v) } }) });
  if (f.inStock) chips.push({ key: "stock", label: t.filters.inStock, href: href({ filters: { inStock: false } }) });
  if (f.sale) chips.push({ key: "sale", label: t.filters.sale, href: href({ filters: { sale: false } }) });
  const clearAll = href({ filters: EMPTY_FILTERS });
  const filtered = hasFilters(f);

  const sorts = SORT_KEYS.filter((k) => k !== "relevance" || scope.kind === "search").map((k) => ({ key: k, label: t.sort[SORT_LABEL[k]], href: href({ sort: k }) }));

  const sidebar = (
    <div>
      {subNav?.items.length ? (
        <FilterGroup title={subNav.title}>
          <ul className="space-y-0.5">
            {subNav.items.map((s) => (
              <li key={s.href}>
                <Link
                  href={localizeHref(s.href, lang)}
                  aria-current={s.active ? "page" : undefined}
                  className={clsx(
                    "flex min-h-10 items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[0.93rem] transition lg:min-h-9",
                    s.active ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-soft hover:bg-canvas hover:text-ink",
                  )}
                >
                  <span className="truncate">{s.label}</span>
                  <span className="text-xs font-semibold tabular-nums text-muted">{formatNumber(s.count, lang)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </FilterGroup>
      ) : null}
      {hasAny(categories) ? (
        <FilterGroup title={t.filters.category}>
          <FacetList options={categories} limit={12} moreLabel={t.filters.more} lessLabel={t.filters.less} noMatch="" />
        </FilterGroup>
      ) : null}
      {hasAny(toggles) ? (
        <FilterGroup title={t.filters.availability}>
          {toggles.map((o) => (
            <FacetLink key={o.key} option={o} lang={lang} />
          ))}
        </FilterGroup>
      ) : null}
      {hasAny(prices) ? (
        <FilterGroup title={t.filters.price}>
          {prices.map((o) => (
            <FacetLink key={o.key} option={o} lang={lang} radio />
          ))}
        </FilterGroup>
      ) : null}
      {hasAny(brands) ? (
        <FilterGroup title={t.filters.brand}>
          <FacetList options={brands} limit={10} searchLabel={t.filters.brandSearch} moreLabel={t.filters.moreBrands} lessLabel={t.filters.less} noMatch={t.filters.noBrand} />
        </FilterGroup>
      ) : null}
      {hasAny(goals) ? (
        <FilterGroup title={t.filters.goal}>
          {goals.map((o) => (
            <FacetLink key={o.key} option={o} lang={lang} radio />
          ))}
        </FilterGroup>
      ) : null}
      {hasAny(forms) ? (
        <FilterGroup title={t.filters.form}>
          {forms.map((o) => (
            <FacetLink key={o.key} option={o} lang={lang} />
          ))}
        </FilterGroup>
      ) : null}
      {hasAny(flavours) ? (
        <FilterGroup title={t.filters.flavour} open={f.flavours.length > 0}>
          <FacetList options={flavours} limit={10} moreLabel={t.filters.moreFlavours} lessLabel={t.filters.less} noMatch="" />
        </FilterGroup>
      ) : null}
      {hasAny(diets) ? (
        <FilterGroup title={t.filters.diet}>
          {diets.map((o) => (
            <FacetLink key={o.key} option={o} lang={lang} />
          ))}
        </FilterGroup>
      ) : null}
    </div>
  );

  const from = total ? (result.page - 1) * PER_PAGE + 1 : 0;
  const to = Math.min(total, result.page * PER_PAGE);

  return (
    <div className="grid gap-6 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-8">
      <aside aria-label={t.filters.title} className="hidden lg:block">
        <div className="sticky top-[9.5rem] max-h-[calc(100dvh-10.5rem)] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface px-4 py-1">{sidebar}</div>
      </aside>

      <div className="min-w-0">
        {total || filtered ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-[0.95rem] font-semibold text-muted" aria-live="polite">
            {plural(lang, total, dict.listing.count)}
          </p>
          {/* Phones: "Филтри" and the sort select as two equal buttons (GymBeam / XXL); from sm side by side on the right. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <MobileFilters active={chips.length} total={total}>
              {sidebar}
            </MobileFilters>
            <SortSelect value={state.sort} options={sorts} />
          </div>
        </div>
        ) : null}

        {chips.length ? (
          <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label={t.filters.selected}>
            {chips.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                scroll={false}
                prefetch={false}
                rel="nofollow"
                aria-label={fmt(t.filters.remove, { label: c.label })}
                className="chip chip-active min-h-9 pr-2.5"
              >
                {c.label} <X className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ))}
            <Link href={clearAll} scroll={false} prefetch={false} rel="nofollow" className="rounded-sm px-2 py-1 text-sm font-bold text-primary hover:underline">
              {t.filters.clearAll}
            </Link>
          </div>
        ) : null}

        {/* Product cards are H3s: this hidden H2 keeps the outline H1 (page) → H2 → H3 without a skipped level. */}
        <h2 className="sr-only">{t.productsHeading}</h2>
        {result.items.length ? (
          <ProductGrid products={result.items} lang={lang} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-14 text-center">
            <SearchX className="h-11 w-11 text-muted" strokeWidth={1.75} aria-hidden />
            <p className="max-w-md text-lg font-bold">{filtered ? t.empty : (emptyText ?? t.emptyScope)}</p>
            {filtered ? (
              <Link href={clearAll} scroll={false} rel="nofollow" className="btn btn-primary mt-1">
                {t.emptyReset}
              </Link>
            ) : null}
            <p className="mt-2 text-sm text-muted">{filtered ? t.emptyHint : t.browse}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(
                [
                  ["/produkti", t.suggestions.all],
                  ["/promotsii", t.suggestions.sale],
                  ["/novi", t.suggestions.new],
                  ["/marki", t.suggestions.brands],
                ] as const
              ).map(([path, text]) => (
                <Link key={path} href={localizeHref(path, lang)} className="chip">
                  {text}
                </Link>
              ))}
            </div>
          </div>
        )}
        {!result.items.length && emptyExtra ? <div className="mt-8">{emptyExtra()}</div> : null}

        {result.pageCount > 1 ? (
          <nav className="mt-10 flex flex-col items-center gap-3" aria-label={t.pagination.label}>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {result.page > 1 ? (
                <Link href={href({ page: result.page - 1 })} rel="prev nofollow" className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border-[1.5px] border-line bg-surface hover:border-ink" aria-label={t.pagination.prev}>
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </Link>
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border-[1.5px] border-line bg-surface opacity-40" aria-hidden>
                  <ChevronLeft className="h-5 w-5" />
                </span>
              )}
              {pageList(result.page, result.pageCount).map((n, i) =>
                n === "…" ? (
                  <span key={`gap${i}`} className="px-1 font-bold text-muted" aria-hidden>
                    …
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={href({ page: n })}
                    rel="nofollow"
                    aria-label={fmt(t.pagination.page, { n })}
                    aria-current={n === result.page ? "page" : undefined}
                    className={clsx(
                      "grid h-11 min-w-11 place-items-center rounded-[var(--radius-md)] px-3 font-bold tabular-nums",
                      n === result.page ? "bg-ink text-white" : "border-[1.5px] border-line bg-surface hover:border-ink",
                    )}
                  >
                    {formatNumber(n, lang)}
                  </Link>
                ),
              )}
              {result.page < result.pageCount ? (
                <Link href={href({ page: result.page + 1 })} rel="next nofollow" className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border-[1.5px] border-line bg-surface hover:border-ink" aria-label={t.pagination.next}>
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </Link>
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] border-[1.5px] border-line bg-surface opacity-40" aria-hidden>
                  <ChevronRight className="h-5 w-5" />
                </span>
              )}
            </div>
            <p className="text-sm text-muted">
              {fmt(t.pagination.showing, { from: formatNumber(from, lang), to: formatNumber(to, lang), total: formatNumber(total, lang) })}
            </p>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
