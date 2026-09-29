"use server";

import { revalidatePath } from "next/cache";
import { endOtherSessions, requireAdmin } from "@/lib/auth";

/** "Изход от всички други устройства": ends every session of this admin except the current one. */
export async function endOtherSessionsAction(): Promise<void> {
  const admin = await requireAdmin();
  await endOtherSessions(admin.id);
  revalidatePath("/admin/profil");
}
