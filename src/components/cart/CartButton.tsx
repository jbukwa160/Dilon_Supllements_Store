"use client";

import { ShoppingBag } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict } from "@/i18n/client";
import { useCart, useCartDrawer } from "@/lib/store";

/** Header cart icon with the number of items; opens the cart drawer and announces added products to screen readers. */
export function CartButton() {
  const t = useDict().cart;
  const { items, count } = useCart();
  const { show, lastAdded } = useCartDrawer();
  const added = lastAdded !== null ? items.find((i) => i.id === lastAdded) : undefined;
  return (
    <>
      <button
        type="button"
        onClick={show}
        className="relative grid h-11 w-11 place-items-center rounded-pill transition hover:bg-canvas"
        aria-label={count ? fmt(t.titleCount, { n: count }) : t.title}
        aria-haspopup="dialog"
      >
        <ShoppingBag className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        {count ? (
          <span
            key={count}
            className="absolute right-0.5 top-0.5 grid h-5 min-w-5 animate-pulse-once place-items-center rounded-pill bg-primary px-1 text-[0.7rem] font-bold tabular-nums text-white"
            aria-hidden
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {added ? fmt(t.itemAdded, { name: added.name }) : ""}
      </span>
    </>
  );
}
