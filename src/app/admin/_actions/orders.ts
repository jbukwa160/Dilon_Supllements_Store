"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isOrderStatus } from "@/lib/orders";
import { updateOrderStatus } from "@/lib/admin/orders";

// Поръчки: status and the internal note of an order.

export async function updateOrderAction(id: string, status: string, note: string): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const orderId = String(id ?? "").slice(0, 64);
  const next = String(status ?? "");
  if (!isOrderStatus(next)) return { error: "Невалиден статус." };
  const text = String(note ?? "");
  if (text.length > 2000) return { error: "Бележката е по-дълга от 2000 знака." };
  if (!updateOrderStatus(orderId, next, text)) return { error: "Поръчката не е намерена." };
  // Admin pages and the customer's order pages (status shown in the account).
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}
