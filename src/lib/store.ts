"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useLang } from "@/i18n/client";
import type { Lang } from "@/i18n/config";
import type { CartSnapshot } from "./catalog-types";
import { cartSignature, type GiftChoice, type GiftTiersPayload } from "./checkout";

// Tiny localStorage-backed stores for the cart (with the chosen threshold gifts), the wishlist, the cart drawer and
// the active gift tiers. They live only in the browser; prices, stock and gifts are always re-checked on the server
// (priceCart) when the cart is priced and when an order is placed. Owner: D (ported from /web).
//
// SSR-safe: the server snapshot is a constant empty value, the stored cart appears right after hydration
// (useCartReady() tells the two apart). Cart, wishlist and chosen gifts are strictly necessary storage (no cookie
// consent needed). Other tabs follow changes through the "storage" event.

export type CartItem = CartSnapshot & { qty: number };
type CartState = {
  v: 2;
  items: CartItem[];
  /** Chosen gifts, kept when the cart drops below their tier (greyed out, not sent) and restored when it goes back up. */
  gifts: GiftChoice[];
  /**
   * Idempotency key of the checkout in progress; set on the first submit, cleared with the cart after the order.
   * It belongs to one cart (`tokenCart` = cartSignature of what was submitted): after any change to the products,
   * quantities or gifts the next submit gets a new key, so it can never be mistaken for a retry of an earlier order.
   */
  token?: string;
  tokenCart?: string;
};
type DrawerState = { open: boolean; lastAdded: number | null };

type Listener = () => void;

function createStore<T>(key: string | null, initial: T, parse: (raw: unknown) => T | null = (raw) => raw as T) {
  let state = initial;
  let loaded = key === null;
  const listeners = new Set<Listener>();

  const read = (raw: string | null): T => {
    if (!raw) return initial;
    try {
      return parse(JSON.parse(raw)) ?? initial;
    } catch {
      return initial;
    }
  };

  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      state = read(window.localStorage.getItem(key!));
    } catch {
      // Private mode or blocked storage: start empty.
    }
  };

  return {
    get(): T {
      load();
      return state;
    },
    getServer(): T {
      return initial;
    },
    set(next: T) {
      state = next;
      if (key) {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage full or blocked; keep the in-memory state.
        }
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      // Another tab changed the cart: follow it.
      const onStorage = (e: StorageEvent) => {
        if (!key || e.key !== key) return;
        state = read(e.newValue);
        listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isLine = (v: unknown): v is CartSnapshot =>
  isObj(v) && Number.isInteger(v.id) && typeof v.name === "string" && typeof v.price === "number" && typeof v.stock === "number";

/** Stored value → cart state; anything unexpected (an older format, a hand-edited value) starts an empty cart. */
function parseCart(raw: unknown): CartState | null {
  if (!isObj(raw) || raw.v !== 2 || !Array.isArray(raw.items)) return null;
  const items = raw.items
    .filter((i): i is CartItem => isLine(i) && typeof (i as { qty?: unknown }).qty === "number")
    .map((i) => ({ ...i, qty: clampQty(i.qty, i.stock) }));
  const gifts = Array.isArray(raw.gifts)
    ? raw.gifts.filter((g): g is GiftChoice => isObj(g) && typeof g.tierId === "string" && Number.isInteger(g.id) && typeof g.name === "string")
    : [];
  const token = typeof raw.token === "string" ? raw.token : undefined;
  return { v: 2, items, gifts, token, tokenCart: token && typeof raw.tokenCart === "string" ? raw.tokenCart : undefined };
}

function parseWish(raw: unknown): CartSnapshot[] | null {
  return Array.isArray(raw) ? raw.filter(isLine) : null;
}

const EMPTY_CART: CartState = { v: 2, items: [], gifts: [] };
const EMPTY_WISH: CartSnapshot[] = [];

const cartStore = createStore<CartState>("sp-cart-v2", EMPTY_CART, parseCart);
const wishStore = createStore<CartSnapshot[]>("sp-wishlist-v1", EMPTY_WISH, parseWish);
const drawerStore = createStore<DrawerState>(null, { open: false, lastAdded: null });

export const MAX_QTY = 99;
/** Distinct products in one cart (the server prices at most 100 lines). */
export const MAX_LINES = 100;

/** 1 … min(stock, 99); with no stock (backorders allowed in Настройки) up to 99. */
export function clampQty(qty: number, stock: number): number {
  const cap = stock > 0 ? Math.min(stock, MAX_QTY) : MAX_QTY;
  return Math.max(1, Math.min(cap, Math.floor(qty) || 1));
}

/** Integer cents of the cart's paid lines (the qualifying subtotal as the browser knows it). */
export function cartCents(items: readonly { price: number; qty: number }[]): number {
  return items.reduce((c, i) => c + Math.round(i.price * 100) * i.qty, 0);
}

/**
 * The chosen gifts that count right now: only for reached tiers (the others are kept but inactive); in "single"
 * mode at most one.
 */
export function activeGifts(gifts: readonly GiftChoice[], reached: ReadonlySet<string>, mode: "perTier" | "single"): GiftChoice[] {
  // "single": only the latest choice counts (chooseGift keeps one; older extras can remain after a mode switch).
  return (mode === "single" ? gifts.slice(0, 1) : gifts).filter((g) => reached.has(g.tierId));
}

const subscribeNothing = () => () => {};

/** false during SSR and hydration, true once the stored cart / wishlist can be read. */
export function useCartReady(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function useCart() {
  const state = useSyncExternalStore(cartStore.subscribe, cartStore.get, cartStore.getServer);

  /** Adds `qty` (merging with the same variant) and opens the drawer. Quantities are clamped to the stock. */
  const add = useCallback((snapshot: CartSnapshot, qty = 1) => {
    const current = cartStore.get();
    const existing = current.items.find((i) => i.id === snapshot.id);
    if (!existing && current.items.length >= MAX_LINES) return;
    const items = existing
      ? current.items.map((i) => (i.id === snapshot.id ? { ...i, ...snapshot, qty: clampQty(i.qty + qty, snapshot.stock) } : i))
      : [...current.items, { ...snapshot, qty: clampQty(qty, snapshot.stock) }];
    cartStore.set({ ...current, items });
    drawerStore.set({ open: true, lastAdded: snapshot.id });
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    const current = cartStore.get();
    cartStore.set({ ...current, items: current.items.map((i) => (i.id === id ? { ...i, qty: clampQty(qty, i.stock) } : i)) });
  }, []);

  const remove = useCallback((id: number) => {
    const current = cartStore.get();
    cartStore.set({ ...current, items: current.items.filter((i) => i.id !== id) });
  }, []);

  /** Empties the cart and the chosen gifts (after an order). */
  const clear = useCallback(() => cartStore.set(EMPTY_CART), []);

  /** Replace stored product data (name, price, stock…) with fresh values from the server; drops missing / hidden products. */
  const refresh = useCallback((fresh: CartSnapshot[]) => {
    const byId = new Map(fresh.map((p) => [p.id, p]));
    const current = cartStore.get();
    cartStore.set({
      ...current,
      items: current.items
        .filter((i) => byId.has(i.id) && !byId.get(i.id)!.hidden)
        .map((i) => {
          const p = byId.get(i.id)!;
          return { ...i, ...p, qty: clampQty(i.qty, p.stock) };
        }),
    });
  }, []);

  /**
   * Pick a gift. "perTier": replaces the choice for the same tier; "single": replaces every choice.
   * Choices are kept when the cart drops below a tier (the UI greys them out; only reached tiers are sent).
   */
  const chooseGift = useCallback((choice: GiftChoice, mode: "perTier" | "single") => {
    const current = cartStore.get();
    const gifts = mode === "single" ? [choice] : [...current.gifts.filter((g) => g.tierId !== choice.tierId), choice];
    cartStore.set({ ...current, gifts });
  }, []);

  const removeGift = useCallback((tierId: string) => {
    const current = cartStore.get();
    cartStore.set({ ...current, gifts: current.gifts.filter((g) => g.tierId !== tierId) });
  }, []);

  /** Drop choices whose tier or product no longer exists and update names / pictures (from getActiveGiftTiers). */
  const refreshGifts = useCallback((tiers: GiftTiersPayload["tiers"]) => refreshGiftChoices(tiers), []);

  const count = state.items.reduce((n, i) => n + i.qty, 0);
  const subtotal = cartCents(state.items) / 100;
  return { items: state.items, gifts: state.gifts, count, subtotal, add, setQty, remove, clear, refresh, chooseGift, removeGift, refreshGifts };
}

function refreshGiftChoices(tiers: GiftTiersPayload["tiers"]) {
  const current = cartStore.get();
  if (!current.gifts.length) return;
  const gifts = current.gifts.flatMap((g) => {
    const p = tiers.find((t) => t.id === g.tierId)?.gifts.find((x) => x.id === g.id);
    return p ? [{ ...g, sku: p.sku, name: p.name, variant: p.variant, image: p.image }] : [];
  });
  const same = gifts.length === current.gifts.length && gifts.every((g, i) => JSON.stringify(g) === JSON.stringify(current.gifts[i]));
  if (!same) cartStore.set({ ...current, gifts });
}

/**
 * The idempotency key for submitting exactly this cart: the same key for a retry (double click, network error) of
 * the same products / quantities / gifts, a new one as soon as any of them changed.
 */
export function checkoutToken(items: readonly { id: number; qty: number }[], gifts: readonly { tierId: string; id: number }[]): string {
  const sig = cartSignature(items, gifts);
  const current = cartStore.get();
  if (current.token && current.tokenCart === sig) return current.token;
  const token = crypto.randomUUID();
  cartStore.set({ ...current, token, tokenCart: sig });
  return token;
}

/** True when this browser submitted a checkout whose cart hasn't been cleared yet (the order page then clears it). */
export function hasPendingCheckout(): boolean {
  return !!cartStore.get().token;
}

/** Empties the cart after an order (outside React components, e.g. the order confirmation page). */
export function clearCart() {
  cartStore.set(EMPTY_CART);
}

export function useWishlist() {
  const items = useSyncExternalStore(wishStore.subscribe, wishStore.get, wishStore.getServer);
  const has = useCallback((id: number) => items.some((i) => i.id === id), [items]);
  const toggle = useCallback((snapshot: CartSnapshot) => {
    const current = wishStore.get();
    wishStore.set(current.some((i) => i.id === snapshot.id) ? current.filter((i) => i.id !== snapshot.id) : [snapshot, ...current].slice(0, 200));
  }, []);
  const remove = useCallback((id: number) => wishStore.set(wishStore.get().filter((i) => i.id !== id)), []);
  /** Fresh names / prices / stock; drops products that disappeared (hidden ones stay listed but cannot be bought). */
  const refresh = useCallback((fresh: CartSnapshot[]) => {
    const byId = new Map(fresh.map((p) => [p.id, p]));
    wishStore.set(
      wishStore
        .get()
        .filter((i) => byId.has(i.id))
        .map((i) => ({ ...i, ...byId.get(i.id)! })),
    );
  }, []);
  return { items, has, toggle, remove, refresh, count: items.length };
}

export function useCartDrawer() {
  const state = useSyncExternalStore(drawerStore.subscribe, drawerStore.get, drawerStore.getServer);
  const show = useCallback(() => drawerStore.set({ ...drawerStore.get(), open: true }), []);
  const hide = useCallback(() => {
    const current = drawerStore.get();
    if (current.open || current.lastAdded !== null) drawerStore.set({ open: false, lastAdded: null });
  }, []);
  return { open: state.open, lastAdded: state.lastAdded, show, hide };
}

// ---------------------------------------------------------------------------------------------------------------
// Active gift tiers (GET /api/gift-tiers), fetched once per language and page load, shared by every component.

const TIERS_TTL_MS = 5 * 60_000;
const tiersStore = createStore<Partial<Record<Lang, GiftTiersPayload>>>(null, {});
const tiersFetched: Partial<Record<Lang, number>> = {};

function loadGiftTiers(lang: Lang) {
  const at = tiersFetched[lang];
  if (at && Date.now() - at < TIERS_TTL_MS) return;
  tiersFetched[lang] = Date.now();
  fetch(`/api/gift-tiers?lang=${lang}`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<GiftTiersPayload>) : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      if (!Array.isArray(data?.tiers)) return;
      tiersStore.set({ ...tiersStore.get(), [lang]: data });
      refreshGiftChoices(data.tiers);
    })
    .catch(() => {
      // Keep the chosen gifts; try again on the next mount.
      delete tiersFetched[lang];
    });
}

/** Fetch the gift tiers again now (a chosen gift turned out to be invalid when the order was placed). */
export function reloadGiftTiers(lang: Lang) {
  delete tiersFetched[lang];
  loadGiftTiers(lang);
}

/** The active gift campaign in the page's language; null until it has loaded. */
export function useGiftTiers(): GiftTiersPayload | null {
  const lang = useLang();
  const all = useSyncExternalStore(tiersStore.subscribe, tiersStore.get, tiersStore.getServer);
  useEffect(() => loadGiftTiers(lang), [lang]);
  return all[lang] ?? null;
}
