"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { recomputePrices } from "@/lib/pricing-rules";
import {
  deletePromotion,
  duplicatePromotion,
  previewPromotion,
  savePromotion,
  stopPromotion,
  validatePromotion,
  type PromotionInput,
  type PromotionPreview,
} from "@/lib/admin/promotions";

type Result = { ok?: boolean; error?: string; field?: string; id?: number; changed?: number };

/** New prices everywhere: the engine recomputes every product, then all cached pages are refreshed. */
function applyPrices(): number {
  const { changed } = recomputePrices();
  revalidatePath("/", "layout");
  return changed;
}

const validId = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id > 0;

export async function previewPromotionAction(input: PromotionInput): Promise<PromotionPreview | { error: string; field?: string }> {
  await requireAdmin();
  const v = validatePromotion(input);
  if ("error" in v) return v;
  return previewPromotion(v.value);
}

export async function savePromotionAction(input: PromotionInput): Promise<Result> {
  await requireAdmin();
  const v = validatePromotion(input);
  if ("error" in v) return v;
  const id = savePromotion(v.value);
  if (id === null) return { error: "Промоцията вече не съществува — може да е изтрита от друг човек. Презаредете страницата." };
  return { ok: true, id, changed: applyPrices() };
}

export async function stopPromotionAction(id: number): Promise<Result> {
  await requireAdmin();
  if (!validId(id) || !stopPromotion(id)) return { error: "Промоцията не е намерена." };
  return { ok: true, changed: applyPrices() };
}

export async function duplicatePromotionAction(id: number): Promise<Result> {
  await requireAdmin();
  const copy = validId(id) ? duplicatePromotion(id) : null;
  if (!copy) return { error: "Промоцията не е намерена." };
  // The copy is switched off, so prices don't change; the list still needs refreshing.
  revalidatePath("/", "layout");
  return { ok: true, id: copy };
}

export async function deletePromotionAction(id: number): Promise<Result> {
  await requireAdmin();
  if (!validId(id) || !deletePromotion(id)) return { error: "Промоцията не е намерена." };
  return { ok: true, changed: applyPrices() };
}
