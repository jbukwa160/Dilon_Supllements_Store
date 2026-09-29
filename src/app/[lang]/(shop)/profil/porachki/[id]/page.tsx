import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Undo2 } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { requireCustomer } from "@/lib/customer-auth";
import { getCustomerOrder } from "@/lib/customer-account";
import { localizeHref } from "@/lib/links";
import type { Order } from "@/lib/orders";
import { alternates } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { lineName, lineVariant } from "@/lib/checkout";
import { ReorderButton } from "@/components/account/ReorderButton";
import { OrderSummary } from "@/components/order/OrderSummary";

// One of the customer's orders (/profil/porachki/<number>): ownership checked, then the shared order view of the
// checkout (OrderSummary), "Поръчай отново" and the link to the withdrawal form while the withdrawal period runs.

/** We don't store the delivery date: allow this many days for delivery before the withdrawal period (from receipt) ends. */
const DELIVERY_ALLOWANCE_DAYS = 14;

/** Show "Откажи се от поръчката" while the order may still be withdrawn from (the withdrawal page checks again). */
function withdrawable(order: Order, returnDays: number, now = Date.now()): boolean {
  if (order.status === "cancelled" || order.status === "returned") return false;
  const placed = Date.parse(order.createdAt);
  return Number.isFinite(placed) && now <= placed + (returnDays + DELIVERY_ALLOWANCE_DAYS) * 24 * 60 * 60 * 1000;
}

export async function generateMetadata({ params }: PageProps<"/[lang]/profil/porachki/[id]">): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isLang(lang)) return {};
  const d = getDict(lang);
  const title = /^\d{1,12}$/.test(id) ? fmt(d.order.number, { number: id }) : d.account.orderDetail;
  return { title, alternates: alternates(`/profil/porachki/${encodeURIComponent(id)}`, lang), robots: { index: false, follow: false } };
}

export default async function AccountOrderPage({ params }: PageProps<"/[lang]/profil/porachki/[id]">) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  const c = await requireCustomer(lang, `/profil/porachki/${encodeURIComponent(id)}`);
  const order = getCustomerOrder(c.id, id);
  if (!order) notFound();

  const d = getDict(lang);
  const t = d.account.orderPage;
  const returnDays = getSettings().returnDays;
  const canWithdraw = withdrawable(order, returnDays);
  const reorderLines = order.items
    .filter((l) => l.kind !== "gift" && l.id > 0)
    .map((l) => {
      const variant = lineVariant(l, lang);
      return { id: l.id, qty: l.qty, name: variant ? `${lineName(l, lang)} (${variant})` : lineName(l, lang) };
    });

  return (
    <div className="space-y-6">
      <Link href={localizeHref("/profil/porachki", lang)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.back}
      </Link>

      <h1 className="h-display text-[1.5rem] md:text-3xl">{fmt(d.order.number, { number: order.number })}</h1>

      {reorderLines.length || canWithdraw ? (
        <div className="card flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
          {reorderLines.length ? (
            <div className="md:max-w-sm">
              <ReorderButton lines={reorderLines} />
              <p className="mt-2 text-sm text-muted">{t.reorderHint}</p>
            </div>
          ) : null}
          {canWithdraw ? (
            <div className="md:max-w-sm md:text-right">
              <Link href={localizeHref(`/otkaz-ot-dogovor?order=${order.number}`, lang)} className="btn btn-ghost h-12 w-full sm:w-auto">
                <Undo2 className="h-5 w-5" aria-hidden />
                {t.withdraw}
              </Link>
              <p className="mt-2 text-sm text-muted">{fmt(t.withdrawHint, { days: returnDays })}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <OrderSummary order={order} lang={lang} />
    </div>
  );
}
