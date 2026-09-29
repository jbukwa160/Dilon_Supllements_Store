// Categories and goals as the admin edited them (settings "categories" / "goals", types + normalizers in
// category-config.ts), merged on top of the built-in taxonomy (taxonomy.ts). Pure functions — shared by the site,
// the admin and the CSV importer.
//
// Addresses (slugs) never change. Built-in categories, subcategories and goals can be renamed, re-ordered and hidden
// but not deleted (the importer sorts products into them) — missing ones come back at the end. Empty texts / icon /
// colour in the saved config mean "the built-in one".
import type { Lang } from "@/i18n/config";
import { normalizeCategoriesConfig, normalizeGoalsConfig } from "./category-config";
import { loc, type L10n } from "./l10n";
import { CATEGORIES, GOALS, SUB_PARENT } from "./taxonomy";

export type SubCategoryEntry = { slug: string; name: L10n; tagline: L10n; hidden: boolean; builtIn: boolean };

export type CategoryEntry = {
  slug: string;
  name: L10n;
  tagline: L10n;
  /** lucide icon name. */
  icon: string;
  /** Tile background (#rrggbb). */
  color: string;
  /** Tile text / icon colour (built-in categories; custom ones get a neutral ink). */
  accent: string;
  /** Picture chosen by the admin; "" = the most popular product's picture. */
  image: string;
  /** Hidden from menus / home / footer (its page and products still work). */
  hidden: boolean;
  builtIn: boolean;
  subs: SubCategoryEntry[];
};

export type GoalEntry = { slug: string; name: L10n; description: L10n; icon: string; image: string; hidden: boolean; builtIn: boolean };

const DEFAULT_COLOR = "#eceff1";
const DEFAULT_ACCENT = "#334155";
const EMPTY: L10n = { bg: "", en: "" };

/** Saved text with empty halves falling back to the built-in text. */
function withDefault(saved: L10n, builtIn: L10n | undefined): L10n {
  return { bg: saved.bg || builtIn?.bg || "", en: saved.en || builtIn?.en || "" };
}

/** Built-in categories with the admin's overrides (settings "categories", raw or normalized) applied, in menu order. */
export function mergeCategories(config: unknown): CategoryEntry[] {
  const saved = normalizeCategoriesConfig(config).categories;
  const builtIn = new Map(CATEGORIES.map((c) => [c.slug, c]));
  const used = new Set<string>();
  const out: CategoryEntry[] = [];

  for (const r of saved) {
    // A built-in subcategory can't become a category of its own.
    if (used.has(r.slug) || SUB_PARENT[r.slug]) continue;
    const d = builtIn.get(r.slug);
    used.add(r.slug);
    const subs: SubCategoryEntry[] = [];
    for (const s of r.subs) {
      if (used.has(s.slug) || builtIn.has(s.slug)) continue;
      const owner = SUB_PARENT[s.slug];
      if (owner && owner !== r.slug) continue; // built-in subcategories stay under their category
      const ds = d?.subs.find((x) => x.slug === s.slug);
      used.add(s.slug);
      subs.push({ slug: s.slug, name: withDefault(s.name, ds?.name ?? { bg: s.slug, en: "" }), tagline: s.tagline, hidden: s.hidden, builtIn: !!ds });
    }
    // Built-in subcategories missing from the saved list come back at the end.
    for (const ds of d?.subs ?? []) {
      if (used.has(ds.slug)) continue;
      used.add(ds.slug);
      subs.push({ slug: ds.slug, name: ds.name, tagline: EMPTY, hidden: false, builtIn: true });
    }
    out.push({
      slug: r.slug,
      name: withDefault(r.name, d?.name ?? { bg: r.slug, en: "" }),
      tagline: withDefault(r.tagline, d?.tagline),
      icon: r.icon || d?.icon || "package",
      color: r.color || d?.color || DEFAULT_COLOR,
      accent: d?.accent ?? DEFAULT_ACCENT,
      image: r.image,
      hidden: r.hidden,
      builtIn: !!d,
      subs,
    });
  }
  // Built-in categories missing from the saved list (e.g. added to the code later) come back at the end.
  for (const d of CATEGORIES) {
    if (used.has(d.slug)) continue;
    used.add(d.slug);
    const subs = d.subs.filter((s) => !used.has(s.slug));
    subs.forEach((s) => used.add(s.slug));
    out.push({
      slug: d.slug,
      name: d.name,
      tagline: d.tagline,
      icon: d.icon,
      color: d.color,
      accent: d.accent,
      image: "",
      hidden: false,
      builtIn: true,
      subs: subs.map((s) => ({ slug: s.slug, name: s.name, tagline: EMPTY, hidden: false, builtIn: true })),
    });
  }
  return out;
}

/** Built-in goals with the admin's overrides (settings "goals", raw or normalized) applied, in display order. */
export function mergeGoals(config: unknown): GoalEntry[] {
  const saved = normalizeGoalsConfig(config).goals;
  const builtIn = new Map(GOALS.map((g) => [g.slug, g]));
  const used = new Set<string>();
  const out: GoalEntry[] = [];
  for (const r of saved) {
    if (used.has(r.slug)) continue;
    used.add(r.slug);
    const d = builtIn.get(r.slug);
    out.push({
      slug: r.slug,
      name: withDefault(r.name, d?.name ?? { bg: r.slug, en: "" }),
      description: withDefault(r.description, d?.description),
      icon: r.icon || d?.icon || "target",
      image: r.image,
      hidden: r.hidden,
      builtIn: !!d,
    });
  }
  for (const d of GOALS) {
    if (used.has(d.slug)) continue;
    out.push({ slug: d.slug, name: d.name, description: d.description, icon: d.icon, image: "", hidden: false, builtIn: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Look-ups over merged entries

/** A category or subcategory by its address. */
export function findCategoryIn(entries: CategoryEntry[], slug: string): { category: CategoryEntry; sub: SubCategoryEntry | null } | null {
  for (const c of entries) {
    if (c.slug === slug) return { category: c, sub: null };
    const sub = c.subs.find((s) => s.slug === slug);
    if (sub) return { category: c, sub };
  }
  return null;
}

/** "Подкатегория" if there is one, otherwise the category's name (or the address if it no longer exists). */
export function categoryLabelIn(entries: CategoryEntry[], lang: Lang, category: string, subcategory?: string | null): string {
  const c = entries.find((x) => x.slug === category);
  const sub = subcategory ? c?.subs.find((s) => s.slug === subcategory) : undefined;
  return loc(sub?.name ?? c?.name ?? category, lang);
}

/** For the admin's selects: every category (hidden ones too) with its subcategories, Bulgarian names. */
export function categoryOptionsIn(entries: CategoryEntry[]): { slug: string; name: string; hidden: boolean; subs: { slug: string; name: string }[] }[] {
  return entries.map((c) => ({ slug: c.slug, name: c.name.bg, hidden: c.hidden, subs: c.subs.map((s) => ({ slug: s.slug, name: s.name.bg })) }));
}
