import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listBrandManufacturers } from "@/lib/manufacturers";
import { PageHeader } from "@/components/admin/PageHeader";
import { ManufacturersEditor } from "@/components/admin/ManufacturersEditor";

export const metadata: Metadata = { title: "Производители" };

export default async function ManufacturersAdminPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdmin();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 80) ?? "";
  return (
    <>
      <PageHeader
        title="Производители"
        description="При храните и хранителните добавки на всяка обява трябва да има име и адрес на производителя или на вносителя (отговорния оператор на храни). Попълнете ги веднъж за всяка марка — показват се в „Информация за производителя“ при всички нейни продукти."
      />
      <ManufacturersEditor key={q} brands={listBrandManufacturers()} initialQuery={q} />
    </>
  );
}
