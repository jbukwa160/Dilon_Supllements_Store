// What the admin changed about categories and goals (Admin → Категории), stored in store.db settings
// "categories" / "goals". Only the TYPES and the normalizers live here; lib/categories.ts merges them with the
// built-in taxonomy. Shared by the site and the CSV importer, so no server-only imports here.
//
// Addresses (slugs) never change — renaming a category keeps its /kategoria/… link. Built-in categories,
// subcategories and goals can be renamed, re-ordered and hidden but not deleted (the importer sorts products
// into them); categories and subcategories the admin added can be deleted.
import { normL10n, type L10n } from "./l10n";
import { parseColor } from "./settings-types";
import { normalizeImage } from "./settings-normalize";

/** lucide icon names the admin can pick for a category or goal tile. */
export const CATEGORY_ICONS = [
  "dumbbell", "biceps-flexed", "flame", "zap", "battery-charging", "activity", "heart-pulse", "heart", "brain", "moon",
  "sun", "shield", "shield-plus", "pill", "pill-bottle", "tablets", "flask-conical", "leaf", "sprout", "flower-2",
  "apple", "citrus", "carrot", "salad", "wheat", "nut", "bean", "egg", "milk", "beef", "fish", "droplet", "droplets",
  "glass-water", "cup-soda", "coffee", "cookie", "candy", "bone", "eye", "sparkles", "baby", "bike", "footprints",
  "trophy", "target", "timer", "scale", "gift", "tag", "percent", "star", "package",
] as const;
export type CategoryIconName = (typeof CATEGORY_ICONS)[number];

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A subcategory as saved by the admin. Empty texts = the built-in ones. */
export type SubCategoryConfig = { slug: string; name: L10n; tagline: L10n; hidden: boolean };

/** A category as saved by the admin. Empty texts / icon / colour = the built-in ones; image "" = automatic. */
export type CategoryConfig = {
  slug: string;
  name: L10n;
  tagline: L10n;
  icon: CategoryIconName | "";
  /** Tile colour (#rrggbb) or "". */
  color: string;
  image: string;
  /** Hidden from menus, home page and footer (its page and products still work). */
  hidden: boolean;
  subs: SubCategoryConfig[];
};

/** Settings "categories": every category in menu order (built-ins missing from the list come back at the end). */
export type CategoriesConfig = { categories: CategoryConfig[] };

/** A goal ("Пазарувай по цел") as saved by the admin. Empty texts / icon = the built-in ones; image "" = automatic. */
export type GoalConfig = { slug: string; name: L10n; description: L10n; icon: CategoryIconName | ""; image: string; hidden: boolean };

/** Settings "goals": every goal in display order. */
export type GoalsConfig = { goals: GoalConfig[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const validSlug = (v: unknown): v is string => typeof v === "string" && v.length <= 60 && SLUG_RE.test(v);
/** One-line text: whitespace collapsed. */
const line = (v: unknown, max: number): L10n => {
  const t = normL10n(v, max * 2);
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, max);
  return { bg: clean(t.bg), en: clean(t.en) };
};
const icon = (v: unknown): CategoryIconName | "" =>
  typeof v === "string" && (CATEGORY_ICONS as readonly string[]).includes(v) ? (v as CategoryIconName) : "";

/** Saved categories (store.db settings "categories"), cleaned up: valid unique slugs, clipped texts, known icons. Never throws. */
export function normalizeCategoriesConfig(raw: unknown): CategoriesConfig {
  const list = isObj(raw) && Array.isArray(raw.categories) ? raw.categories : Array.isArray(raw) ? raw : [];
  const used = new Set<string>();
  const categories: CategoryConfig[] = [];
  for (const r of list.slice(0, 80)) {
    if (!isObj(r) || !validSlug(r.slug) || used.has(r.slug)) continue;
    used.add(r.slug);
    const subs: SubCategoryConfig[] = [];
    for (const s of Array.isArray(r.subs) ? r.subs.slice(0, 60) : []) {
      if (!isObj(s) || !validSlug(s.slug) || used.has(s.slug)) continue;
      used.add(s.slug);
      subs.push({ slug: s.slug, name: line(s.name, 60), tagline: line(s.tagline, 120), hidden: s.hidden === true });
    }
    categories.push({
      slug: r.slug,
      name: line(r.name, 60),
      tagline: line(r.tagline, 120),
      icon: icon(r.icon),
      color: parseColor(typeof r.color === "string" ? r.color : "") ?? "",
      image: normalizeImage(r.image),
      hidden: r.hidden === true,
      subs,
    });
  }
  return { categories };
}

/** Saved goals (store.db settings "goals"), cleaned up. Never throws. */
export function normalizeGoalsConfig(raw: unknown): GoalsConfig {
  const list = isObj(raw) && Array.isArray(raw.goals) ? raw.goals : Array.isArray(raw) ? raw : [];
  const used = new Set<string>();
  const goals: GoalConfig[] = [];
  for (const r of list.slice(0, 60)) {
    if (!isObj(r) || !validSlug(r.slug) || used.has(r.slug)) continue;
    used.add(r.slug);
    goals.push({
      slug: r.slug,
      name: line(r.name, 60),
      description: normL10n(r.description, 300),
      icon: icon(r.icon),
      image: normalizeImage(r.image),
      hidden: r.hidden === true,
    });
  }
  return { goals };
}
