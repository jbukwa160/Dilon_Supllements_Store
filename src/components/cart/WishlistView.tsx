"use client";

import { useEffect, useEffectEvent } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { CartSnapshot } from "@/lib/catalog-types";
import { localizeHref } from "@/lib/links";
import { useCartReady, useWishlist } from "@/lib/store";
import { Price } from "@/components/ui/Price";
import { Spinner } from "@/components/ui/Spinner";
import { ProductImage } from "@/components/product/ProductImage";
import { AddToCart } from "./AddToCart";

/** Body of /lyubimi: the saved products (fresh prices / stock from /api/products) with add-to-cart and remove. */
export function WishlistView() {
  const lang = useLang();
  const dict = useDict();
  const t = dict.wishlist;
  const ready = useCartReady();
  const { items, refresh, remove } = useWishlist();
  const ids = items.map((i) => i.id).join(",");

  const apply = useEffectEvent((fresh: CartSnapshot[]) => refresh(fresh));
  useEffect(() => {
    if (!ids) return;
    const ctrl = new AbortController();
    fetch(`/api/products?ids=${ids}&lang=${lang}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<CartSnapshot[]>) : Promise.reject(new Error(String(r.status)))))
      .then((fresh) => {
        if (Array.isArray(fresh)) apply(fresh);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // Refresh once per page view and language (not after every change the refresh itself makes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, ready]);

  if (!ready) {
    return (
      <div className="card flex min-h-60 items-center justify-center gap-3 p-8 text-muted">
        <Spinner /> {dict.cart.loading}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center md:py-20">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-sale/10 text-sale">
          <Heart className="h-9 w-9" aria-hidden />
        </span>
        <p className="text-xl font-bold">{t.empty}</p>
        <p className="max-w-sm text-muted">{t.emptyText}</p>
        <Link href={localizeHref("/produkti", lang)} className="btn btn-primary h-12 px-8">
          {t.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => {
        const href = localizeHref(`/produkt/${p.slug}`, lang);
        return (
          <li key={p.id} className="card relative flex flex-col overflow-hidden p-3 md:p-4">
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="absolute right-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-pill bg-surface/90 text-muted shadow-card transition hover:text-sale"
              aria-label={fmt(t.removeNamed, { name: p.name })}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <Link href={href} tabIndex={-1} aria-hidden className="block aspect-square overflow-hidden rounded-md bg-surface">
              <ProductImage src={p.image} alt="" dim={p.hidden || p.stock <= 0} />
            </Link>
            {p.brand ? <span className="mt-3 text-[0.7rem] font-bold uppercase tracking-[0.06em] text-muted">{p.brand}</span> : <span className="mt-3" />}
            <Link href={href} className="line-clamp-2 font-semibold leading-snug hover:text-primary">
              {p.name}
            </Link>
            {p.variant ? <span className="text-sm text-muted">{p.variant}</span> : null}
            <div className="mt-auto flex items-end justify-between gap-2 pt-3">
              {p.hidden ? <span className="text-sm font-semibold text-muted">{t.unavailable}</span> : <Price price={p.price} oldPrice={p.oldPrice} size="sm" />}
              <AddToCart snapshot={p} variant="icon" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
