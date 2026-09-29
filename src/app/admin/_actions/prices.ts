"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { applyBulk, applyPriceImport, cleanBulk, previewBulk, type BulkInput, type BulkPreview } from "@/lib/admin/prices";

// The price file itself is uploaded and previewed by the route handler POST /admin/tseni/import (bigger than the
// Server Action body limit); applying the stored preview is applyPriceFileAction.

export async function applyPriceFileAction(id: string): Promise<{ ok?: boolean; changed?: number; error?: string }> {
  await requireAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id)) return { error: "Невалидна заявка." };
  const changed = applyPriceImport(id);
  if (changed == null) return { error: "Прегледът е изтекъл или вече е приложен. Качете файла отново." };
  revalidatePath("/", "layout");
  return { ok: true, changed };
}

export async function previewBulkAction(input: BulkInput): Promise<BulkPreview | { error: string }> {
  await requireAdmin();
  const clean = cleanBulk(input);
  if (!clean) return { error: "Проверете избора: за кои продукти, посока и процент (между 1 и 90)." };
  return previewBulk(clean);
}

export async function applyBulkAction(input: BulkInput): Promise<{ ok?: boolean; changed?: number; error?: string }> {
  await requireAdmin();
  const clean = cleanBulk(input);
  if (!clean) return { error: "Проверете избора: за кои продукти, посока и процент (между 1 и 90)." };
  const changed = applyBulk(clean);
  revalidatePath("/", "layout");
  return { ok: true, changed };
}
