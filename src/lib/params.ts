// Listing URL state (SPEC §5.4). Param names are the same in both languages (language-neutral URLs):
//   marka (brand slugs, comma list) · cena (price bucket) · nalichni=1 · promo=1 · kat (category) · tsel (goal)
//   forma / vkus / dieta (comma lists) · sort · page — and q on the search page (kept from `base`).
// Pure — safe in client components.
import { EMPTY_FILTERS, type ListingFilters, type ListingSort, type ProductForm } from "./catalog-types";

export type RawParams = Record<string, string | string[] | undefined>;

/** Price buckets (EUR) of the "Цена" facet; `max` is exclusive, null = no upper limit. */
export const PRICE_BUCKETS: { key: string; min: number; max: number | null }[] = [
  { key: "0-20", min: 0, max: 20 },
  { key: "20-40", min: 20, max: 40 },
  { key: "40-60", min: 40, max: 60 },
  { key: "60-100", min: 60, max: 100 },
  { key: "100", min: 100, max: null },
];

export const SORT_KEYS: ListingSort[] = ["popular", "relevance", "new", "price-asc", "price-desc", "discount"];

const FORMS: ProductForm[] = ["powder", "capsules", "tablets", "softgels", "liquid", "bar", "gummies", "drink", "food", "accessory", "other"];
const DIETS = ["vegan", "sugar-free", "gluten-free", "lactose-free", "keto"];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || null;
}

function many(v: string | string[] | undefined, ok: (s: string) => boolean = (s) => SLUG.test(s)): string[] {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return [...new Set(list.flatMap((s) => s.split(",")).map((s) => s.trim().toLowerCase()).filter((s) => s && s.length <= 80 && ok(s)))].slice(0, 20);
}

const slugOrNull = (v: string | null) => (v && v.length <= 80 && SLUG.test(v) ? v : null);

/** URL search params → listing state. Unknown / malformed values are dropped. */
export function parseListingParams(
  sp: RawParams,
  defaultSort: ListingSort = "popular",
): { filters: ListingFilters; sort: ListingSort; page: number } {
  const price = one(sp.cena);
  const sort = one(sp.sort);
  const page = parseInt(one(sp.page) ?? "1", 10);
  return {
    filters: {
      ...EMPTY_FILTERS,
      brands: many(sp.marka),
      price: PRICE_BUCKETS.some((b) => b.key === price) ? price : null,
      inStock: one(sp.nalichni) === "1",
      sale: one(sp.promo) === "1",
      category: slugOrNull(one(sp.kat)),
      goal: slugOrNull(one(sp.tsel)),
      forms: many(sp.forma, (s) => (FORMS as string[]).includes(s)),
      flavours: many(sp.vkus),
      diets: many(sp.dieta, (s) => DIETS.includes(s)),
    },
    sort: SORT_KEYS.includes(sort as ListingSort) ? (sort as ListingSort) : defaultSort,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** True when any filter is set (for "Изчисти всички"). */
export function hasFilters(f: ListingFilters): boolean {
  return (
    f.brands.length > 0 || !!f.price || f.inStock || f.sale || !!f.category || !!f.goal || f.forms.length > 0 || f.flavours.length > 0 || f.diets.length > 0
  );
}

/**
 * Serialise listing state back into a URL, applying `patch` on top. Any filter or sort change sends the shopper back
 * to page 1. Query parameters already in `base` (e.g. "/tarsene?q=протеин") are kept. Pass `{ filters: EMPTY_FILTERS }`
 * to clear every filter.
 */
export function listingHref(
  base: string,
  state: { filters: ListingFilters; sort: ListingSort; page: number },
  patch: { filters?: Partial<ListingFilters>; sort?: ListingSort; page?: number },
  defaultSort: ListingSort = "popular",
): string {
  const f: ListingFilters = { ...state.filters, ...patch.filters };
  const sort = patch.sort ?? state.sort;
  const page = patch.page ?? (patch.filters || (patch.sort && patch.sort !== state.sort) ? 1 : state.page);
  const [path, query = ""] = base.split("?");
  const u = new URLSearchParams(query);
  for (const k of ["kat", "tsel", "marka", "cena", "forma", "vkus", "dieta", "nalichni", "promo", "sort", "page"]) u.delete(k);
  if (f.category) u.set("kat", f.category);
  if (f.goal) u.set("tsel", f.goal);
  if (f.brands.length) u.set("marka", f.brands.join(","));
  if (f.price) u.set("cena", f.price);
  if (f.forms.length) u.set("forma", f.forms.join(","));
  if (f.flavours.length) u.set("vkus", f.flavours.join(","));
  if (f.diets.length) u.set("dieta", f.diets.join(","));
  if (f.inStock) u.set("nalichni", "1");
  if (f.sale) u.set("promo", "1");
  if (sort !== defaultSort) u.set("sort", sort);
  if (page > 1) u.set("page", String(page));
  const qs = u.toString().replace(/%2C/gi, ",");
  return qs ? `${path}?${qs}` : path;
}
