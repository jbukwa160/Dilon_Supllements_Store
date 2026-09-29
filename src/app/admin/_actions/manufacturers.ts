"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { catalogDb } from "@/lib/db";
import { EMAIL_RE, normalizeManufacturer, saveManufacturer, type ManufacturerInfo } from "@/lib/manufacturers";

/** Save the food business operator of a brand (all fields empty = remove it). Shown on every product of the brand. */
export async function saveManufacturerAction(brandSlug: string, data: ManufacturerInfo): Promise<{ ok?: boolean; error?: string; data?: ManufacturerInfo }> {
  await requireAdmin();
  const slug = String(brandSlug ?? "");
  if (!catalogDb().prepare("SELECT 1 FROM brands WHERE slug = ?").get(slug)) return { error: "Марката не е намерена — може би вече няма продукти от нея." };
  const m = normalizeManufacturer(data);
  if (m.email && !EMAIL_RE.test(m.email)) return { error: "Имейлът не изглежда правилен (пример: info@firma.com)." };
  if (m.website && !/^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(m.website)) return { error: "Сайтът не изглежда правилен (пример: https://firma.com)." };
  if (Object.values(m).some(Boolean) && (!m.name || !m.address)) {
    return { error: "Попълнете поне име и адрес на производителя (или вносителя) — те са задължителни за етикета." };
  }
  const saved = saveManufacturer(slug, m);
  revalidatePath("/", "layout");
  return { ok: true, data: saved };
}
