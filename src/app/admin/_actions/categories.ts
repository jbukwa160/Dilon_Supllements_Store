"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { catalogDb } from "@/lib/db";
import { writeSetting } from "@/lib/settings";
import { getCategoryEntries } from "@/lib/catalog";
import { mergeCategories, type CategoryEntry, type GoalEntry } from "@/lib/categories";
import { SLUG_RE, normalizeCategoriesConfig, normalizeGoalsConfig, type CategoryConfig, type GoalConfig } from "@/lib/category-config";
import { refreshCatalogAggregates, saveProductEdits, type ProductEditData } from "@/lib/catalog-write";
import { CATEGORY_BY_SLUG, GOAL_BY_SLUG } from "@/lib/taxonomy";
import type { L10n } from "@/lib/l10n";

export type CategoriesInput = {
  categories: CategoryEntry[];
  goals: GoalEntry[];
  /** Deleted categories (that had products) → the category their products move to. */
  moves: Record<string, string>;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const l10nOf = (v: unknown): L10n => {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return { bg: str(o.bg).replace(/\s+/g, " ").trim(), en: str(o.en).replace(/\s+/g, " ").trim() };
};
/** Texts equal to the built-in ones are saved empty, so later improvements of the built-in texts still show. */
const overrideOf = (v: L10n, builtIn: { bg: string; en: string } | undefined): L10n =>
  builtIn ? { bg: v.bg === builtIn.bg ? "" : v.bg, en: v.en === builtIn.en ? "" : v.en } : v;

export async function saveCategoriesAction(input: CategoriesInput): Promise<{ ok?: boolean; moved?: number; error?: string }> {
  await requireAdmin();
  const raw = Array.isArray(input?.categories) ? input.categories.slice(0, 80) : [];
  if (!raw.length) return { error: "Трябва да има поне една категория." };

  // Names and addresses.
  const seen = new Set<string>();
  const config: CategoryConfig[] = [];
  for (const c of raw) {
    const name = l10nOf(c?.name);
    if (!name.bg) return { error: "Всяка категория трябва да има име на български." };
    const subs = Array.isArray(c.subs) ? c.subs.slice(0, 60) : [];
    for (const slug of [c.slug, ...subs.map((s) => s?.slug)]) {
      if (typeof slug !== "string" || slug.length > 60 || !SLUG_RE.test(slug)) return { error: `Невалиден адрес „${String(slug)}“.` };
      if (seen.has(slug)) return { error: `Две категории имат еднакъв адрес „${slug}“ — дайте им различни имена.` };
      seen.add(slug);
    }
    const def = CATEGORY_BY_SLUG.get(c.slug);
    const subConfig = [];
    for (const s of subs) {
      const sname = l10nOf(s.name);
      if (!sname.bg) return { error: `Всяка подкатегория в „${name.bg}“ трябва да има име на български.` };
      const sdef = def?.subs.find((x) => x.slug === s.slug);
      subConfig.push({ slug: s.slug, name: overrideOf(sname, sdef?.name), tagline: l10nOf(s.tagline), hidden: s.hidden === true });
    }
    const icon = str(c.icon);
    const color = str(c.color).toLowerCase();
    config.push({
      slug: c.slug,
      name: overrideOf(name, def?.name),
      tagline: overrideOf(l10nOf(c.tagline), def?.tagline),
      icon: (def && icon === def.icon ? "" : icon) as CategoryConfig["icon"],
      color: def && color === def.color.toLowerCase() ? "" : color,
      image: str(c.image),
      hidden: c.hidden === true,
      subs: subConfig,
    });
  }
  const categories = normalizeCategoriesConfig({ categories: config });

  const rawGoals = Array.isArray(input?.goals) ? input.goals.slice(0, 60) : [];
  const goalConfig: GoalConfig[] = [];
  for (const g of rawGoals) {
    const name = l10nOf(g?.name);
    if (!name.bg) return { error: "Всяка цел трябва да има име на български." };
    const def = GOAL_BY_SLUG.get(str(g.slug));
    const icon = str(g.icon);
    const description = { bg: str(g.description?.bg).trim(), en: str(g.description?.en).trim() };
    goalConfig.push({
      slug: str(g.slug),
      name: overrideOf(name, def?.name),
      description: overrideOf(description, def?.description),
      icon: (def && icon === def.icon ? "" : icon) as GoalConfig["icon"],
      image: str(g.image),
      hidden: g.hidden === true,
    });
  }
  const goals = normalizeGoalsConfig({ goals: goalConfig });

  // Products of deleted categories / subcategories.
  const before = getCategoryEntries();
  const next = mergeCategories(categories);
  const nextSlugs = new Set(next.flatMap((c) => [c.slug, ...c.subs.map((s) => s.slug)]));
  const nextTop = new Set(next.map((c) => c.slug));
  const db = catalogDb();
  const changes: { sku: string; data: ProductEditData }[] = [];
  const movedSkus = new Set<string>();
  for (const c of before) {
    if (c.builtIn || nextTop.has(c.slug)) continue;
    const skus = (db.prepare("SELECT sku FROM products WHERE category = ?").all(c.slug) as { sku: string }[]).map((r) => r.sku);
    if (!skus.length) continue;
    const target = String(input.moves?.[c.slug] ?? "");
    if (!target || !nextSlugs.has(target)) return { error: `Изберете къде да отидат продуктите от „${c.name.bg}“, преди да я изтриете.` };
    for (const sku of skus) {
      changes.push({ sku, data: { category: target } });
      movedSkus.add(sku);
    }
  }
  for (const c of before) {
    if (!nextTop.has(c.slug)) continue;
    for (const s of c.subs) {
      if (s.builtIn || nextSlugs.has(s.slug)) continue;
      // They stay in the category, just without a subcategory.
      const skus = (db.prepare("SELECT sku FROM products WHERE subcategory = ?").all(s.slug) as { sku: string }[]).map((r) => r.sku);
      for (const sku of skus) if (!movedSkus.has(sku)) changes.push({ sku, data: { category: c.slug } });
    }
  }

  // Save first, so products can be moved into categories added in this same save.
  writeSetting("categories", categories);
  writeSetting("goals", goals);
  let moved = 0;
  if (changes.length) moved = saveProductEdits(changes).changed;
  refreshCatalogAggregates();
  revalidatePath("/", "layout");
  return { ok: true, moved };
}
