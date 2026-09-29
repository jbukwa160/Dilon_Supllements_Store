"use client";

import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ShieldCheck, ShoppingBag } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { issueText } from "@/lib/checkout";
import { formatPrice, plural } from "@/lib/format";
import { isFreeDelivery } from "@/lib/free-shipping";
import { localizeHref } from "@/lib/links";
import { activeGifts, useCart, useCartReady, useGiftTiers } from "@/lib/store";
import { useSettings } from "@/components/SettingsProvider";
import { Spinner } from "@/components/ui/Spinner";
import { CartLine, ChosenGiftLines } from "./CartLine";
import { GiftPicker } from "./GiftPicker";
import { GiftTierBar } from "./GiftTierBar";
import { useCartPricing } from "./useCartPricing";

/** Body of /kolichka: lines, the milestone bar, the gift picker and the summary with the delivery estimate. */
export function CartView() {
  const lang = useLang();
  const dict = useDict();
  const t = dict.cart;
  const ready = useCartReady();
  const settings = useSettings();
  const { items, gifts, count, subtotal } = useCart();
  const campaign = useGiftTiers();
  const pricing = useCartPricing();

  if (!ready) {
    return (
      <div className="card flex min-h-60 items-center justify-center gap-3 p-8 text-muted">
        <Spinner /> {t.loading}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center md:py-20">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-primary-50 text-primary">
          <ShoppingBag className="h-9 w-9" aria-hidden />
        </span>
        <p className="text-xl font-bold">{t.empty}</p>
        <p className="max-w-sm text-muted">{t.emptyText}</p>
        <Link href={localizeHref("/produkti", lang)} className="btn btn-primary h-12 px-8">
          {t.emptyCta}
        </Link>
      </div>
    );
  }

  const priced = pricing.priced;
  const shownSubtotal = priced?.subtotal ?? subtotal;
  const mode = campaign?.mode ?? "perTier";
  const giftCount = priced ? priced.giftLines.length : activeGifts(gifts, pricing.reached, mode).length;
  const { freeScope, office, address } = settings.shipping;
  // Reached = free for the methods it covers ("до офис" when only offices / lockers are free).
  const freeReached = priced ? priced.freeShipping.reached : isFreeDelivery(subtotal, settings.shipping);
  const cheapest = Math.min(office, address);
  const shippingEstimate = freeReached ? 0 : cheapest;
  const stockIssues = priced?.issues.filter((i) => i.code === "missing" || i.code === "stock") ?? [];
  const blocked = stockIssues.length > 0 || items.some((i) => !settings.allowOutOfStockOrders && (i.stock <= 0 || i.qty > i.stock));
  const issueNames = new Map(items.map((i) => [i.id, i.name]));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:gap-8">
      <div className="min-w-0 space-y-6">
        <section className="card">
          <div className="border-b border-line p-4 md:p-5">
            <GiftTierBar amount={pricing.amount} />
          </div>
          {pricing.updated ? (
            <p className="mx-4 mt-4 rounded-md bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 md:mx-5" role="status">
              {t.updated}
            </p>
          ) : null}
          <ul className="divide-y divide-line px-4 md:px-5">
            {items.map((item) => (
              <li key={item.id} className="py-4 md:py-5">
                <CartLine item={item} />
              </li>
            ))}
          </ul>
          <ChosenGiftLines amount={pricing.amount} reached={pricing.reached} issues={priced?.issues} className="border-t border-line px-4 md:px-5" />
        </section>

        {campaign?.tiers.length ? (
          <section id="podaratsi" className="card scroll-mt-28 p-4 md:p-6" aria-label={campaign.headline}>
            <GiftPicker amount={pricing.amount} reached={pricing.reached} issues={priced?.issues} />
          </section>
        ) : null}
      </div>

      <aside className="card p-5 md:p-6 lg:sticky lg:top-24" aria-labelledby="cart-summary">
        <h2 id="cart-summary" className="text-lg font-bold">
          {dict.checkout.summary}
        </h2>
        <dl className="mt-4 space-y-2.5 text-[0.95rem] tabular-nums">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">{plural(lang, count, t.items)}</dt>
            <dd className="font-semibold">{formatPrice(shownSubtotal, lang)}</dd>
          </div>
          {giftCount ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{fmt(t.gifts, { n: giftCount })}</dt>
              <dd className="font-semibold text-success">{formatPrice(0, lang)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">{t.shipping}</dt>
            <dd className={clsx("text-right font-semibold", freeReached && "text-success")}>
              {freeReached ? (freeScope === "office" ? t.freeOffice : t.free) : fmt(t.shippingFrom, { amount: formatPrice(cheapest, lang) })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <dt className="font-bold">{t.total}</dt>
            <dd className="flex items-center gap-2 text-2xl font-bold">
              {pricing.loading ? <Spinner className="h-4 w-4 text-muted" /> : null}
              {formatPrice(shownSubtotal + shippingEstimate, lang)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {t.inclVat} {t.shippingAtCheckout}
        </p>
        {stockIssues.length ? (
          <ul className="mt-4 space-y-1 rounded-md bg-sale/10 p-3 text-sm font-semibold text-sale" role="alert">
            {stockIssues.map((i, n) => (
              <li key={n}>{issueText(i, lang, { name: (id) => issueNames.get(id) })}</li>
            ))}
          </ul>
        ) : null}
        {blocked ? (
          <>
            <p className="mt-4 rounded-md bg-sale/10 p-3 text-sm font-semibold text-sale">{t.unavailableBlock}</p>
            <button type="button" disabled className="btn btn-energy mt-4 h-14 w-full text-lg">
              {t.checkout}
            </button>
          </>
        ) : (
          <Link href={localizeHref("/porachka", lang)} className="btn btn-energy mt-5 h-14 w-full text-lg">
            {t.checkout} <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
        )}
        <Link href={localizeHref("/produkti", lang)} className="mt-3 block text-center text-sm font-semibold text-ink-soft hover:text-primary">
          {t.continue}
        </Link>
        <p className="mt-5 flex items-center justify-center gap-2 border-t border-line pt-4 text-xs text-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {t.trust}
        </p>
      </aside>
    </div>
  );
}
