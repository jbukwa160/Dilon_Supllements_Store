import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Gift, Mail, MessageSquareText, Phone, TriangleAlert, Truck, UserRound, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { courierName, isPaymentKey, ORDER_STATUS_KEYS, paymentLabel, type OrderLine } from "@/lib/checkout";
import { getCustomerById } from "@/lib/customer-auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { ORDER_STATUSES, getOrder } from "@/lib/orders";
import { listWithdrawalsForOrder, sofiaDateTime, withdrawalRefund } from "@/lib/withdrawals";
import { ordersByEmailCount } from "@/lib/admin/orders";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrderStatusForm } from "@/components/admin/OrderStatusForm";

export const metadata: Metadata = { title: "Поръчка" };

const eur = (n: number) => formatPrice(n, "bg");

function LineRow({ line }: { line: OrderLine }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={line.image || "/placeholder.svg"} alt="" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-xl border border-line bg-white object-contain" />
      <div className="min-w-0 flex-1">
        <a href={`/produkt/${line.slug}`} target="_blank" rel="noopener" className="inline-flex items-start gap-1 font-bold leading-snug hover:text-brand">
          {line.name} <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" aria-label="(отваря продукта в сайта)" />
        </a>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-muted">
          {line.variant ? <span className="font-semibold text-ink-soft">{line.variant}</span> : null}
          <span>Код: {line.sku}</span>
          {line.brand ? <span>· {line.brand}</span> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-black">{eur(line.total)}</div>
        <div className="text-sm text-muted">
          {line.qty} × {eur(line.price)}
          {line.oldPrice && line.oldPrice > line.price ? <s className="ml-1">{eur(line.oldPrice)}</s> : null}
        </div>
      </div>
    </li>
  );
}

export default async function OrderAdminPage({ params }: PageProps<"/admin/poruchki/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const o = getOrder(decodeURIComponent(id).slice(0, 64));
  if (!o) notFound();
  const paid = o.items.filter((l) => l.kind !== "gift");
  const gifts = o.items.filter((l) => l.kind === "gift");
  const withdrawals = listWithdrawalsForOrder(o.id);
  const account = o.customerId ? getCustomerById(o.customerId) : null;
  const sameEmail = ordersByEmailCount(o.email);
  const statuses = ORDER_STATUS_KEYS.map((key) => ({ key, ...ORDER_STATUSES[key] }));
  const courier = o.delivery.courier ? courierName(o.delivery.courier, "bg") : null;

  return (
    <>
      <Link href="/admin/poruchki" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички поръчки
      </Link>
      <PageHeader
        title={`Поръчка №${o.number}`}
        description={`Направена на ${formatDateTime(o.createdAt, "bg")} · от ${o.locale === "en" ? "английската" : "българската"} версия на сайта`}
        actions={<span className={`rounded-full px-4 py-1.5 text-sm font-extrabold ${ORDER_STATUSES[o.status].color}`}>{ORDER_STATUSES[o.status].label}</span>}
      />

      {withdrawals.length ? (
        <p className="mb-5 flex items-start gap-2 rounded-2xl border-2 border-brand bg-brand-soft px-4 py-3 font-bold text-brand-dark" role="alert">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          Клиентът е подал отказ от договора ({withdrawals.length === 1 ? "1 заявление" : `${withdrawals.length} заявления`}) — вижте по-долу.
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-3xl border border-line bg-white p-5 md:p-6" aria-labelledby="order-lines">
            <h2 id="order-lines" className="text-lg font-black">
              Продукти <span className="text-base font-bold text-muted">({paid.reduce((n, l) => n + l.qty, 0)} бр.)</span>
            </h2>
            <ul className="mt-1 divide-y divide-line">
              {paid.map((l, i) => (
                <LineRow key={`${l.id}-${i}`} line={l} />
              ))}
            </ul>

            {gifts.length ? (
              <div className="mt-3 rounded-2xl bg-mint-soft/60 p-4">
                <h3 className="flex items-center gap-2 font-black text-mint">
                  <Gift className="h-5 w-5" /> Подаръци към поръчката
                </h3>
                <ul className="mt-1 divide-y divide-mint/20">
                  {gifts.map((g, i) => (
                    <li key={`${g.id}-${i}`} className="flex items-start gap-3 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.image || "/placeholder.svg"} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-xl border border-line bg-white object-contain" />
                      <div className="min-w-0 flex-1">
                        <a href={`/produkt/${g.slug}`} target="_blank" rel="noopener" className="font-bold leading-snug hover:text-brand">
                          {g.name}
                        </a>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          {g.variant ? <span className="font-semibold text-ink-soft">{g.variant}</span> : null}
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-mint">
                            {g.tierTitle || (g.tierThreshold ? `Подарък над ${eur(g.tierThreshold)}` : "Подарък")}
                          </span>
                          <span className="text-muted">Код: {g.sku}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-black">{eur(0)}</div>
                        <div className="text-sm text-muted">
                          {g.qty} бр.{g.listPrice ? ` · стойност ${eur(g.listPrice)}` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <dl className="mt-3 space-y-1.5 border-t border-line pt-3">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Продукти</dt>
                <dd className="font-bold">{eur(o.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Доставка</dt>
                <dd className="font-bold">{o.shipping ? eur(o.shipping) : "Безплатна"}</dd>
              </div>
              <div className="flex justify-between gap-4 text-lg">
                <dt className="font-black">Общо</dt>
                <dd className="font-black">{eur(o.total)}</dd>
              </div>
            </dl>
          </section>

          {withdrawals.length ? (
            <section className="rounded-3xl border-2 border-brand bg-white p-5 md:p-6" aria-labelledby="order-withdrawals">
              <h2 id="order-withdrawals" className="flex items-center gap-2 text-lg font-black text-brand">
                <TriangleAlert className="h-5 w-5" /> Отказ от договора
              </h2>
              <ul className="mt-3 space-y-4">
                {withdrawals.map((w) => {
                  const at = sofiaDateTime(w.createdAt, "bg");
                  return (
                    <li key={w.id} className="rounded-2xl bg-brand-soft/50 p-4">
                      <p className="font-bold">
                        Получен на {at.date} в {at.time} ч. · {w.wholeOrder ? "за цялата поръчка" : "за част от продуктите"}
                      </p>
                      {!w.wholeOrder ? (
                        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                          {w.items.map((l) => (
                            <li key={`${w.id}-${l.line}`}>
                              {l.name}
                              {l.variant ? ` (${l.variant})` : ""} — {l.qty} от {l.ordered} бр.{l.kind === "gift" ? " · подарък" : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {w.reason ? (
                        <p className="mt-2 whitespace-pre-line text-sm">
                          <span className="font-bold">Причина:</span> {w.reason}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-ink-soft">
                        Сума за връщане: <b className="text-ink">{eur(withdrawalRefund(w, o))}</b> · Потвърждение до{" "}
                        <a href={`mailto:${w.email}`} className="font-bold text-sky hover:underline">
                          {w.email}
                        </a>{" "}
                        · {w.locale === "en" ? "на английски" : "на български"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-line bg-white p-5 md:p-6">
              <h2 className="text-lg font-black">Клиент</h2>
              <p className="mt-2 font-bold">
                {o.customer.firstName} {o.customer.lastName}
              </p>
              {o.customer.phone ? (
                <p className="mt-1.5 flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-muted" />
                  <a href={`tel:${o.customer.phone.replace(/[^\d+]/g, "")}`} className="font-bold text-sky hover:underline">
                    {o.customer.phone}
                  </a>
                </p>
              ) : null}
              <p className="mt-1.5 flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-muted" />
                <a href={`mailto:${o.customer.email}`} className="break-all text-sky hover:underline">
                  {o.customer.email}
                </a>
              </p>
              <div className="mt-3 border-t border-line pt-3 text-sm">
                {o.customerId && account ? (
                  <Link href={`/admin/poruchki/klienti/${o.customerId}`} className="inline-flex items-center gap-1.5 font-extrabold text-sky hover:underline">
                    <UserRound className="h-4 w-4" /> Регистриран клиент →
                  </Link>
                ) : (
                  <span className="text-muted">Поръчка без профил (гост)</span>
                )}
                {sameEmail > 1 ? (
                  <Link href={`/admin/poruchki?q=${encodeURIComponent(o.email)}`} className="mt-1 block font-bold text-ink-soft hover:text-ink">
                    {sameEmail} поръчки с този имейл →
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="rounded-3xl border border-line bg-white p-5 md:p-6">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Truck className="h-5 w-5 text-muted" /> Доставка и плащане
              </h2>
              <p className="mt-2 font-bold">{o.delivery.label}</p>
              {o.delivery.officeName ? <p className="text-ink-soft">{o.delivery.officeName}</p> : null}
              <p className="text-ink-soft">
                {[o.delivery.city, o.delivery.postCode].filter(Boolean).join(" ")}
                {o.delivery.address ? `, ${o.delivery.address}` : ""}
                {o.delivery.typedCity ? (
                  <span
                    className="ml-2 inline-block rounded-full bg-sun-soft px-2 py-0.5 align-middle text-xs font-bold text-ink"
                    title="Клиентът е въвел населеното място ръчно (търсенето на куриера не отговаряше) — проверете адреса преди изпращане."
                  >
                    въведено ръчно
                  </span>
                ) : null}
              </p>
              {o.delivery.officeId ? (
                <p className="mt-1 text-sm text-muted">
                  Код на офиса{courier ? ` в ${courier}` : ""}: <b className="text-ink">{o.delivery.officeId}</b>
                </p>
              ) : null}
              <p className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <Wallet className="h-4 w-4 shrink-0 text-muted" />
                <span className="text-ink-soft">Плащане:</span> <b>{isPaymentKey(o.payment) ? paymentLabel(o.payment, "bg") : o.payment}</b>
              </p>
            </div>
          </section>

          {o.note ? (
            <section className="rounded-3xl border border-line bg-white p-5 md:p-6">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <MessageSquareText className="h-5 w-5 text-muted" /> Бележка от клиента
              </h2>
              <p className="mt-2 whitespace-pre-line text-ink-soft">{o.note}</p>
            </section>
          ) : null}
        </div>
        <OrderStatusForm id={o.id} status={o.status} note={o.adminNote ?? ""} statuses={statuses} />
      </div>
    </>
  );
}
