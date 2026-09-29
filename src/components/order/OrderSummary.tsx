// Order details (lines, gifts, totals, delivery, payment, contact, status) for the order confirmation page and the
// account area (/profil/porachki/[id], agent E). Server-safe: no hooks, the language comes as a prop. Owner: D.
import Link from "next/link";
import clsx from "clsx";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { deliveryLabel, formatAmount, isDeliveryKey, lineName, lineVariant, paymentLabel, type OrderLine } from "@/lib/checkout";
import { formatDateTime, formatPrice } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import type { Order } from "@/lib/orders";
import { Badge } from "@/components/ui/Badge";
import { ProductImage } from "@/components/product/ProductImage";
import { OrderStatusBadge } from "./OrderStatusBadge";

function Line({ line, lang }: { line: OrderLine; lang: Lang }) {
  const t = getDict(lang).order;
  const gift = line.kind === "gift";
  const name = lineName(line, lang);
  const variant = lineVariant(line, lang);
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-surface p-1">
        <ProductImage src={line.image ?? null} alt="" />
      </span>
      <span className="min-w-0 flex-1">
        {gift ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="new">{t.gift}</Badge>
            {line.tierThreshold ? <span className="text-xs text-muted">{fmt(t.giftTier, { amount: formatAmount(line.tierThreshold, lang) })}</span> : null}
          </span>
        ) : line.brand ? (
          <span className="block text-[0.7rem] font-bold uppercase tracking-[0.06em] text-muted">{line.brand}</span>
        ) : null}
        <Link href={localizeHref(`/produkt/${line.slug}`, lang)} className="line-clamp-2 font-semibold leading-snug hover:text-primary">
          {name}
        </Link>
        <span className="block text-sm text-muted">
          {[variant, gift ? null : `${fmt(t.qty, { n: line.qty })} × ${formatPrice(line.price, lang)}`].filter(Boolean).join(" · ")}
          {gift && line.listPrice ? <span className="block text-xs">{fmt(t.worth, { amount: formatPrice(line.listPrice, lang) })}</span> : null}
        </span>
      </span>
      <span className={clsx("shrink-0 text-right font-bold tabular-nums", gift && "text-success")}>{formatPrice(line.total, lang)}</span>
    </li>
  );
}

export function OrderSummary({ order, lang }: { order: Order; lang: Lang }) {
  const dict = getDict(lang);
  const t = dict.order;
  const paid = order.items.filter((l) => l.kind !== "gift");
  const gifts = order.items.filter((l) => l.kind === "gift");
  const d = order.delivery;
  const method = isDeliveryKey(d.method) ? deliveryLabel(d.method, lang) : d.label;
  const place = [d.postCode, d.city].filter(Boolean).join(" ");

  return (
    <div className="space-y-5">
      <section className="card p-5 md:p-6" aria-labelledby={`order-${order.id}-items`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id={`order-${order.id}-items`} className="text-lg font-bold">
              {fmt(t.number, { number: order.number })}
            </h2>
            <p className="text-sm text-muted">{fmt(t.placedOn, { date: formatDateTime(order.createdAt, lang) })}</p>
          </div>
          <OrderStatusBadge status={order.status} lang={lang} />
        </div>

        <h3 className="sr-only">{t.items}</h3>
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {paid.map((l, i) => (
            <Line key={`i${i}`} line={l} lang={lang} />
          ))}
        </ul>
        {gifts.length ? (
          <>
            <h3 className="mt-4 text-sm font-bold uppercase tracking-[0.06em] text-muted">{t.gifts}</h3>
            <ul className="divide-y divide-line">
              {gifts.map((l, i) => (
                <Line key={`g${i}`} line={l} lang={lang} />
              ))}
            </ul>
          </>
        ) : null}

        <dl className="mt-3 space-y-2 border-t border-line pt-4 tabular-nums">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">{t.subtotal}</dt>
            <dd className="font-semibold">{formatPrice(order.subtotal, lang)}</dd>
          </div>
          {gifts.length ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{`${t.gifts} (${gifts.length})`}</dt>
              <dd className="font-semibold text-success">{formatPrice(0, lang)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">{t.shipping}</dt>
            <dd className={clsx("font-semibold", !order.shipping && "text-success")}>{order.shipping ? formatPrice(order.shipping, lang) : t.free}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <dt className="font-bold">
              {t.total} <span className="text-xs font-normal text-muted">({t.inclVat})</span>
            </dt>
            <dd className="text-xl font-bold">{formatPrice(order.total, lang)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5 md:p-6">
          <h2 className="font-bold">{t.delivery}</h2>
          <p className="mt-2 text-ink-soft">
            {method}
            {d.address ? (
              <>
                <br />
                {d.address}
              </>
            ) : null}
            {place ? (
              <>
                <br />
                {place}
              </>
            ) : null}
          </p>
        </section>
        <section className="card p-5 md:p-6">
          <h2 className="font-bold">{t.payment}</h2>
          <p className="mt-2 text-ink-soft">{paymentLabel(order.payment, lang)}</p>
          <h2 className="mt-4 font-bold">{t.contact}</h2>
          <p className="mt-2 wrap-break-word text-ink-soft">
            {order.customer.firstName} {order.customer.lastName}
            <br />
            {order.customer.phone}
            <br />
            {order.email}
          </p>
        </section>
      </div>

      {order.note ? (
        <section className="card p-5 md:p-6">
          <h2 className="font-bold">{t.note}</h2>
          <p className="mt-2 whitespace-pre-line wrap-break-word text-ink-soft">{order.note}</p>
        </section>
      ) : null}
    </div>
  );
}
