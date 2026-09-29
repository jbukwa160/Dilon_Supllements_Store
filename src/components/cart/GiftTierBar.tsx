"use client";

import clsx from "clsx";
import { Gift, Truck } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { formatAmount, formatPrice } from "@/lib/format";
import { isFreeDelivery } from "@/lib/free-shipping";
import { useCart, useGiftTiers } from "@/lib/store";
import { useSettings } from "@/components/SettingsProvider";
import { milestones, milestoneTexts } from "./milestones";
import { Rich } from "./Rich";

// One milestone bar for the purchase-threshold gifts AND free delivery (xxlnutrition model, improved): a track from
// 0 to the highest milestone with a gift marker per tier and a truck marker at the free-delivery threshold, the
// message for the nearest milestone ("Добави още 7,60 € за подарък") and a reached state. Used in the cart drawer,
// the cart page and the checkout summary (compact also fits a header / product-page strip).
// Free delivery for offices / lockers only (Настройки → Доставка): every text says "до офис" (R2-L1); at checkout with
// address delivery chosen the truck marker is left out and a note says address delivery is charged.

// The pure logic (markers, texts) is in ./milestones, shared with the admin preview.

export function GiftTierBar({
  compact = false,
  amount,
  hint = "below",
  deliveryKind,
  className,
}: {
  compact?: boolean;
  /** Qualifying subtotal (from the priced cart); defaults to the local cart subtotal. */
  amount?: number;
  /** Where the gift picker is, for the "you unlocked a gift" line: below this bar, in the cart, or not shown. */
  hint?: "below" | "cart" | "none";
  /** The delivery chosen at checkout (unknown elsewhere): address delivery never shows an offices-only free delivery. */
  deliveryKind?: "office" | "address";
  className?: string;
}) {
  const lang = useLang();
  const t = useDict().giftTiers;
  const { subtotal } = useCart();
  const campaign = useGiftTiers();
  const { shipping } = useSettings();
  const q = amount ?? subtotal;
  const tiers = campaign?.tiers ?? [];
  const officeOnly = shipping.freeOver !== null && shipping.freeScope === "office";
  // Offices-only free delivery with address delivery chosen: no truck milestone (it would never apply).
  const addressCharged = officeOnly && deliveryKind === "address";
  const m = milestones(q, tiers, addressCharged ? null : shipping.freeOver);
  // "Free to an office — you chose an address": said once the amount would qualify at an office.
  const addressNote = addressCharged && isFreeDelivery(q, shipping) ? t.addressNotFree : null;
  if (!m.list.length) return addressNote ? <p className={clsx("text-xs font-semibold text-muted", className)}>{addressNote}</p> : null;

  const hasGifts = tiers.length > 0;
  const texts = milestoneTexts(m, t, { hasGifts, officeOnly });
  const giftsReached = m.markers.filter((x) => x.kind === "gift" && x.reached).length;
  const shippingReached = m.markers.some((x) => x.kind === "shipping" && x.reached);
  const amountNode = <strong className="font-bold text-ink">{formatPrice(m.missing, lang)}</strong>;

  const message: React.ReactNode = m.next ? <Rich text={texts.headline} values={{ amount: amountNode }} /> : texts.headline;
  const done = texts.done;
  const extra: string[] = [];
  if (!compact && !done) {
    if (shippingReached && !m.nextKinds.has("shipping")) extra.push(texts.shippingReached);
    if (giftsReached > 0 && hint !== "none") extra.push(hint === "cart" ? t.giftReachedCart : t.giftReached);
  }
  const label = (x: (typeof m.markers)[number]) =>
    x.kind === "gift"
      ? (tiers.find((tt) => tt.id === x.id)?.title ?? fmt(t.markerGift, { amount: formatAmount(x.at, lang) }))
      : fmt(texts.markerShipping, { amount: formatAmount(x.at, lang) });
  // One marker per amount (a gift tier and free delivery may share a threshold).
  const groups = new Map<number, (typeof m.markers)[number][]>();
  for (const x of m.markers) groups.set(Math.round(x.at * 100), [...(groups.get(Math.round(x.at * 100)) ?? []), x]);
  const points = [...groups.values()].map((group) => ({
    key: group.map((x) => `${x.kind}-${x.id}`).join("+"),
    left: group[0].left,
    at: group[0].at,
    reached: group[0].reached,
    gift: group.some((x) => x.kind === "gift"),
    shipping: group.some((x) => x.kind === "shipping"),
    label: group.map(label).join(" + ") + (group[0].reached ? ` — ${t.reachedMark}` : ""),
  }));

  return (
    <div role="group" aria-label={t.barLabel} className={clsx("min-w-0", className)}>
      <p className={clsx("leading-snug", compact ? "text-[0.8rem]" : "text-sm", done ? "font-bold text-success" : "text-ink-soft")} aria-live="polite">
        {message}
      </p>
      {extra.length ? <p className="mt-0.5 text-xs font-semibold text-success">{extra.join(" · ")}</p> : null}
      {addressNote ? <p className="mt-0.5 text-xs font-semibold text-muted">{addressNote}</p> : null}
      <div className={clsx("relative", compact ? "mx-2.5 mt-2.5" : "mx-4 mt-4")}>
        <div className={clsx("overflow-hidden rounded-pill bg-line", compact ? "h-1.5" : "h-2")}>
          <div
            className={clsx("h-full rounded-pill bg-accent transition-[width] duration-500 ease-out", done && "animate-pulse-once")}
            style={{ width: `${m.pct}%` }}
          />
        </div>
        <ul className="contents">
          {points.map((x) => {
            const Icon = x.gift ? Gift : Truck;
            return (
              <li
                key={x.key}
                title={x.label}
                className={clsx(
                  "absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition-colors",
                  compact ? "h-5 w-5" : "h-7 w-7",
                  x.reached ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted",
                )}
                style={{ left: `${x.left}%` }}
              >
                <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2.25} aria-hidden />
                {x.gift && x.shipping ? (
                  <Truck
                    className={clsx("absolute -bottom-1.5 -right-1.5 rounded-full bg-surface p-px text-primary", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
                    strokeWidth={2.5}
                    aria-hidden
                  />
                ) : null}
                <span className="sr-only">{x.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {!compact ? (
        <div className="relative mx-4 mt-3 h-4 text-[0.7rem] font-semibold tabular-nums text-muted" aria-hidden>
          {points.map((x) => (
            <span key={x.key} className={clsx("absolute -translate-x-1/2 whitespace-nowrap", x.reached && "text-primary-700")} style={{ left: `${x.left}%` }}>
              {formatAmount(x.at, lang)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
