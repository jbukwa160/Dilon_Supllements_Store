import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUS_KEYS } from "@/lib/checkout";
import { ORDER_STATUSES, isOrderStatus } from "@/lib/orders";
import { listOrders, orderCounts } from "@/lib/admin/orders";
import { customersCount } from "@/lib/admin/customers";
import { subscribersCount } from "@/lib/admin/subscribers";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { OrdersTabs, Pager, SearchBox } from "@/components/admin/OrdersTabs";

export const metadata: Metadata = { title: "Поръчки" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function OrdersAdminPage({ searchParams }: PageProps<"/admin/poruchki">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = isOrderStatus(one(sp.status)) ? one(sp.status) : "";
  const q = one(sp.q).trim().slice(0, 100);
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const counts = orderCounts();
  const result = listOrders({ status, q, page });

  const href = (patch: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = patch.status ?? status;
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    if (patch.page && patch.page > 1) p.set("page", String(patch.page));
    const str = p.toString();
    return str ? `/admin/poruchki?${str}` : "/admin/poruchki";
  };
  const chips = [{ key: "", label: "Всички", count: counts.all }, ...ORDER_STATUS_KEYS.map((k) => ({ key: k, label: ORDER_STATUSES[k].label, count: counts[k] }))];

  return (
    <>
      <PageHeader title="Поръчки" description="Натиснете поръчка, за да видите подробностите и да смените статуса ѝ. Търсете по номер, име, телефон или имейл." />
      <OrdersTabs active="orders" counts={{ orders: counts.all, customers: customersCount(), subscribers: subscribersCount() }} />

      <div className="mb-4 flex flex-col gap-3">
        <SearchBox action="/admin/poruchki" q={q} placeholder="№ на поръчка, име, телефон или имейл" keep={status ? { status } : {}} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Статус">
          {chips.map((c) => (
            <Link
              key={c.key || "all"}
              href={href({ status: c.key, page: 1 })}
              aria-current={status === c.key ? "page" : undefined}
              className={clsx("chip", status === c.key && "!border-ink !bg-ink !text-white")}
            >
              {c.label} <span className="opacity-70">{c.count}</span>
            </Link>
          ))}
        </div>
      </div>

      {q ? (
        <p className="mb-3 text-sm font-bold text-muted">
          {result.total} {result.total === 1 ? "поръчка" : "поръчки"} за „{q}“
        </p>
      ) : null}
      <OrdersTable orders={result.items} empty={q ? "Няма поръчки, които отговарят на търсенето." : status ? "Няма поръчки с този статус." : "Все още няма поръчки."} />
      <Pager page={result.page} pageCount={result.pageCount} href={(n) => href({ page: n })} />
    </>
  );
}
