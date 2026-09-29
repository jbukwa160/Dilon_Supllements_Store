"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ShoppingBag } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict } from "@/i18n/client";
import type { CartSnapshot } from "@/lib/catalog-types";
import { useCart } from "@/lib/store";

/**
 * Phones and tablets: a bar fixed to the bottom of the screen with the price and "Добави" once the main buy box
 * (element `targetId`) has scrolled out of view above. Respects the iPhone home-indicator inset.
 */
export function StickyBuyBar({
  snapshot,
  canBuy,
  targetId,
  price,
  oldPrice,
  sale,
}: {
  snapshot: CartSnapshot;
  canBuy: boolean;
  targetId: string;
  /** Formatted prices. */
  price: string;
  oldPrice?: string | null;
  sale?: boolean;
}) {
  const t = useDict().product;
  const { add } = useCart();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    // The root reaches far below the screen and starts under the sticky header, so the buy box only stops
    // "intersecting" once it has scrolled up behind the header (a fast fling from below the fold straight past it
    // still flips the state, which a plain viewport observer would miss).
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { rootMargin: "-120px 0px 100000px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  // Lift the chat bubble above the bar while it is shown (ChatWidget reads --chat-offset); phones and tablets only.
  useEffect(() => {
    if (!show || window.matchMedia("(min-width: 1024px)").matches) return;
    const root = document.documentElement;
    root.style.setProperty("--chat-offset", "4.75rem");
    return () => {
      root.style.removeProperty("--chat-offset");
    };
  }, [show]);

  return (
    <div
      inert={!show}
      aria-hidden={!show}
      className={clsx(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 shadow-overlay backdrop-blur transition-transform duration-200 ease-out lg:hidden",
        show ? "translate-y-0" : "translate-y-[110%]",
      )}
    >
      <div className="container-shop flex items-center gap-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.85rem] font-semibold">{[snapshot.name, snapshot.variant].filter(Boolean).join(" · ")}</p>
          <p className="flex items-baseline gap-2 tabular-nums">
            <span className={clsx("text-lg font-extrabold", sale ? "text-sale" : "text-primary")}>{price}</span>
            {oldPrice ? <s className="text-sm text-muted">{oldPrice}</s> : null}
          </p>
        </div>
        <button
          type="button"
          disabled={!canBuy}
          onClick={() => add(snapshot, 1)}
          aria-label={fmt(t.sticky, { name: snapshot.name })}
          className="btn btn-primary h-12 shrink-0 px-5"
        >
          <ShoppingBag className="h-5 w-5" aria-hidden />
          {canBuy ? t.addShort : t.outOfStock}
        </button>
      </div>
    </div>
  );
}
