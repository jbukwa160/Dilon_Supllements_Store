"use client";

import Link from "next/link";
import clsx from "clsx";
import { Trash2, X } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { GiftChoice, Issue } from "@/lib/checkout";
import { formatAmount, formatPrice } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { useCart, useGiftTiers, type CartItem } from "@/lib/store";
import { useSettings } from "@/components/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { ProductImage } from "@/components/product/ProductImage";

/** One paid line of the cart (drawer: compact): picture, brand, name, variant, qty stepper, line price, remove. */
export function CartLine({ item, highlight = false, compact = false }: { item: CartItem; highlight?: boolean; compact?: boolean }) {
  const lang = useLang();
  const dict = useDict();
  const t = dict.cart;
  const { allowOutOfStockOrders } = useSettings();
  const { setQty, remove } = useCart();
  const href = localizeHref(`/produkt/${item.slug}`, lang);
  const soldOut = item.stock <= 0 && !allowOutOfStockOrders;
  const max = item.stock > 0 ? Math.min(item.stock, 99) : 99;
  const total = (Math.round(item.price * 100) * item.qty) / 100;
  const oldTotal = item.oldPrice && item.oldPrice > item.price ? (Math.round(item.oldPrice * 100) * item.qty) / 100 : null;

  return (
    <div className={clsx("flex gap-3 md:gap-4", highlight && "-m-2 rounded-md bg-primary-50/70 p-2")}>
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className={clsx("shrink-0 overflow-hidden rounded-md border border-line bg-surface p-1", compact ? "h-20 w-20" : "h-24 w-24 md:h-28 md:w-28")}
      >
        <ProductImage src={item.image} alt="" dim={soldOut} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        {item.brand ? <span className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-muted">{item.brand}</span> : null}
        <Link href={href} className={clsx("line-clamp-2 font-semibold leading-snug hover:text-primary", compact && "text-[0.95rem]")}>
          {item.name}
        </Link>
        {item.variant ? <span className="text-sm text-muted">{item.variant}</span> : null}
        {soldOut ? (
          <span className="mt-1 text-sm font-semibold text-sale">{t.outOfStock}</span>
        ) : item.stock > 0 && item.stock <= 5 && item.qty >= item.stock ? (
          <span className="mt-1 text-xs font-semibold text-warning">{fmt(t.onlyLeft, { n: item.stock })}</span>
        ) : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-2">
          <div className="flex items-center gap-1">
            <QtyStepper value={item.qty} onChange={(q) => setQty(item.id, q)} max={max} size="sm" disabled={soldOut} label={fmt(t.qtyLabel, { name: item.name })} />
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="grid h-10 w-10 place-items-center rounded-pill text-muted transition hover:bg-sale/10 hover:text-sale"
              aria-label={fmt(t.remove, { name: item.name })}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="text-right tabular-nums">
            <div className="flex items-baseline justify-end gap-2">
              {oldTotal ? <s className="text-xs text-muted">{formatPrice(oldTotal, lang)}</s> : null}
              <span className={clsx("font-bold", oldTotal && "text-sale")}>{formatPrice(total, lang)}</span>
            </div>
            {item.qty > 1 ? <div className="text-xs text-muted">{fmt(t.perUnit, { price: formatPrice(item.price, lang) })}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The chosen gifts as cart lines: "Подарък" badge, 0,00 €, remove. A choice whose tier is not reached any more is
 * shown dimmed as inactive ("Неактивен — добави още X €"); one the server flagged (out of stock / no longer offered)
 * says so.
 */
export function ChosenGiftLines({
  amount,
  reached,
  issues = [],
  compact = false,
  className,
}: {
  amount: number;
  reached: ReadonlySet<string>;
  issues?: Issue[];
  compact?: boolean;
  className?: string;
}) {
  const lang = useLang();
  const t = useDict().giftTiers;
  const campaign = useGiftTiers();
  const { gifts, removeGift } = useCart();
  if (!campaign || !gifts.length) return null;
  const tiers = campaign.tiers;
  const cents = Math.round(amount * 100);
  // "single": only one choice counts (older extra choices, e.g. after the admin switched modes, are not shown).
  const rows = (campaign.mode === "single" ? gifts.slice(0, 1) : gifts)
    .map((g) => ({ g, tier: tiers.find((x) => x.id === g.tierId) }))
    .filter((r): r is { g: GiftChoice; tier: (typeof tiers)[number] } => !!r.tier)
    .sort((a, b) => a.tier.threshold - b.tier.threshold);
  if (!rows.length) return null;

  return (
    <ul className={clsx("divide-y divide-line", className)}>
      {rows.map(({ g, tier }) => {
        const active = reached.has(tier.id);
        const missing = Math.max(0, Math.round(tier.threshold * 100) - cents) / 100;
        const issue = issues.find((i) => (i.code === "gift_out_of_stock" || i.code === "gift_not_in_tier") && i.tierId === g.tierId && i.id === g.id);
        return (
          <li key={g.tierId} className={clsx("flex items-center gap-3 py-3", !active && "opacity-70")}>
            <span className={clsx("shrink-0 overflow-hidden rounded-md border border-line bg-surface p-1", compact ? "h-14 w-14" : "h-16 w-16")}>
              <ProductImage src={g.image} alt="" dim={!active} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone="new">{t.gift}</Badge>
                <span className="text-xs font-semibold text-muted">{fmt(t.locked, { amount: formatAmount(tier.threshold, lang) })}</span>
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm font-semibold leading-snug">{g.name}</span>
              {g.variant ? <span className="block text-xs text-muted">{g.variant}</span> : null}
              {issue ? (
                <span className="mt-0.5 block text-xs font-semibold text-sale">{issue.code === "gift_out_of_stock" ? t.outOfStock : t.notInPromo}</span>
              ) : !active ? (
                <span className="mt-0.5 block text-xs font-semibold text-warning">{fmt(t.inactive, { amount: formatAmount(missing, lang) })}</span>
              ) : null}
            </span>
            <span className={clsx("shrink-0 text-right text-sm font-bold tabular-nums", active ? "text-success" : "text-muted line-through")}>{formatPrice(0, lang)}</span>
            <button
              type="button"
              onClick={() => removeGift(g.tierId)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-pill text-muted transition hover:bg-sale/10 hover:text-sale"
              aria-label={fmt(t.removeGift, { name: g.name })}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
