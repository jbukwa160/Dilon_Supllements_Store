import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/admin/PageHeader";
import { SettingsEditor } from "@/components/admin/SettingsEditor";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsAdminPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Настройки на магазина"
        description="Контакти, доставка и връщане, фирмени и банкови данни, социални мрежи и бисквитки. Показват се в целия сайт."
      />
      <SettingsEditor initial={getSettings()} />
    </>
  );
}
