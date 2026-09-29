// One product in a listing / shelf. No server-only code and no hooks: it is rendered by Server Components (listings,
// shelves) and inside client components (cart drawer suggestions, admin previews), so the language comes as a prop.
// The cart / wishlist buttons are D's client components.
import Link from "next/link";
import clsx from "clsx";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { CartSnapshot, ProductCard as Card } from "@/lib/catalog-types";
import { discountPercent, formatNumber, formatPrice, plural, pricePerUnit } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { ShoppingBasket } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { AddToCart } from "@/components/cart/AddToCart";
import { WishlistButton } from "@/components/cart/WishlistButton";
import { ProductImage } from "./ProductImage";

/**
 * Cart / wishlist data of a card. For a family card with an "от" price the price is the family's lowest one;
 * the cart re-reads fresh snapshots from the server anyway (api/products, priceCart).
 */
export function cardSnapshot(p: Card): CartSnapshot {
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    groupId: p.groupId,
    name: p.name,
    variant: p.variantLabel,
    brand: p.brand,
    brandSlug: p.brandSlug,
    image: p.image,
    price: p.price,
    oldPrice: p.oldPrice,
    stock: p.stock,
    hidden: false,
    weightKg: null,
    adultOnly: !!p.adultOnly,
  };
}

/** "908 г", "2,27 кг", "500 мл", "1 л" (net quantity of a standalone product). */
export function formatSize(value: number | null | undefined, unit: "g" | "ml" | null | undefined, lang: Lang): string | null {
  if (!value || !(value > 0) || !unit) return null;
  const big = value >= 1000;
  const n = formatNumber(big ? value / 1000 : value, lang);
  const u = unit === "g" ? (big ? (lang === "bg" ? "кг" : "kg") : lang === "bg" ? "г" : "g") : big ? (lang === "bg" ? "л" : "l") : lang === "bg" ? "мл" : "ml";
  return `${n} ${u}`;
}

export function ProductCard({ product: p, lang, eager = false }: { product: Card; lang: Lang; eager?: boolean }) {
  const dict = getDict(lang);
  const t = dict.product;
  const href = localizeHref(`/produkt/${p.slug}`, lang);
  // An "от" price is the family's lowest price and its reference price may belong to another variant, so a
  // struck price / "-X%" computed from the two would misstate the reduction (Omnibus). Such cards only say "Промо"
  // (some variant is on sale); the product page shows the exact reference price of each variant.
  const off = p.priceFrom ? null : discountPercent(p.price, p.oldPrice);
  const familySale = p.priceFrom && p.oldPrice != null;
  const available = p.inStockAny;
  const single = p.variantCount <= 1;

  // Badge stack (reference-ux §4.2): at most two, in priority order; "Изчерпан" always wins a place.
  const badges: { key: string; tone: BadgeTone; label: string; sr?: string }[] = [];
  if (!available) badges.push({ key: "oos", tone: "muted", label: t.outOfStock });
  if (off) badges.push({ key: "off", tone: "sale", label: `−${off}%`, sr: fmt(t.card.discount, { n: off }) });
  else if (familySale && !p.promoLabel) badges.push({ key: "sale", tone: "sale", label: t.card.sale });
  if (p.promoLabel) badges.push({ key: "promo", tone: "deal", label: p.promoLabel });
  if (p.isNew) badges.push({ key: "new", tone: "new", label: t.card.new });
  if (p.isBestseller) badges.push({ key: "best", tone: "bestseller", label: t.card.bestseller });

  const meta =
    p.flavourCount > 1
      ? plural(lang, p.flavourCount, dict.listing.flavours)
      : p.variantCount > 1
        ? plural(lang, p.variantCount, dict.listing.sizes)
        : p.variantLabel || formatSize(p.sizeValue, p.sizeUnit, lang);
  const unit = p.priceFrom ? null : pricePerUnit(p.price, p.sizeValue, p.sizeUnit, lang);
  const now = formatPrice(p.price, lang);
  const snapshot = cardSnapshot(p);

  // GymBeam-style card: a bordered white image tile (badges top-left, heart top-right, round black cart button
  // bottom-left), then brand, name, the price in orange and the unit price — no box around the text.
  return (
    <article className="group relative flex h-full flex-col">
      <div className="relative rounded-[var(--radius-lg)] border border-line bg-surface transition duration-200 group-hover:border-[#c8c8c8] group-hover:shadow-lift">
        <Link href={href} tabIndex={-1} aria-hidden className="block aspect-square overflow-hidden rounded-[var(--radius-lg)] p-[10%]">
          <ProductImage src={p.image} alt="" eager={eager} dim={!available} className="transition duration-300 group-hover:scale-[1.04]" />
        </Link>
        {badges.length ? (
          <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1 sm:left-3 sm:top-3">
            {badges.slice(0, 2).map((b) => (
              <Badge key={b.key} tone={b.tone} className="max-w-full truncate">
                <span aria-hidden={b.sr ? true : undefined}>{b.label}</span>
                {b.sr ? <span className="sr-only">{b.sr}</span> : null}
              </Badge>
            ))}
          </div>
        ) : null}
        {p.adultOnly ? (
          <span
            title={t.adultOnlyHint}
            className="absolute bottom-2.5 right-2 rounded-[var(--radius-sm)] border border-ink/25 bg-surface px-1.5 py-px text-[0.68rem] font-bold tabular-nums text-ink sm:right-3"
          >
            {t.adultOnly}
            <span className="sr-only"> — {t.adultOnlyHint}</span>
          </span>
        ) : null}
        <div className="absolute right-1 top-1 z-10 sm:right-1.5 sm:top-1.5">
          <WishlistButton snapshot={snapshot} variant="icon" />
        </div>
        <div className="absolute bottom-2 left-2 z-10 sm:bottom-2.5 sm:left-2.5">
          {single && p.stock > 0 ? (
            <AddToCart snapshot={snapshot} variant="icon" />
          ) : (
            <Link
              href={href}
              aria-label={single ? `${t.card.choose}: ${p.name}` : fmt(t.card.chooseLabel, { name: p.name })}
              title={t.card.choose}
              className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white transition hover:bg-primary"
            >
              <ShoppingBasket className="h-5 w-5" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 px-0.5 pt-3">
        {p.brand ? (
          p.brandSlug ? (
            <Link
              href={localizeHref(`/marka/${p.brandSlug}`, lang)}
              // py/-my: a ≈ 29 px tall tap target without moving the text (the 11 px line alone is only 17 px).
              className="relative z-10 -my-1.5 w-fit max-w-full truncate py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.06em] text-muted hover:text-primary"
            >
              {p.brand}
            </Link>
          ) : (
            <p className="truncate text-[0.7rem] font-bold uppercase tracking-[0.06em] text-muted">{p.brand}</p>
          )
        ) : null}
        <h3 className="line-clamp-2 min-h-[2.7em] text-[0.9rem] font-bold leading-snug sm:text-[0.95rem]">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-[var(--radius-lg)] after:content-[''] hover:underline">
            {p.name}
          </Link>
        </h3>
        {meta ? <p className="truncate text-[0.8rem] text-muted">{meta}</p> : null}

        <div className="mt-auto pt-1.5 tabular-nums">
          <p className="flex flex-wrap items-baseline gap-x-2 leading-tight">
            <span className={clsx("whitespace-nowrap text-[1.1rem] font-extrabold sm:text-[1.2rem]", off ? "text-sale" : "text-primary")}>
              {p.priceFrom ? fmt(dict.listing.priceFrom, { price: now }) : now}
            </span>
            {off && p.oldPrice ? (
              <span className="text-[0.8rem] text-muted">
                <s aria-hidden>{formatPrice(p.oldPrice, lang)}</s>
                <span className="sr-only">{fmt(dict.common.price.was, { price: formatPrice(p.oldPrice, lang) })}</span>
              </span>
            ) : null}
          </p>
          {unit ? <p className="mt-1 text-[0.72rem] leading-snug text-muted">{unit}</p> : null}
          {off && p.lowest30 != null ? (
            <p className="mt-1 text-[0.68rem] leading-snug text-muted">{fmt(t.lowest30, { price: formatPrice(p.lowest30, lang) })}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
