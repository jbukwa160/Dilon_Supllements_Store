import Link from "next/link";
import { Ban, Check, Minus } from "lucide-react";
import type { AdminCustomerRow } from "@/lib/admin/customers";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { ScrollArea } from "@/components/admin/ScrollArea";

// Registered customers (Поръчки → Клиенти): a table from `md`, cards on phones. Server-safe (no hooks).

function Marketing({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 font-bold text-mint" title="Съгласен е да получава маркетингови имейли">
      <Check className="h-4 w-4" strokeWidth={3} /> <span className="sr-only">да</span>
    </span>
  ) : (
    <span className="text-muted" title="Без съгласие за маркетинг">
      <Minus className="h-4 w-4" /> <span className="sr-only">не</span>
    </span>
  );
}

function Blocked() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-extrabold text-brand">
      <Ban className="h-3 w-3" /> Блокиран
    </span>
  );
}

export function CustomersTable({ customers, empty }: { customers: AdminCustomerRow[]; empty: string }) {
  if (!customers.length) {
    return <div className="rounded-3xl border border-dashed border-line bg-white p-10 text-center font-bold text-ink-soft">{empty}</div>;
  }
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white md:hidden">
        {customers.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/poruchki/klienti/${c.id}`} className="block p-4 hover:bg-canvas">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-black">{c.name || c.email}</span>
                {c.blocked ? <Blocked /> : <span className="shrink-0 text-sm font-bold">{formatPrice(c.spent, "bg")}</span>}
              </div>
              <div className="truncate text-sm text-ink-soft">{c.email}</div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
                <span>Регистриран {formatDate(c.createdAt, "bg")}</span>
                <span>· {c.orders} поръчки</span>
                {c.marketing ? <span className="font-bold text-mint">· маркетинг ✓</span> : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <ScrollArea className="rounded-3xl border border-line bg-white" wrapperClassName="hidden md:block">
        <table className="w-full min-w-[860px] text-left text-[0.95rem]">
          <thead className="border-b border-line bg-canvas text-xs font-extrabold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-5 py-3">
                Име
              </th>
              <th scope="col" className="px-2 py-3">
                Имейл
              </th>
              <th scope="col" className="px-2 py-3">
                Телефон
              </th>
              <th scope="col" className="px-2 py-3">
                Регистрация
              </th>
              <th scope="col" className="px-2 py-3 text-right">
                Поръчки
              </th>
              <th scope="col" className="px-2 py-3 text-right">
                Похарчено
              </th>
              <th scope="col" className="px-2 py-3 text-center">
                Маркетинг
              </th>
              <th scope="col" className="px-5 py-3">
                Последен вход
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-canvas">
                <td className="px-5 py-3">
                  <Link href={`/admin/poruchki/klienti/${c.id}`} className="font-bold hover:text-brand">
                    {c.name || "—"}
                  </Link>
                  {c.blocked ? (
                    <span className="ml-2">
                      <Blocked />
                    </span>
                  ) : null}
                  {c.locale === "en" ? <span className="ml-1.5 rounded bg-grape-soft px-1 text-[0.65rem] font-black text-grape">EN</span> : null}
                </td>
                <td className="px-2 py-3">
                  <a href={`mailto:${c.email}`} className="text-sky hover:underline">
                    {c.email}
                  </a>
                </td>
                <td className="whitespace-nowrap px-2 py-3">{c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a> : <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-2 py-3 text-ink-soft">{formatDate(c.createdAt, "bg")}</td>
                <td className="px-2 py-3 text-right font-bold">
                  {c.orders ? (
                    <Link href={`/admin/poruchki/klienti/${c.id}#orders`} className="hover:text-brand">
                      {c.orders}
                    </Link>
                  ) : (
                    0
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-right font-bold">{formatPrice(c.spent, "bg")}</td>
                <td className="px-2 py-3 text-center">
                  <Marketing on={c.marketing} />
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{c.lastLoginAt ? formatDateTime(c.lastLoginAt, "bg") : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </>
  );
}
