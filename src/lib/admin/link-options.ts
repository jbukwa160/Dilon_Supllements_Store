import "server-only";
import { getBrands } from "@/lib/catalog";
import { categoryOptionsIn, mergeCategories, mergeGoals } from "@/lib/categories";
import { catalogDb, storeDb } from "@/lib/db";
import { importedCategorySlugs } from "@/lib/taxonomy";
import { getCategoriesConfig, getGoalsConfig } from "@/lib/settings";
import type { LinkOptions } from "@/components/admin/LinkPicker";

/** Published Bulgarian blog posts, newest first (links are language-neutral, so the BG post is the target). */
function postLinks(): LinkOptions["posts"] {
  try {
    return storeDb()
      .prepare("SELECT slug, title FROM blog_posts WHERE locale = 'bg' AND published = 1 ORDER BY published_at DESC LIMIT 300")
      .all() as LinkOptions["posts"];
  } catch {
    return [];
  }
}

/**
 * Category addresses that have a page: in the shop's scope (taxonomy.ts IMPORTED_CATEGORIES — fitness only) or with
 * products in them (moved there by the admin). The other built-in categories answer 404.
 */
function categoriesWithPage(): Set<string> {
  const out = importedCategorySlugs();
  try {
    for (const r of catalogDb().prepare("SELECT DISTINCT category AS a, subcategory AS b FROM products").all() as { a: string; b: string | null }[]) {
      out.add(r.a);
      if (r.b) out.add(r.b);
    }
  } catch {
    // the catalogue is being rebuilt
  }
  return out;
}

/** What the admin's LinkPicker offers: every category with a page (hidden ones too), brand, goal and published blog post. */
export function getLinkOptions(): LinkOptions {
  const live = categoriesWithPage();
  return {
    categories: categoryOptionsIn(mergeCategories(getCategoriesConfig()))
      .filter((c) => live.has(c.slug))
      .map((c) => ({ slug: c.slug, name: c.name, subs: c.subs.filter((s) => live.has(s.slug)) })),
    brands: getBrands().map((b) => ({ slug: b.slug, name: b.name })),
    goals: mergeGoals(getGoalsConfig()).map((g) => ({ slug: g.slug, name: g.name.bg })),
    posts: postLinks(),
  };
}
