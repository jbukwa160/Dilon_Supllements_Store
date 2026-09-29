"use client";

import Link from "next/link";
import clsx from "clsx";
import { Heart } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { CartSnapshot } from "@/lib/catalog-types";
import { localizeHref } from "@/lib/links";
import { useWishlist } from "@/lib/store";

/** Heart toggle on cards ("icon") and the product page ("full"). The list lives in this browser (no account needed). */
export function WishlistButton({ snapshot, variant = "icon", className }: { snapshot: CartSnapshot; variant?: "icon" | "full"; className?: string }) {
  const t = useDict().wishlist;
  const { has, toggle } = useWishlist();
  const on = has(snapshot.id);
  return (
    <button
      type="button"
      onClick={() => toggle(snapshot)}
      aria-pressed={on}
      aria-label={variant === "icon" ? `${t.add}: ${snapshot.name}` : undefined}
      title={variant === "icon" ? (on ? t.remove : t.add) : undefined}
      className={clsx(
        variant === "icon"
          ? "grid h-10 w-10 place-items-center rounded-full bg-surface/80 transition hover:scale-110"
          : "btn btn-ghost h-12 px-5",
        className,
      )}
    >
      <Heart className={clsx("h-5 w-5 transition", on ? "fill-primary text-primary" : "text-ink")} strokeWidth={2} aria-hidden />
      {variant === "full" ? <span>{on ? t.saved : t.add}</span> : null}
    </button>
  );
}

/** Header heart with the number of saved products; links to /lyubimi. */
export function WishlistHeaderButton() {
  const lang = useLang();
  const t = useDict().wishlist;
  const { count } = useWishlist();
  return (
    <Link
      href={localizeHref("/lyubimi", lang)}
      className="relative grid h-11 w-11 place-items-center rounded-pill transition hover:bg-canvas"
      aria-label={count ? fmt(t.headerLabelCount, { n: count }) : t.headerLabel}
    >
      <Heart className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      {count ? (
        <span className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-pill bg-ink px-1 text-[0.7rem] font-bold tabular-nums text-white" aria-hidden>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
