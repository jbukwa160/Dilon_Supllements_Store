// Delivery / payment options and the cart / order types shared by the checkout (client), the pricing engine and
// order handling (server). Labels are NOT here: they live in the "checkout" dictionary
// (dict.checkout.methods[key], dict.checkout.payments[key], dict.checkout.couriers[courier]) — see the helpers below.
// Owner: D (types written by F; D may extend them).
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { CartSnapshot } from "./catalog-types";
import { formatPrice } from "./format";

export type Courier = "econt" | "speedy";
export type DeliveryKind = "office" | "address";

export const DELIVERY_METHODS = {
  "econt-office": { courier: "econt", kind: "office" },
  "speedy-office": { courier: "speedy", kind: "office" },
  "econt-address": { courier: "econt", kind: "address" },
  "speedy-address": { courier: "speedy", kind: "address" },
} as const satisfies Record<string, { courier: Courier; kind: DeliveryKind }>;
export type DeliveryKey = keyof typeof DELIVERY_METHODS;
export const DELIVERY_KEYS = Object.keys(DELIVERY_METHODS) as DeliveryKey[];

export const COURIERS: Courier[] = ["econt", "speedy"];

/** Cash on delivery and bank transfer only (no card payments on the site). */
export const PAYMENT_KEYS = ["cod", "bank"] as const;
export type PaymentKey = (typeof PAYMENT_KEYS)[number];

export function isDeliveryKey(v: unknown): v is DeliveryKey {
  return typeof v === "string" && v in DELIVERY_METHODS;
}
export function isPaymentKey(v: unknown): v is PaymentKey {
  return typeof v === "string" && (PAYMENT_KEYS as readonly string[]).includes(v);
}

/** "До офис или Еконтомат на Еконт" (short: "Офис на Еконт"). Orders store the Bulgarian label as a snapshot. */
export function deliveryLabel(key: DeliveryKey, lang: Lang, short = false): string {
  const m = getDict(lang).checkout.methods[key];
  return short ? m.short : m.label;
}
export function paymentLabel(key: PaymentKey, lang: Lang): string {
  return getDict(lang).checkout.payments[key].label;
}
export function courierName(courier: Courier, lang: Lang): string {
  return getDict(lang).checkout.couriers[courier];
}

/** One line of an order / priced cart. Gift lines: kind "gift", price 0, the tier snapshot and the catalogue value. */
export type OrderLine = {
  kind: "item" | "gift";
  id: number;
  sku: string;
  slug: string;
  name: string;
  /** "Шоколад · 1 кг". */
  variant: string | null;
  /** Unit price charged (0 for gifts). */
  price: number;
  oldPrice: number | null;
  /** Gifts: the catalogue value ("стойност 4,90 €"). */
  listPrice?: number;
  qty: number;
  total: number;
  tierId?: string;
  tierThreshold?: number;
  tierTitle?: string;
  /** English product name / variant for English customers (orders keep `name` / `variant` in Bulgarian for the admin). */
  nameEn?: string;
  variantEn?: string | null;
  /** Picture for order history and e-mails. */
  image?: string | null;
  brand?: string | null;
};

export type OrderStatus = "new" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned";
export const ORDER_STATUS_KEYS: OrderStatus[] = ["new", "confirmed", "shipped", "delivered", "cancelled", "returned"];

/** A gift the customer picked in the cart (kept in the browser, re-validated by the server). */
export type GiftChoice = { tierId: string; id: number; sku: string; name: string; variant: string | null; image: string | null };

/** What the browser sends to price a cart (POST /api/cart/price) and what placeOrder prices. Never prices. */
export type PriceRequest = {
  items: { id: number; qty: number }[];
  gifts: { tierId: string; id: number }[];
  delivery?: { method: DeliveryKey; officeId?: string; cityId?: string };
  payment?: PaymentKey;
  lang: Lang;
};

export type Issue =
  | { code: "missing"; id: number }
  | { code: "stock"; id: number; available: number }
  | { code: "gift_not_reached"; tierId: string; missing: number }
  | { code: "gift_not_in_tier"; tierId: string; id: number }
  | { code: "gift_out_of_stock"; tierId: string; id: number }
  | { code: "gift_too_many"; tierId: string };

export type ShippingQuote = {
  /** What the customer pays for delivery. */
  price: number;
  free: boolean;
  /** "courier" = live price from the courier, "fixed" = price from the store settings, "free" = over the threshold. */
  source: "courier" | "fixed" | "free";
};

export type PricedCart = {
  /** Paid lines (kind "item"), sale prices applied. */
  lines: OrderLine[];
  /** Valid gift lines only (kind "gift", price 0). */
  giftLines: OrderLine[];
  subtotal: number;
  /** What gift tiers and free delivery are measured on: paid lines after sale prices, without gifts and shipping. */
  qualifying: number;
  tiers: { reached: string[]; next: { id: string; threshold: number; missing: number } | null };
  /** `reached` = free for the methods it applies to; `officeOnly` = only offices / lockers are free (address delivery is charged). */
  freeShipping: { threshold: number | null; missing: number; reached: boolean; officeOnly: boolean };
  /** null until a delivery method is chosen. */
  shipping: ShippingQuote | null;
  total: number;
  issues: Issue[];
  /** Fresh product data for the lines (the client refreshes its cart with it). */
  snapshots: CartSnapshot[];
};

/** A courier office or parcel locker. */
export type Office = {
  id: string;
  courier: Courier;
  name: string;
  city: string;
  postCode: string;
  address: string;
  locker: boolean;
};

/** A city / village the courier delivers to (for address delivery). */
export type City = {
  /** The courier's town id; "" = typed by hand (address book, or the checkout while the town search is down). */
  id: string;
  courier: Courier;
  name: string;
  region: string;
  postCode: string;
};

/** What gets stored with an order (labels in Bulgarian: the admin panel and the waybill are Bulgarian). */
export type OrderDelivery = {
  method: DeliveryKey | string;
  label: string;
  courier?: Courier;
  city: string;
  address: string;
  postCode?: string;
  officeId?: string;
  officeName?: string;
  cityId?: string;
  /** The town was typed by hand (the courier's town search was down); `cityId` only when it matched the courier's list. */
  typedCity?: boolean;
};

/** Line name / variant in the customer's language (orders store Bulgarian plus the English values when they differ). */
export function lineName(line: Pick<OrderLine, "name" | "nameEn">, lang: Lang): string {
  return (lang === "en" && line.nameEn) || line.name;
}
export function lineVariant(line: Pick<OrderLine, "variant" | "variantEn">, lang: Lang): string | null {
  return (lang === "en" && line.variantEn !== undefined ? line.variantEn : line.variant) || null;
}

/** A purchase-threshold gift tier as the cart / gift picker sees it (GET /api/gift-tiers). */
export type PublicGiftTier = {
  id: string;
  threshold: number;
  /** "{amount}" already replaced ("Подарък над 40 €"). */
  title: string;
  note: string;
  gifts: {
    id: number;
    sku: string;
    groupId: number | null;
    name: string;
    variant: string | null;
    image: string | null;
    /** Catalogue price ("стойност 4,90 €"). */
    value: number;
    /** stock >= 1 (never backordered, even when out-of-stock orders are allowed). */
    available: boolean;
  }[];
};

/** GET /api/gift-tiers response: the active campaign (tiers = [] when gift tiers are off or outside their dates). */
export type GiftTiersPayload = { mode: "perTier" | "single"; headline: string; tiers: PublicGiftTier[] };

/** A delivery choice as the checkout form holds it (also a saved address of a customer). */
export type SavedDelivery = { method: DeliveryKey; office: Office | null; city: City | null; address: string };

/**
 * "12x2,40x1|t40:393" — what a checkout submits (paid ids × qty, chosen gifts), independent of the order of lines.
 * The browser keys its idempotency token to it and placeOrder stores its hash with the order (R2-M7).
 */
export function cartSignature(items: readonly { id: number; qty: number }[], gifts: readonly { tierId: string; id: number }[]): string {
  const lines = items.map((i) => `${i.id}x${i.qty}`).sort();
  const chosen = gifts.map((g) => `${g.tierId}:${g.id}`).sort();
  return `${lines.join(",")}|${chosen.join(",")}`;
}

/** "40 €" / "€40" for whole amounts, else "40,50 €" — re-exported from lib/format (the only implementation). */
export { formatAmount } from "./format";

/**
 * One cart / order problem as a sentence for the shopper. `name` resolves a product id to its name in the
 * shopper's language (null when unknown).
 */
export function issueText(
  issue: Issue,
  lang: Lang,
  ctx: { name: (id: number) => string | null | undefined },
): string {
  const t = getDict(lang).checkout.issues;
  switch (issue.code) {
    case "missing": {
      const name = ctx.name(issue.id);
      return name ? fmt(t.missing, { name }) : t.missingGeneric;
    }
    case "stock": {
      const name = ctx.name(issue.id) ?? t.productGeneric;
      return issue.available > 0 ? fmt(t.stock, { name, n: issue.available }) : fmt(t.soldOut, { name });
    }
    case "gift_not_reached":
      return fmt(t.giftNotReached, { name: t.giftGeneric, amount: formatPrice(issue.missing, lang) });
    case "gift_not_in_tier":
      return fmt(t.giftNotInTier, { name: ctx.name(issue.id) ?? t.giftGeneric });
    case "gift_out_of_stock":
      return fmt(t.giftOutOfStock, { name: ctx.name(issue.id) ?? t.giftGeneric });
    case "gift_too_many":
      return t.giftTooMany;
  }
}
