import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { formatDate, formatPrice, plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { getCardsBySkus } from "@/lib/catalog";
import type { Order } from "@/lib/orders";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { ProductImage } from "@/components/product/ProductImage";

// Order rows of the account area (dashboard + /profil/porachki): number, date, status (D's OrderStatusBadge, the
// same pill as on the order page), product thumbnails, total; the whole card links to the order.

/**
 * Product pictures of the orders' lines by SKU: the picture saved with the line, else today's catalogue picture
 * (hidden products included; missing ones fall back to the placeholder).
 */
export function orderImages(lang: Lang, orders: Order[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const lookup = new Set<string>();
  for (const l of orders.flatMap((o) => o.items)) {
    if (l.image) out.set(l.sku, l.image);
    else if (l.sku) lookup.add(l.sku);
  }
  for (const sku of out.keys()) lookup.delete(sku);
  if (lookup.size) for (const c of getCardsBySkus(lang, [...lookup], { includeHidden: true })) out.set(c.sku, c.image);
  return out;
}

const MAX_THUMBS = 4;

export function OrderListItem({ order, lang, images }: { order: Order; lang: Lang; images: Map<string, string | null> }) {
  const d = getDict(lang);
  const t = d.account.ordersPage;
  const paid = order.items.filter((l) => l.kind !== "gift");
  const count = paid.reduce((n, l) => n + l.qty, 0);
  const lines = [...paid, ...order.items.filter((l) => l.kind === "gift")];
  const thumbs = lines.slice(0, lines.length > MAX_THUMBS ? MAX_THUMBS - 1 : MAX_THUMBS);
  const more = lines.length - thumbs.length;

  return (
    <li>
      <Link
        href={localizeHref(`/profil/porachki/${order.number}`, lang)}
        className="card group flex flex-col gap-4 p-4 transition-shadow hover:shadow-lift sm:flex-row sm:items-center sm:gap-5 sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-bold">{fmt(d.order.number, { number: order.number })}</span>
            <OrderStatusBadge status={order.status} lang={lang} />
          </div>
          <p className="mt-1.5 text-sm text-muted">
            <time dateTime={order.createdAt}>{formatDate(order.createdAt, lang)}</time>
            {" · "}
            {plural(lang, count, t.items)}
          </p>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden>
          {thumbs.map((l, i) => (
            <span key={`${l.sku}-${i}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-line bg-surface p-1">
              <ProductImage src={images.get(l.sku) ?? null} alt="" />
            </span>
          ))}
          {more > 0 ? (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-line bg-canvas text-sm font-bold text-muted">
              {fmt(t.more, { n: more })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-line pt-3 sm:w-36 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
          <span className="text-lg font-bold tabular-nums">{formatPrice(order.total, lang)}</span>
          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary group-hover:underline">
            {t.view}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}
