import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Check, Mail, MapPin, MessagesSquare, Minus, Phone, Star } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { deliveryLabel, isDeliveryKey } from "@/lib/checkout";
import { conversationsOfCustomer } from "@/lib/chat";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { getAdminCustomer } from "@/lib/admin/customers";
import { listOrders } from "@/lib/admin/orders";
import { PageHeader } from "@/components/admin/PageHeader";
import { CustomerActions } from "@/components/admin/CustomerActions";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { Pager } from "@/components/admin/OrdersTabs";

export const metadata: Metadata = { title: "Клиент" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-bold">{children}</dd>
    </div>
  );
}

export default async function CustomerAdminPage({ params, searchParams }: PageProps<"/admin/poruchki/klienti/[id]">) {
  await requireAdmin();
  const id = parseInt((await params).id, 10);
  const c = Number.isInteger(id) && id > 0 ? getAdminCustomer(id) : null;
  if (!c) notFound();
  const pageParam = (await searchParams).page;
  const page = Math.max(1, parseInt(Array.isArray(pageParam) ? (pageParam[0] ?? "") : (pageParam ?? ""), 10) || 1);
  const orders = listOrders({ customerId: c.id, page });
  const chats = conversationsOfCustomer(c.id);

  return (
    <>
      <Link href="/admin/poruchki/klienti" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички клиенти
      </Link>
      <PageHeader
        title={c.name || c.email}
        description={`Регистриран на ${formatDate(c.createdAt, "bg")}`}
        actions={
          c.blocked ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-1.5 text-sm font-extrabold text-brand">
              <Ban className="h-4 w-4" /> Блокиран
            </span>
          ) : null
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-line bg-white p-5 md:p-6">
              <h2 className="text-lg font-black">Профил</h2>
              <p className="mt-2 flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-muted" />
                <a href={`mailto:${c.email}`} className="break-all font-bold text-sky hover:underline">
                  {c.email}
                </a>
              </p>
              {c.phone ? (
                <p className="mt-1.5 flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-muted" />
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="font-bold text-sky hover:underline">
                    {c.phone}
                  </a>
                </p>
              ) : null}
              <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
                <Row label="Език">{c.locale === "en" ? "Английски" : "Български"}</Row>
                <Row label="Последен вход">{c.lastLoginAt ? formatDateTime(c.lastLoginAt, "bg") : "—"}</Row>
                <Row label="Маркетингови имейли">
                  {c.marketingConsentAt ? (
                    <span className="inline-flex items-center gap-1 text-mint">
                      <Check className="h-4 w-4" strokeWidth={3} /> от {formatDate(c.marketingConsentAt, "bg")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Minus className="h-4 w-4" /> не
                    </span>
                  )}
                </Row>
                {c.emailVerifiedAt ? <Row label="Имейлът е потвърден">{formatDate(c.emailVerifiedAt, "bg")}</Row> : null}
              </dl>
            </div>
            <div className="rounded-3xl border border-line bg-white p-5 md:p-6">
              <h2 className="text-lg font-black">Покупки</h2>
              <dl className="mt-2 divide-y divide-line text-sm">
                <Row label="Поръчки">{c.orders}</Row>
                <Row label="Похарчено (без отказани и върнати)">{formatPrice(c.spent, "bg")}</Row>
              </dl>
              {chats.length ? (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="flex items-center gap-2 text-sm font-extrabold">
                    <MessagesSquare className="h-4 w-4 text-muted" /> Разговори в чата
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {chats.slice(0, 5).map((ch) => (
                      <li key={ch.id}>
                        <Link href={`/admin/chat?c=${ch.id}`} className="font-bold text-sky hover:underline">
                          {formatDateTime(ch.lastMessageAt, "bg")}
                        </Link>{" "}
                        <span className="text-muted">
                          · {ch.messageCount} съобщ. · {ch.status === "closed" ? "приключен" : "отворен"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-white p-5 md:p-6" aria-labelledby="customer-addresses">
            <h2 id="customer-addresses" className="text-lg font-black">
              Адреси за доставка <span className="text-base font-bold text-muted">({c.addresses.length})</span>
            </h2>
            {c.addresses.length ? (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {c.addresses.map((a) => (
                  <li key={a.id} className="rounded-2xl border border-line p-4 text-sm">
                    <p className="flex items-center gap-2 font-extrabold">
                      <MapPin className="h-4 w-4 shrink-0 text-muted" /> {a.label || (isDeliveryKey(a.method) ? deliveryLabel(a.method, "bg", true) : a.method)}
                      {a.isDefault ? (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-extrabold">
                          <Star className="h-3 w-3" /> основен
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-ink-soft">{isDeliveryKey(a.method) ? deliveryLabel(a.method, "bg") : a.method}</p>
                    {a.office ? (
                      <p className="text-ink-soft">
                        {a.office.name} · код {a.office.id}
                      </p>
                    ) : null}
                    <p className="text-ink-soft">
                      {[a.cityName, a.postCode].filter(Boolean).join(" ")}
                      {a.address ? `, ${a.address}` : ""}
                    </p>
                    {a.phone ? <p className="text-ink-soft">Тел. {a.phone}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Няма запазени адреси.</p>
            )}
          </section>

          <section id="orders" aria-labelledby="customer-orders" className="scroll-mt-6">
            <h2 id="customer-orders" className="mb-3 text-lg font-black">
              Поръчки
            </h2>
            <OrdersTable orders={orders.items} empty="Клиентът още няма поръчки." showCustomer={false} />
            <Pager page={orders.page} pageCount={orders.pageCount} href={(n) => `/admin/poruchki/klienti/${c.id}${n > 1 ? `?page=${n}` : ""}#orders`} />
          </section>
        </div>
        <div className="space-y-5 lg:sticky lg:top-6">
          <CustomerActions id={c.id} email={c.email} blocked={c.blocked} sessions={c.activeSessions} />
        </div>
      </div>
    </>
  );
}
