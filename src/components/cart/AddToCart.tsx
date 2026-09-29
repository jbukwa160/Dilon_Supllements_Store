"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Check, ShoppingBag, ShoppingBasket } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict } from "@/i18n/client";
import type { CartSnapshot } from "@/lib/catalog-types";
import { MAX_QTY, useCart } from "@/lib/store";
import { useSettings } from "@/components/SettingsProvider";

/**
 * "Добави в количката": a full-width button (product page) or a round icon button (cards). Adds the CartSnapshot
 * (merging with the same variant, clamped to the stock) and opens the cart drawer. Disabled for hidden / sold-out
 * products (unless out-of-stock orders are allowed) and once the cart already holds all the available stock.
 */
export function AddToCart({
  snapshot,
  variant = "full",
  disabled = false,
  qty = 1,
  className,
}: {
  snapshot: CartSnapshot;
  variant?: "full" | "icon";
  disabled?: boolean;
  /** How many to add (the product page's quantity stepper). */
  qty?: number;
  className?: string;
}) {
  const t = useDict().cart;
  const { allowOutOfStockOrders } = useSettings();
  const { items, add } = useCart();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inCart = items.find((i) => i.id === snapshot.id)?.qty ?? 0;
  const soldOut = snapshot.hidden || (snapshot.stock <= 0 && !allowOutOfStockOrders);
  const cap = snapshot.stock > 0 ? Math.min(snapshot.stock, MAX_QTY) : MAX_QTY;
  const full = !soldOut && inCart >= cap;
  const off = disabled || soldOut || full;
  const label = snapshot.hidden ? t.unavailable : soldOut ? t.soldOut : full ? t.maxInCart : done ? t.added : t.add;

  const onClick = () => {
    add(snapshot, qty);
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1400);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={off}
        className={clsx(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full transition",
          off ? "cursor-not-allowed bg-line text-muted" : done ? "bg-success text-white" : "bg-ink text-white hover:bg-primary active:translate-y-px",
          className,
        )}
        aria-label={off ? `${snapshot.name}: ${label}` : fmt(t.addNamed, { name: snapshot.variant ? `${snapshot.name} (${snapshot.variant})` : snapshot.name })}
      >
        {done ? <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden /> : <ShoppingBasket className="h-5 w-5" aria-hidden />}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={off} className={clsx("btn h-12 w-full text-base", done ? "bg-success text-white" : "btn-primary", className)}>
      {done ? <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden /> : <ShoppingBag className="h-5 w-5" aria-hidden />}
      {label}
    </button>
  );
}
