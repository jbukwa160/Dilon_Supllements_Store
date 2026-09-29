"use client";

import { useId } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, Gift, Lock } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { GiftChoice, Issue, PublicGiftTier } from "@/lib/checkout";
import { formatAmount, formatPrice } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { useCart, useGiftTiers } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { ProductImage } from "@/components/product/ProductImage";

// The gift picker (xxlnutrition model, with visual cards instead of selects). One row per tier: radio cards with the
// picture, name, "Стойност 4,90 €" and a "Безплатно" badge; flavours / sizes of one product family share a card
// with a select. Locked tiers stay visible (greyed, lock + "Добави още X €"); a choice kept from before the cart
// dropped below its tier is shown as inactive and counts again as soon as the tier is reached.
// Phones: each row scrolls horizontally with snap; from `sm` up the cards form a grid (except in the drawer).

type Gift = PublicGiftTier["gifts"][number];
type Card = { key: string; variants: Gift[] };

/** Gifts of one tier as cards: variants of one family (same groupId) share a card, in the admin's order. */
function cardsOf(gifts: Gift[]): Card[] {
  const cards = new Map<string, Card>();
  for (const g of gifts) {
    const key = g.groupId !== null ? `g${g.groupId}` : `p${g.id}`;
    const card = cards.get(key);
    if (card) card.variants.push(g);
    else cards.set(key, { key, variants: [g] });
  }
  return [...cards.values()];
}

const toChoice = (tierId: string, g: Gift): GiftChoice => ({ tierId, id: g.id, sku: g.sku, name: g.name, variant: g.variant, image: g.image });

function GiftCard({
  card,
  tierId,
  name,
  chosen,
  locked,
  layout,
  onChoose,
}: {
  card: Card;
  tierId: string;
  name: string;
  chosen: GiftChoice | null;
  locked: boolean;
  layout: "grid" | "row";
  onChoose: (choice: GiftChoice) => void;
}) {
  const lang = useLang();
  const t = useDict().giftTiers;
  const selectId = useId();
  const selectedVariant = chosen ? card.variants.find((v) => v.id === chosen.id && chosen.tierId === tierId) : undefined;
  const selected = !!selectedVariant;
  const shown = selectedVariant ?? card.variants.find((v) => v.available) ?? card.variants[0];
  const available = card.variants.some((v) => v.available);
  const disabled = locked || !available;
  const label = shown.variant ? `${shown.name} — ${shown.variant}` : shown.name;

  return (
    <div
      className={clsx(
        "relative flex flex-col rounded-md border-[1.5px] bg-surface p-2 transition has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-primary/70",
        layout === "row" ? "w-[9.25rem] shrink-0 snap-start" : "w-[9.25rem] shrink-0 snap-start sm:w-auto",
        selected ? "border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]" : "border-line",
        !disabled && !selected && "hover:border-ink/40",
        disabled && "opacity-60",
      )}
    >
      <label className={clsx("flex flex-col gap-1.5", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
        <input
          type="radio"
          name={name}
          value={shown.id}
          checked={selected}
          disabled={disabled}
          onChange={() => onChoose(toChoice(tierId, shown))}
          className="sr-only"
          aria-label={`${label}. ${fmt(t.value, { amount: formatPrice(shown.value, lang) })}. ${available ? t.free : t.soldOut}`}
        />
        <span className="relative block aspect-square overflow-hidden rounded-sm bg-surface">
          <ProductImage src={shown.image} alt="" dim={!available} />
        </span>
        <span className="line-clamp-2 min-h-[2.5em] text-[0.8rem] font-semibold leading-tight">{shown.name}</span>
      </label>
      {card.variants.length > 1 ? (
        <>
          <label htmlFor={selectId} className="sr-only">
            {`${t.variant}: ${shown.name}`}
          </label>
          <select
            id={selectId}
            value={shown.id}
            disabled={locked}
            onChange={(e) => {
              const v = card.variants.find((x) => x.id === Number(e.target.value));
              if (v?.available && !locked) onChoose(toChoice(tierId, v));
            }}
            className="mt-1 w-full truncate rounded-sm border border-line bg-surface px-1.5 py-1 text-xs"
          >
            {card.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.available}>
                {v.available ? (v.variant ?? v.name) : fmt(t.soldOutOption, { label: v.variant ?? v.name })}
              </option>
            ))}
          </select>
        </>
      ) : shown.variant ? (
        <span className="mt-0.5 line-clamp-1 text-xs text-muted">{shown.variant}</span>
      ) : null}
      <span className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-1.5">
        <span className="text-[0.7rem] leading-tight text-muted">{fmt(t.value, { amount: formatPrice(shown.value, lang) })}</span>
        {available ? <Badge tone="success">{t.free}</Badge> : <Badge tone="muted">{t.soldOut}</Badge>}
      </span>
      {selected ? (
        <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-white shadow-[var(--shadow-lift)]" aria-hidden>
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );
}

export function GiftPicker({
  amount,
  reached,
  issues = [],
  layout = "grid",
  showTitle = true,
  className,
}: {
  /** Qualifying subtotal (for "Добави още X €"). */
  amount: number;
  /** Reached tier ids (from the priced cart, or computed from the local subtotal). */
  reached: ReadonlySet<string>;
  /** Issues of the latest pricing (a chosen gift that is out of stock / no longer offered). */
  issues?: Issue[];
  /** "grid" = cart page (grid from sm up); "row" = drawer / dialog (always one scrolling row). */
  layout?: "grid" | "row";
  showTitle?: boolean;
  className?: string;
}) {
  const lang = useLang();
  const t = useDict().giftTiers;
  const uid = useId();
  const campaign = useGiftTiers();
  const { gifts, chooseGift, removeGift } = useCart();
  if (!campaign?.tiers.length) return null;
  const { tiers, mode } = campaign;
  const cents = Math.round(amount * 100);
  const unlocked = tiers.filter((tier) => reached.has(tier.id)).length;

  // "single": each product once, under the lowest tier that offers it.
  const seen = new Set<number>();
  const rows = tiers.map((tier) => {
    const own = mode === "single" ? tier.gifts.filter((g) => !seen.has(g.id)) : tier.gifts;
    own.forEach((g) => seen.add(g.id));
    return { tier, cards: cardsOf(own) };
  });
  const single = mode === "single" ? (gifts[0] ?? null) : null;

  return (
    <div className={clsx("space-y-5", className)}>
      {showTitle ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold">{mode === "single" ? t.pickerTitleSingle : t.pickerTitle}</h2>
          <span className="text-sm font-semibold text-muted">{fmt(t.unlockedCount, { n: unlocked, total: tiers.length })}</span>
          {mode === "single" ? <p className="w-full text-sm text-muted">{t.singleHint}</p> : null}
        </div>
      ) : null}
      {rows.map(({ tier, cards }) => {
        if (!cards.length) return null;
        const isReached = reached.has(tier.id);
        const chosen = mode === "single" ? (single && single.tierId === tier.id ? single : null) : (gifts.find((g) => g.tierId === tier.id) ?? null);
        const kept = !!chosen && !isReached;
        const missing = Math.max(0, Math.round(tier.threshold * 100) - cents) / 100;
        const issue = chosen
          ? issues.find(
              (i) => (i.code === "gift_out_of_stock" || i.code === "gift_not_in_tier") && i.tierId === tier.id && i.id === chosen.id,
            )
          : undefined;
        const titleId = `${uid}-${tier.id}-title`;
        return (
          <fieldset key={tier.id} aria-labelledby={titleId} className="min-w-0">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-full", isReached ? "bg-accent text-ink" : "bg-line text-muted")} aria-hidden>
                  {isReached ? <Gift className="h-4.5 w-4.5" /> : <Lock className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <h3 id={titleId} className="font-bold leading-tight">
                    {tier.title}
                  </h3>
                  {tier.note ? <p className="text-sm leading-snug text-muted">{tier.note}</p> : null}
                </div>
              </div>
              {kept ? (
                <span className="rounded-pill bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">{fmt(t.inactive, { amount: formatAmount(missing, lang) })}</span>
              ) : !isReached ? (
                <span className="inline-flex items-center gap-1 rounded-pill bg-canvas px-2.5 py-1 text-xs font-semibold text-muted">
                  <Lock className="h-3 w-3" aria-hidden /> {fmt(t.lockedLeft, { amount: formatAmount(missing, lang) })}
                </span>
              ) : chosen ? (
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-pill bg-primary-50 px-2.5 py-1 text-xs font-bold text-success">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> {t.chosen}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeGift(tier.id)}
                    className="min-h-8 rounded-pill px-2 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    {t.removeChoice}
                  </button>
                </span>
              ) : single && reached.has(single.tierId) ? null : (
                // "single": one gift in total — no call to action on other tiers once it is chosen.
                <span className="rounded-pill bg-accent px-2.5 py-1 text-xs font-bold text-ink">{t.chooseOne}</span>
              )}
            </div>
            {issue ? (
              <p className="mb-2 text-sm font-semibold text-sale" role="alert">
                {issue.code === "gift_out_of_stock" ? t.outOfStock : t.notInPromo}
              </p>
            ) : null}
            <div
              className={clsx(
                "flex gap-2.5 overflow-x-auto overscroll-x-contain pb-1.5 [scroll-snap-type:x_mandatory] [scrollbar-width:thin]",
                layout === "grid" && "sm:grid sm:grid-cols-3 sm:overflow-visible md:grid-cols-4 xl:grid-cols-5",
              )}
            >
              {cards.map((card) => (
                <GiftCard
                  key={card.key}
                  card={card}
                  tierId={tier.id}
                  name={mode === "single" ? `${uid}-single` : `${uid}-${tier.id}`}
                  chosen={chosen}
                  locked={!isReached}
                  layout={layout}
                  onChoose={(c) => chooseGift(c, mode)}
                />
              ))}
            </div>
          </fieldset>
        );
      })}
      <p className="text-xs text-muted">
        <Link href={localizeHref("/obshti-usloviya#podaratsi", lang)} className="underline underline-offset-2 hover:text-ink">
          {t.terms}
        </Link>
      </p>
    </div>
  );
}
