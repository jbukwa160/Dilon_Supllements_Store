"use client";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useDict } from "@/i18n/client";
import type { CartSnapshot } from "@/lib/catalog-types";
import { MAX_QTY, useCart } from "@/lib/store";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { WishlistButton } from "@/components/cart/WishlistButton";

/**
 * Product page purchase row: quantity, "Добави в количката" (adds the chosen quantity and opens the cart drawer)
 * and the wishlist heart. `canBuy` = in stock, or out-of-stock orders allowed in Настройки. Remount with a `key`
 * per variant so the quantity starts at 1 again.
 */
export function BuyBox({ snapshot, canBuy, id }: { snapshot: CartSnapshot; canBuy: boolean; id?: string }) {
  const t = useDict().product;
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const max = snapshot.stock > 0 ? Math.min(snapshot.stock, MAX_QTY) : MAX_QTY;

  return (
    <div id={id} className="flex flex-wrap items-center gap-3">
      <QtyStepper value={qty} onChange={setQty} max={max} disabled={!canBuy} label={t.qty} className="shrink-0" />
      <button
        type="button"
        disabled={!canBuy}
        onClick={() => {
          add(snapshot, qty);
          setAdded(true);
          window.setTimeout(() => setAdded(false), 2500);
        }}
        className="btn btn-primary h-12 min-w-0 flex-1 px-4 text-[0.95rem] tracking-[0.02em] max-lg:order-last max-lg:basis-full max-sm:h-14 max-sm:text-base"
      >
        <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden />
        {canBuy ? (
          <>
            {/* Phones and tablets: the button gets its own full-width row under quantity + heart, so the full label
                fits. On small laptops (lg, 1024–1279 px) the buy column is narrow: the short label keeps one row. */}
            <span className="hidden truncate lg:inline xl:hidden">{t.addShort}</span>
            <span className="truncate lg:hidden xl:inline">{t.addToCart}</span>
          </>
        ) : (
          t.outOfStock
        )}
      </button>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] border-[1.5px] border-[#cfcfcf] bg-surface max-lg:ml-auto">
        <WishlistButton snapshot={snapshot} variant="icon" />
      </div>
      <p className="sr-only" aria-live="polite">
        {added ? t.added : ""}
      </p>
    </div>
  );
}
