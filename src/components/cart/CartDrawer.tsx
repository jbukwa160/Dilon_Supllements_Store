"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, Gift, ShoppingBag } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { formatPrice, plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { activeGifts, useCart, useCartDrawer, useGiftTiers } from "@/lib/store";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { Drawer } from "@/components/ui/Drawer";
import { Spinner } from "@/components/ui/Spinner";
import { CartLine, ChosenGiftLines } from "./CartLine";
import { GiftPicker } from "./GiftPicker";
import { GiftTierBar } from "./GiftTierBar";
import { useCartPricing } from "./useCartPricing";

/** The cart as a side panel (full width on phones), mounted once in ShopChrome and opened by CartButton / AddToCart. */
export function CartDrawer() {
  const lang = useLang();
  const dict = useDict();
  const t = dict.cart;
  const { open, lastAdded, hide } = useCartDrawer();
  const { items, gifts, count, subtotal } = useCart();
  const campaign = useGiftTiers();
  const pricing = useCartPricing({ enabled: open });
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerId = useId();
  const pathname = usePublicPathname();

  // A link inside the drawer (product, cart, checkout) navigated: close it.
  useEffect(() => hide(), [pathname, hide]);

  const tiers = campaign?.tiers ?? [];
  const reachedCount = tiers.filter((x) => pricing.reached.has(x.id)).length;
  const mode = campaign?.mode ?? "perTier";
  const chosenActive = activeGifts(gifts, pricing.reached, mode).length;
  const unclaimed = mode === "single" ? (reachedCount > 0 && chosenActive === 0 ? 1 : 0) : Math.max(0, reachedCount - chosenActive);
  const sorted = [...items].sort((a, b) => (a.id === lastAdded ? -1 : b.id === lastAdded ? 1 : 0));
  const shownSubtotal = pricing.priced?.subtotal ?? subtotal;

  return (
    <Drawer
      open={open}
      onClose={hide}
      title={count ? fmt(t.titleCount, { n: count }) : t.title}
      footer={
        items.length ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink-soft">{t.subtotal}</span>
              <span className="flex items-center gap-2 text-xl font-bold tabular-nums">
                {pricing.loading ? <Spinner className="h-4 w-4 text-muted" /> : null}
                {formatPrice(shownSubtotal, lang)}
              </span>
            </div>
            <p className="-mt-2 text-xs text-muted">{t.shippingAtCheckout}</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Link href={localizeHref("/kolichka", lang)} onClick={hide} className="btn btn-ghost h-12 px-3">
                {t.toCart}
              </Link>
              <Link href={localizeHref("/porachka", lang)} onClick={hide} className="btn btn-energy h-12 px-3">
                {t.order}
              </Link>
            </div>
          </div>
        ) : null
      }
    >
      {items.length ? (
        <>
          <div className="border-b border-line px-4 py-3.5 md:px-5">
            <GiftTierBar amount={pricing.amount} hint="none" />
          </div>
          {pricing.updated ? (
            <p className="mx-4 mt-3 rounded-md bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 md:mx-5" role="status">
              {t.updated}
            </p>
          ) : null}
          <ul className="divide-y divide-line px-4 md:px-5">
            {sorted.map((item) => (
              <li key={item.id} className="py-4">
                <CartLine item={item} highlight={item.id === lastAdded} compact />
              </li>
            ))}
          </ul>
          <ChosenGiftLines amount={pricing.amount} reached={pricing.reached} issues={pricing.priced?.issues} compact className="border-t border-line px-4 md:px-5" />
          {tiers.length ? (
            <div className="border-t border-line px-4 py-3 md:px-5">
              <button
                type="button"
                aria-expanded={pickerOpen}
                aria-controls={pickerId}
                onClick={() => setPickerOpen((v) => !v)}
                className="flex min-h-11 w-full items-center gap-3 rounded-md text-left font-bold"
              >
                <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-full", unclaimed ? "bg-accent text-ink" : "bg-primary-50 text-primary")}>
                  <Gift className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 leading-snug">{unclaimed ? plural(lang, unclaimed, t.pickGiftsCount) : pickerOpen ? t.hidePicker : t.pickGifts}</span>
                <ChevronDown className={clsx("h-5 w-5 shrink-0 transition-transform", pickerOpen && "rotate-180")} aria-hidden />
              </button>
              <div id={pickerId} hidden={!pickerOpen} className="pt-3">
                {pickerOpen ? <GiftPicker amount={pricing.amount} reached={pricing.reached} issues={pricing.priced?.issues} layout="row" showTitle={false} /> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-primary-50 text-primary">
            <ShoppingBag className="h-9 w-9" aria-hidden />
          </span>
          <p className="text-lg font-bold">{t.empty}</p>
          <p className="max-w-xs text-muted">{t.emptyText}</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={hide} className="btn btn-ghost h-12 px-6">
              {t.continue}
            </button>
            <Link href={localizeHref("/produkti", lang)} onClick={hide} className="btn btn-primary h-12 px-6">
              {t.emptyCta}
            </Link>
          </div>
        </div>
      )}
    </Drawer>
  );
}
