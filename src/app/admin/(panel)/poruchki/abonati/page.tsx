import type { Metadata } from "next";
import Link from "next/link";
import { Download, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { orderCounts } from "@/lib/admin/orders";
import { customersCount } from "@/lib/admin/customers";
import { listSubscribers, subscribersCount } from "@/lib/admin/subscribers";
import { PageHeader } from "@/components/admin/PageHeader";
import { UnsubscribeButton } from "@/components/admin/CustomerActions";
import { OrdersTabs, Pager, SearchBox } from "@/components/admin/OrdersTabs";

export const metadata: Metadata = { title: "Абонати" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function Source({ newsletter, customerId }: { newsletter: boolean; customerId: number | null }) {
  return (
    <span className="flex flex-wrap gap-1">
      {newsletter ? <span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-extrabold text-sky">Бюлетин</span> : null}
      {customerId ? (
        <Link href={`/admin/poruchki/klienti/${customerId}`} className="inline-flex items-center gap-1 rounded-full bg-grape-soft px-2 py-0.5 text-xs font-extrabold text-grape hover:underline">
          <UserRound className="h-3 w-3" /> Профил
        </Link>
      ) : null}
    </span>
  );
}

export default async function SubscribersAdminPage({ searchParams }: PageProps<"/admin/poruchki/abonati">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 100);
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const result = listSubscribers({ q, page });
  const total = subscribersCount();
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/admin/poruchki/abonati?${s}` : "/admin/poruchki/abonati";
  };

  return (
    <>
      <PageHeader
        title="Абонати"
        description="Потвърдените абонати за новини и промоции — от формата за бюлетин в сайта и от профилите на клиентите. Адрес влиза в списъка едва след като собственикът му натисне линка в имейла за потвърждение (непотвърдените се изтриват след 7 дни). Изпращайте им писма само докато съгласието е в сила."
        actions={
          total ? (
            <a href="/admin/poruchki/abonati/export" className="btn btn-primary h-12 px-6" download>
              <Download className="h-5 w-5" /> Изтегли CSV
            </a>
          ) : null
        }
      />
      <OrdersTabs active="subscribers" counts={{ orders: orderCounts().all, customers: customersCount(), subscribers: total }} />
      <div className="mb-4">
        <SearchBox action="/admin/poruchki/abonati" q={q} placeholder="Имейл или име" />
      </div>

      {result.items.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
          {result.items.map((s) => (
            <li key={s.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <a href={`mailto:${s.email}`} className="break-all font-bold text-sky hover:underline">
                  {s.email}
                </a>
                {s.name ? <div className="text-sm text-ink-soft">{s.name}</div> : null}
              </div>
              <Source newsletter={s.newsletter} customerId={s.customerId} />
              <span className="w-10 text-center text-xs font-black text-muted" title={s.locale === "en" ? "Английски" : "Български"}>
                {s.locale === "en" ? "EN" : "БГ"}
              </span>
              <span className="whitespace-nowrap text-sm text-ink-soft sm:w-44">от {formatDate(s.since, "bg")}</span>
              <UnsubscribeButton email={s.email} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-3xl border border-dashed border-line bg-white p-10 text-center font-bold text-ink-soft">
          {q ? "Няма абонати, които отговарят на търсенето." : "Все още няма абонати."}
        </div>
      )}
      <Pager page={result.page} pageCount={result.pageCount} href={href} />
      <p className="mt-5 text-sm text-muted">
        CSV файлът е в UTF-8 и се отваря директно в Excel. Съдържа имейл, име, език, източник и дата на абониране. Пазете го само докато ви трябва.
      </p>
    </>
  );
}
