"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useLang } from "@/i18n/client";
import type { CartSnapshot } from "@/lib/catalog-types";
import type { DeliveryKey, GiftChoice, PaymentKey, PricedCart } from "@/lib/checkout";
import { activeGifts, cartCents, useCart, useGiftTiers, type CartItem } from "@/lib/store";

// Live pricing of the browser's cart through POST /api/cart/price (the server's priceCart): fresh prices and stock,
// reached gift tiers, valid gift lines, free delivery and — at checkout — the shipping quote. The response also
// refreshes the stored cart (prices, names in the current language, stock clamps, removed products).
// Requests are debounced and keyed by everything they depend on, so a stale answer is never shown as current.

export type CartDelivery = { method: DeliveryKey; officeId?: string; cityId?: string };

export type CartPricing = {
  /** The answer for the cart as it is now; null while it loads (or if pricing failed). */
  priced: PricedCart | null;
  /** The latest answer for any earlier state of the cart (to show while the next one loads). */
  last: PricedCart | null;
  loading: boolean;
  failed: boolean;
  /** Reached tiers: the server's answer when current, else computed from the local subtotal. */
  reached: ReadonlySet<string>;
  /** Qualifying amount the bar and the picker should use (server when current, else local). */
  amount: number;
  /** Gift choices that were sent with this request (reached tiers only). */
  sentGifts: GiftChoice[];
  /** The server changed prices or removed products since the page opened (show "Количката е обновена"). */
  updated: boolean;
};

const DEBOUNCE_MS = 250;

/** Did the fresh data change something the shopper should be told about (price, removal, lower stock)? */
function noticeable(items: CartItem[], fresh: Map<number, CartSnapshot>): boolean {
  return items.some((i) => {
    const p = fresh.get(i.id);
    return !p || p.price !== i.price || (p.stock > 0 && p.stock < i.qty);
  });
}

function differs(items: CartItem[], fresh: Map<number, CartSnapshot>): boolean {
  return items.some((i) => {
    const p = fresh.get(i.id);
    if (!p) return true;
    return (
      p.price !== i.price ||
      p.oldPrice !== i.oldPrice ||
      p.stock !== i.stock ||
      p.name !== i.name ||
      p.variant !== i.variant ||
      p.image !== i.image ||
      p.slug !== i.slug ||
      p.adultOnly !== i.adultOnly ||
      p.hidden !== i.hidden
    );
  });
}

export function useCartPricing({
  enabled = true,
  delivery = null,
  payment,
}: { enabled?: boolean; delivery?: CartDelivery | null; payment?: PaymentKey } = {}): CartPricing {
  const lang = useLang();
  const { items, gifts, refresh } = useCart();
  const campaign = useGiftTiers();
  const [result, setResult] = useState<{ key: string; data: PricedCart } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  const localCents = cartCents(items);
  const mode = campaign?.mode ?? "perTier";
  const localReached = useMemo(
    () => new Set((campaign?.tiers ?? []).filter((t) => localCents >= Math.round(t.threshold * 100)).map((t) => t.id)),
    [campaign, localCents],
  );
  const sentGifts = useMemo(() => activeGifts(gifts, localReached, mode), [gifts, localReached, mode]);

  const body = useMemo(
    () =>
      JSON.stringify({
        items: items.map((i) => ({ id: i.id, qty: i.qty })),
        gifts: sentGifts.map((g) => ({ tierId: g.tierId, id: g.id })),
        delivery: delivery ?? undefined,
        payment,
        lang,
      }),
    [items, sentGifts, delivery, payment, lang],
  );
  const key = enabled && items.length ? body : "";

  const onResult = useEffectEvent((data: PricedCart, forKey: string) => {
    setResult({ key: forKey, data });
    const fresh = new Map(data.snapshots.map((p) => [p.id, p]));
    if (differs(items, fresh)) {
      if (noticeable(items, fresh)) setUpdated(true);
      refresh(data.snapshots);
    }
  });

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/cart/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<PricedCart>) : Promise.reject(new Error(String(r.status)))))
        .then((data) => onResult(data, key))
        .catch((e: unknown) => {
          if ((e as Error)?.name !== "AbortError") setFailedKey(key);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]);

  const current = result && result.key === key ? result.data : null;
  const reached = useMemo(() => (current ? new Set(current.tiers.reached) : localReached), [current, localReached]);
  return {
    priced: current,
    last: result?.data ?? null,
    loading: !!key && !current && failedKey !== key,
    failed: !!key && failedKey === key,
    reached,
    amount: current ? current.qualifying : localCents / 100,
    sentGifts,
    updated,
  };
}
