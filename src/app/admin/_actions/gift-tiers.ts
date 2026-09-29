"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { writeSetting } from "@/lib/settings";
import { giftProductsBySku, validateGiftTiers, type GiftProduct } from "@/lib/admin/gift-tiers";
import type { GiftTierSettings } from "@/lib/settings-types";

/** Details of a product the admin wants to add as a gift; 18+ products are refused. */
export async function giftProductAction(sku: string): Promise<{ product?: GiftProduct; error?: string }> {
  await requireAdmin();
  const p = typeof sku === "string" && sku.length <= 60 ? giftProductsBySku([sku])[0] : undefined;
  if (!p) return { error: "Продуктът не е намерен." };
  if (p.adultOnly) return { error: `„${p.name}“ е за пълнолетни (18+) — такива продукти не могат да се подаряват.` };
  return { product: p };
}

export async function saveGiftTiersAction(input: GiftTierSettings): Promise<{ ok?: boolean; error?: string; value?: GiftTierSettings; dropped?: number }> {
  await requireAdmin();
  const v = validateGiftTiers(input);
  if ("error" in v) return v;
  writeSetting("giftTiers", v.value);
  revalidatePath("/", "layout");
  return { ok: true, value: v.value, dropped: v.dropped };
}
