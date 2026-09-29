"use client";

import clsx from "clsx";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { discountPercent, formatPrice } from "@/lib/format";

const SIZES = {
  sm: { price: "text-base", old: "text-xs", meta: "text-[0.7rem]" },
  md: { price: "text-lg", old: "text-sm", meta: "text-xs" },
  lg: { price: "text-[1.75rem] md:text-[2rem]", old: "text-base", meta: "text-sm" },
} as const;

/**
 * A product price: the current price (sale red when discounted), the struck reference price with a "-X%" badge, the
 * Omnibus line "Най-ниска цена за последните 30 дни: X" (when `lowest30` is given and a reference price is shown)
 * and the unit price. Sizes: sm = compact cards / cart lines, md = product cards, lg = product page.
 *
 * `oldPrice` must already follow the Omnibus rule (the catalogue materializes old_price = lowest30), so the badge
 * computed from it is lawful. `from` renders "от 24,90 €" for families whose variants cost differently.
 */
export function Price({
  price,
  oldPrice,
  lowest30,
  unitPrice,
  size = "md",
  from = false,
  className,
}: {
  price: number;
  oldPrice: number | null;
  lowest30?: number | null;
  /** Ready-made unit price text ("49,80 € / кг", lib/format pricePerUnit). */
  unitPrice?: string | null;
  size?: keyof typeof SIZES;
  from?: boolean;
  className?: string;
}) {
  const lang = useLang();
  const t = useDict().common.price;
  const s = SIZES[size];
  const off = discountPercent(price, oldPrice);
  const now = formatPrice(price, lang);

  return (
    <div className={clsx("tabular-nums", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={clsx("font-extrabold leading-tight", s.price, off ? "text-sale" : "text-primary")}>{from ? fmt(t.from, { price: now }) : now}</span>
        {off && oldPrice ? (
          <>
            <s className={clsx("font-medium text-muted", s.old)} aria-hidden>
              {formatPrice(oldPrice, lang)}
            </s>
            <span className="sr-only">{fmt(t.was, { price: formatPrice(oldPrice, lang) })}</span>
            <span className="inline-flex items-center rounded-[var(--radius-sm)] bg-sale px-1.5 py-0.5 text-[0.72rem] font-extrabold leading-tight text-white" aria-hidden>
              -{off}%
            </span>
            <span className="sr-only">{fmt(t.discount, { n: off })}</span>
          </>
        ) : null}
      </div>
      {off && lowest30 != null ? <p className={clsx("mt-1 leading-snug text-muted", s.meta)}>{fmt(t.lowest30, { price: formatPrice(lowest30, lang) })}</p> : null}
      {unitPrice ? <p className={clsx("mt-0.5 leading-snug text-muted", s.meta)}>{unitPrice}</p> : null}
    </div>
  );
}
