"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getCustomerById } from "@/lib/customer-auth";
import { deleteCustomer, setCustomerBlocked, signOutCustomerEverywhere } from "@/lib/admin/customers";
import { unsubscribe } from "@/lib/admin/subscribers";

// Поръчки → Клиенти / Абонати: sign a customer out everywhere, block / unblock, delete the account (GDPR), unsubscribe.

const validId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function signOutCustomerAction(id: number): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const customerId = validId(id);
  if (!customerId || !signOutCustomerEverywhere(customerId)) return { error: "Клиентът не е намерен." };
  revalidatePath("/admin/poruchki", "layout");
  return { ok: true };
}

export async function setCustomerBlockedAction(id: number, blocked: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const customerId = validId(id);
  if (!customerId || !setCustomerBlocked(customerId, blocked === true)) return { error: "Клиентът не е намерен." };
  revalidatePath("/admin/poruchki", "layout");
  return { ok: true };
}

/** GDPR erasure. `confirmEmail` must repeat the account's e-mail (a typo-proof confirmation). */
export async function deleteCustomerAction(id: number, confirmEmail: string): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const customerId = validId(id);
  if (!customerId) return { error: "Клиентът не е намерен." };
  const c = getCustomerById(customerId);
  if (!c) return { error: "Клиентът вече е изтрит." };
  if (String(confirmEmail ?? "").trim().toLowerCase() !== c.email.toLowerCase()) return { error: "Въведеният имейл не съвпада с имейла на профила." };
  if (!deleteCustomer(customerId)) return { error: "Клиентът вече е изтрит." };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function unsubscribeAction(email: string): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!unsubscribe(String(email ?? ""))) return { error: "Този имейл вече не е абониран." };
  revalidatePath("/admin/poruchki", "layout");
  return { ok: true };
}
