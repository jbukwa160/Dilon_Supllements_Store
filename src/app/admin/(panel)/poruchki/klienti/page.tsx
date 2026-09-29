import type { Metadata } from "next";
import { Check } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { orderCounts } from "@/lib/admin/orders";
import { customersCount, listCustomers } from "@/lib/admin/customers";
import { subscribersCount } from "@/lib/admin/subscribers";
import { PageHeader } from "@/components/admin/PageHeader";
import { CustomersTable } from "@/components/admin/CustomersTable";
import { OrdersTabs, Pager, SearchBox } from "@/components/admin/OrdersTabs";

export const metadata: Metadata = { title: "Клиенти" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CustomersAdminPage({ searchParams }: PageProps<"/admin/poruchki/klienti">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 100);
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const result = listCustomers({ q, page });
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/admin/poruchki/klienti?${s}` : "/admin/poruchki/klienti";
  };

  return (
    <>
      <PageHeader
        title="Клиенти"
        description="Регистрираните клиенти на магазина. Натиснете клиент, за да видите профила, адресите и поръчките му. Поръчките на гости са само в „Поръчки“."
      />
      <OrdersTabs active="customers" counts={{ orders: orderCounts().all, customers: customersCount(), subscribers: subscribersCount() }} />
      {one(sp.deleted) === "1" ? (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-mint-soft px-4 py-3 font-bold text-mint" role="status">
          <Check className="h-5 w-5" strokeWidth={3} /> Профилът е изтрит. Поръчките му са запазени без връзка с профил.
        </p>
      ) : null}
      <div className="mb-4">
        <SearchBox action="/admin/poruchki/klienti" q={q} placeholder="Име, имейл или телефон" />
      </div>
      {q ? (
        <p className="mb-3 text-sm font-bold text-muted">
          {result.total} {result.total === 1 ? "клиент" : "клиента"} за „{q}“
        </p>
      ) : null}
      <CustomersTable customers={result.items} empty={q ? "Няма клиенти, които отговарят на търсенето." : "Все още няма регистрирани клиенти."} />
      <Pager page={result.page} pageCount={result.pageCount} href={href} />
    </>
  );
}
