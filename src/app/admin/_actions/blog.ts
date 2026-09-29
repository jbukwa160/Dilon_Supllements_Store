"use server";

import { revalidatePath } from "next/cache";
import { isLang } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth";
import { deletePost, getPost, savePost, type BlogPostInput } from "@/lib/blog";
import { getCardsBySkus } from "@/lib/catalog";
import type { ProductCard } from "@/lib/catalog-types";

// Блог: save / delete a post, product cards for the editor's live preview.

export async function saveBlogPostAction(id: number | null, input: BlogPostInput): Promise<{ ok?: boolean; id?: number; slug?: string; error?: string }> {
  await requireAdmin();
  if (!input || typeof input !== "object") return { error: "Невалидни данни." };
  const postId = id === null ? null : Number(id);
  if (postId !== null && (!Number.isInteger(postId) || postId <= 0)) return { error: "Невалидна статия." };
  const r = savePost(postId, input);
  if ("error" in r) return { error: r.error };
  revalidatePath("/", "layout");
  return { ok: true, id: r.id, slug: r.slug };
}

export async function deleteBlogPostAction(id: number): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const postId = Number(id);
  if (!Number.isInteger(postId) || !getPost(postId)) return { error: "Статията вече е изтрита." };
  deletePost(postId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Product cards for the editor's preview, as the site would show them (visible products with stock in the family). */
export async function blogPreviewProductsAction(skus: string[], lang: string): Promise<Record<string, ProductCard>> {
  await requireAdmin();
  const list = Array.isArray(skus) ? skus.filter((s): s is string => typeof s === "string" && s.length <= 60).slice(0, 60) : [];
  const cards = getCardsBySkus(isLang(lang) ? lang : "bg", list).filter((p) => p.inStockAny);
  return Object.fromEntries(cards.map((p) => [p.sku, p]));
}
