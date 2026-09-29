import "server-only";
import type { CartSnapshot } from "./catalog-types";
import { getSnapshots } from "./catalog";
import { resolveGiftTiers, type ResolvedGiftTier } from "./cart-gifts";
import type { Issue, OrderLine, PriceRequest, PricedCart } from "./checkout";
import { fromCents, toCents } from "./format";
import { freeShippingProgress } from "./free-shipping";
import { getSettings } from "./settings";
import { quoteShipping } from "./shipping";

// The ONLY calculator of prices, gift tiers, free delivery and shipping (SPEC §5.8, design: web-commerce.md D0/D1).
// Used by POST /api/cart/price (live cart / checkout summary) and by the placeOrder Server Action (authoritative).
// Everything comes from the database; the browser only says which product ids, quantities and gifts it wants.
// Money is summed in integer cents. Owner: D.

export const MAX_LINES = 100;
export const MAX_QTY = 99;
export const MAX_GIFTS = 10;

/** Valid lines only, duplicates merged (2 × qty 3 of one id = qty 6, still capped at 99), at most 100 lines. */
export function normalizeItems(items: readonly { id: number; qty: number }[]): { id: number; qty: number }[] {
  const byId = new Map<number, number>();
  for (const i of items) {
    const id = Number(i?.id);
    const qty = Math.floor(Number(i?.qty));
    if (!Number.isInteger(id) || id <= 0 || !(qty > 0)) continue;
    if (!byId.has(id) && byId.size >= MAX_LINES) continue;
    byId.set(id, Math.min(MAX_QTY, (byId.get(id) ?? 0) + qty));
  }
  return [...byId].map(([id, qty]) => ({ id, qty }));
}

/** Valid gift requests only: string tier id (≤ 40 chars) + product id, unique pairs, at most 10. */
export function normalizeGifts(gifts: readonly { tierId: string; id: number }[]): { tierId: string; id: number }[] {
  const seen = new Set<string>();
  const out: { tierId: string; id: number }[] = [];
  for (const g of gifts) {
    const id = Number(g?.id);
    const tierId = typeof g?.tierId === "string" ? g.tierId.slice(0, 40) : "";
    if (!tierId || !Number.isInteger(id) || id <= 0) continue;
    const key = `${tierId}|${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tierId, id });
    if (out.length >= MAX_GIFTS) break;
  }
  return out;
}

function paidLine(p: CartSnapshot, qty: number): OrderLine {
  return {
    kind: "item",
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    variant: p.variant,
    price: p.price,
    oldPrice: p.oldPrice !== null && p.oldPrice > p.price ? p.oldPrice : null,
    qty,
    total: fromCents(toCents(p.price) * qty),
    image: p.image,
    brand: p.brand,
  };
}

function giftLine(p: CartSnapshot, tier: ResolvedGiftTier): OrderLine {
  return {
    kind: "gift",
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    variant: p.variant,
    price: 0,
    oldPrice: null,
    listPrice: p.price,
    qty: 1,
    total: 0,
    tierId: tier.id,
    tierThreshold: tier.threshold,
    tierTitle: tier.title,
    image: p.image,
    brand: p.brand,
  };
}

/**
 * Prices a cart from the database (never from the browser): paid lines at their current (sale) prices, the
 * qualifying subtotal, reached gift tiers and valid gift lines, free delivery and the shipping quote, plus every
 * problem found (missing products, stock, gifts that are not allowed).
 *
 * - Hidden or deleted products are "missing" and left out of the lines.
 * - Stock problems (unless out-of-stock orders are allowed) are reported but the line stays in, priced as asked,
 *   so the cart can show it; placeOrder refuses any cart with issues.
 * - Gift choices are validated against the active campaign; only valid ones become gift lines (price 0).
 * - Shipping is quoted only when a delivery method is given (null otherwise); gift lines add to the parcel weight.
 */
export async function priceCart(req: PriceRequest): Promise<PricedCart> {
  const settings = getSettings();
  const items = normalizeItems(req.items ?? []);
  const requestedGifts = normalizeGifts(req.gifts ?? []);
  const issues: Issue[] = [];

  // Paid lines (visible products only).
  const snapshots = items.length ? getSnapshots(req.lang, items.map((i) => i.id)) : [];
  const byId = new Map(snapshots.map((p) => [p.id, p]));
  const lines: OrderLine[] = [];
  let subtotalC = 0;
  for (const i of items) {
    const p = byId.get(i.id);
    if (!p) {
      issues.push({ code: "missing", id: i.id });
      continue;
    }
    if (!settings.allowOutOfStockOrders && p.stock < i.qty) issues.push({ code: "stock", id: p.id, available: Math.max(0, p.stock) });
    const line = paidLine(p, i.qty);
    lines.push(line);
    subtotalC += toCents(p.price) * i.qty;
  }
  // No coupons yet: everything paid counts towards gifts and free delivery.
  const qualifyingC = subtotalC;

  // Gift tiers.
  const campaign = resolveGiftTiers(req.lang);
  const reachedTiers = campaign.tiers.filter((t) => qualifyingC >= toCents(t.threshold));
  const nextTier = campaign.tiers.find((t) => qualifyingC < toCents(t.threshold)) ?? null;
  const giftLines: OrderLine[] = [];
  const paidQty = new Map(lines.map((l) => [l.id, l.qty]));
  const giftQty = new Map<number, number>();
  const usedTiers = new Set<string>();
  for (const g of requestedGifts) {
    const tier = campaign.tiers.find((t) => t.id === g.tierId);
    if (!tier) {
      // Unknown or switched-off tier, or the campaign is over.
      issues.push({ code: "gift_not_in_tier", tierId: g.tierId, id: g.id });
      continue;
    }
    if (qualifyingC < toCents(tier.threshold)) {
      issues.push({ code: "gift_not_reached", tierId: tier.id, missing: fromCents(toCents(tier.threshold) - qualifyingC) });
      continue;
    }
    // perTier: one gift per tier; single: one gift in total.
    if (campaign.mode === "single" ? giftLines.length > 0 : usedTiers.has(tier.id)) {
      issues.push({ code: "gift_too_many", tierId: tier.id });
      continue;
    }
    const pool = campaign.mode === "single" ? reachedTiers.flatMap((t) => t.gifts) : tier.gifts;
    const p = pool.find((x) => x.id === g.id);
    if (!p) {
      issues.push({ code: "gift_not_in_tier", tierId: tier.id, id: g.id });
      continue;
    }
    // The gift unit comes out of the same stock as paid units of that product (backorders never apply to gifts).
    const need = 1 + (paidQty.get(p.id) ?? 0) + (giftQty.get(p.id) ?? 0);
    if (p.stock < need) {
      issues.push({ code: "gift_out_of_stock", tierId: tier.id, id: p.id });
      continue;
    }
    giftQty.set(p.id, (giftQty.get(p.id) ?? 0) + 1);
    usedTiers.add(tier.id);
    giftLines.push(giftLine(p, tier));
  }

  // Free delivery (same qualifying subtotal; offices-only rules flagged so the cart never promises it for address delivery).
  const freeShipping = freeShippingProgress(fromCents(qualifyingC), settings.shipping);

  let shipping: PricedCart["shipping"] = null;
  if (req.delivery && lines.length) {
    shipping = await quoteShipping({
      method: req.delivery.method,
      officeId: req.delivery.officeId,
      cityId: req.delivery.cityId,
      items: [...lines, ...giftLines].map((l) => ({ id: l.id, qty: l.qty })),
      qualifying: fromCents(qualifyingC),
      cashOnDelivery: req.payment !== "bank",
    });
  }

  return {
    lines,
    giftLines,
    subtotal: fromCents(subtotalC),
    qualifying: fromCents(qualifyingC),
    tiers: {
      reached: reachedTiers.map((t) => t.id),
      next: nextTier ? { id: nextTier.id, threshold: nextTier.threshold, missing: fromCents(toCents(nextTier.threshold) - qualifyingC) } : null,
    },
    freeShipping,
    shipping,
    total: fromCents(subtotalC + (shipping ? toCents(shipping.price) : 0)),
    issues,
    snapshots,
  };
}
