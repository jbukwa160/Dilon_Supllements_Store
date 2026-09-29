import "server-only";
import { cache } from "react";
import type { Lang } from "@/i18n/config";
import { getCatalogMeta, getCategoryEntries, getCategoryTopBrands, getCategoryTree, getGoals, hidesNoImage } from "@/lib/catalog";
import { catalogDb } from "@/lib/db";
import { getActiveGiftTiers } from "@/lib/cart-gifts";
import { getGiftTiers } from "@/lib/settings";
import type { NavCategory, NavGoal } from "./nav-types";

// Data of the shop chrome (header menus, footer). The chrome renders on every request of the dynamic pages
// (product, listing, cart…), so the two heavy catalogue aggregates (most stocked brands per category ≈ 60 ms,
// "any demo price left?" ≈ 20 ms on 30k products) are memoized per catalogue version: another process' writes
// (the importer) change PRAGMA data_version; this process' writes bump the counter in catalogChanged() (lib/catalog).
// Admin settings (names, order, hidden) are read fresh every time — they are cheap.

type Memo = { key: string; at: number; value: unknown };
const g = globalThis as unknown as { __catalogWrites?: number; __chromeMemo?: Map<string, Memo> };
/** Safety net for writes that bypass catalogChanged(). */
const MAX_AGE_MS = 10 * 60_000;

function catalogVersion(): string {
  const v = catalogDb().pragma("data_version", { simple: true }) as number;
  return `${v}:${g.__catalogWrites ?? 0}`;
}

function memo<T>(name: string, compute: () => T): T {
  const store = (g.__chromeMemo ??= new Map());
  const key = catalogVersion();
  const hit = store.get(name);
  if (hit && hit.key === key && Date.now() - hit.at < MAX_AGE_MS) return hit.value as T;
  const value = compute();
  store.set(name, { key, at: Date.now(), value });
  return value;
}

/** True while visible products still have placeholder prices (the purple "Демо версия" bar). */
export function hasDemoPrices(): boolean {
  return memo("demo", () => getCatalogMeta().demoPrices);
}

function topBrands(): Map<string, { slug: string; name: string }[]> {
  // The brands depend on "hide products without a picture" too.
  return memo(`topBrands:${hidesNoImage() ? 1 : 0}`, () => getCategoryTopBrands(8));
}

/** Categories for the mega menu, the mobile menu and the footer (menu order, hidden / empty ones left out). */
export const navCategories = cache((lang: Lang): NavCategory[] => {
  const brands = topBrands();
  const accents = new Map(getCategoryEntries().map((c) => [c.slug, c.accent]));
  return getCategoryTree(lang).map((c) => ({
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    icon: c.icon,
    color: c.color,
    accent: accents.get(c.slug) ?? "#0f1a17",
    image: c.image,
    count: c.count,
    subs: c.children.map((s) => ({ slug: s.slug, name: s.name, count: s.count })),
    brands: brands.get(c.slug) ?? [],
  }));
});

export function navGoals(lang: Lang): NavGoal[] {
  return getGoals(lang).map((x) => ({ slug: x.slug, name: x.name, icon: x.icon, count: x.count }));
}

/**
 * The lowest purchase threshold that currently unlocks a gift (the top bar's "Подарък по избор при поръчка над 40 €"),
 * or null: gift tiers off / outside the campaign window, the strip switched off, or no tier has gift products yet.
 */
export function giftFromAmount(lang: Lang): number | null {
  if (!getGiftTiers().showBar) return null;
  const thresholds = getActiveGiftTiers(lang)
    .filter((t) => t.gifts.length > 0)
    .map((t) => t.threshold);
  return thresholds.length ? Math.min(...thresholds) : null;
}
