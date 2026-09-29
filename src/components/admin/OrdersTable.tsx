import Link from "next/link";
import clsx from "clsx";
import { Gift, Phone, TriangleAlert, UserRound } from "lucide-react";
import type { OrderRowSummary } from "@/lib/admin/orders";
import { ORDER_STATUSES } from "@/lib/orders";
import { formatDateTime, formatPrice } from "@/lib/format";

// The orders list (Поръчки and a customer's page): a table from `md`, cards on phones. Server-safe (no hooks).

const eur = (n: number) => formatPrice(n, "bg");

function StatusPill({ status }: { status: OrderRowSummary["status"] }) {
  const s = ORDER_STATUSES[status];
  return <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold ${s.color}`}>{s.label}</span>;
}

function WithdrawalFlag({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-soft px-2 py-0.5 text-xs font-extrabold text-brand" title="Клиентът е подал отказ от договора">
      <TriangleAlert className="h-3 w-3" /> Отказ
    </span>
  );
}

/** `showCustomer = false` on a customer's own page (the name / phone columns would repeat the same person). */
export function OrdersTable({ orders, empty = "Няма поръчки.", showCustomer = true }: { orders: OrderRowSummary[]; empty?: string; showCustomer?: boolean }) {
  if (!orders.length) {
    return <div className="rounded-3xl border border-dashed border-line bg-white p-10 text-center font-bold text-ink-soft">{empty}</div>;
  }
  return (
    <>
      {/* phones */}
      <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white md:hidden">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/poruchki/${o.id}`} className="block p-4 hover:bg-canvas">
              <div className="flex items-center justify-between gap-3">
                <span className="font-black">№{o.number}</span>
                <StatusPill status={o.status} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="truncate font-bold">
                  {o.customer.firstName} {o.customer.lastName}
                </span>
                <span className="shrink-0 font-black">{eur(o.total)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>{formatDateTime(o.createdAt, "bg")}</span>
                <span>· {o.city || o.deliveryLabel}</span>
                {o.gifts ? (
                  <span className="inline-flex items-center gap-0.5 text-mint">
                    · <Gift className="h-3 w-3" /> {o.gifts}
                  </span>
                ) : null}
                {o.locale === "en" ? <span className="rounded bg-grape-soft px-1 font-black text-grape">EN</span> : null}
                <WithdrawalFlag n={o.withdrawals} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* tablets and up */}
      <div className="hidden overflow-x-auto rounded-3xl border border-line bg-white md:block">
        <table className={clsx("w-full text-left text-[0.95rem]", showCustomer ? "min-w-[760px]" : "min-w-[520px]")}>
          <thead className="border-b border-line bg-canvas text-xs font-extrabold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-5 py-3">
                №
              </th>
              <th scope="col" className="px-2 py-3">
                Дата
              </th>
              {showCustomer ? (
                <>
                  <th scope="col" className="px-2 py-3">
                    Клиент
                  </th>
                  <th scope="col" className="px-2 py-3">
                    Телефон
                  </th>
                </>
              ) : null}
              <th scope="col" className="px-2 py-3">
                Доставка
              </th>
              <th scope="col" className="px-2 py-3 text-right">
                Сума
              </th>
              <th scope="col" className="px-5 py-3 text-right">
                Статус
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-canvas">
                <td className="px-5 py-3 font-black">
                  <Link href={`/admin/poruchki/${o.id}`} className="hover:text-brand">
                    №{o.number}
                  </Link>
                  {o.locale === "en" ? (
                    <span className="ml-1.5 rounded bg-grape-soft px-1 text-[0.65rem] font-black text-grape" title="Поръчана от английската версия">
                      EN
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-ink-soft">{formatDateTime(o.createdAt, "bg")}</td>
                {showCustomer ? (
                  <>
                    <td className="px-2 py-3">
                      <Link href={`/admin/poruchki/${o.id}`} className="inline-flex items-center gap-1.5 font-bold hover:text-brand">
                        {o.customerId ? <UserRound className="h-3.5 w-3.5 text-sky" aria-label="Регистриран клиент" /> : null}
                        {o.customer.firstName} {o.customer.lastName}
                      </Link>
                      <div className="text-xs text-muted">{o.customer.email}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {o.customer.phone ? (
                        <a href={`tel:${o.customer.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-sky">
                          <Phone className="h-3.5 w-3.5 text-muted" /> {o.customer.phone}
                        </a>
                      ) : null}
                    </td>
                  </>
                ) : null}
                <td className="px-2 py-3 text-ink-soft">
                  <div className="line-clamp-1">{o.deliveryLabel}</div>
                  <div className="text-xs text-muted">{o.city}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right">
                  <div className="font-bold">{eur(o.total)}</div>
                  <div className="text-xs text-muted">
                    {o.items} бр.
                    {o.gifts ? (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-mint" title="Подаръци към поръчката">
                        + <Gift className="h-3 w-3" /> {o.gifts}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill status={o.status} />
                    <WithdrawalFlag n={o.withdrawals} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
