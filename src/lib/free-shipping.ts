// Free delivery, one place for everything the shop says and decides about it: the promise text (top bar, home
// trust strip, product page, admin previews) and whether an amount reaches it (pricing engine, shipping quote, cart
// bars). From the settings' threshold (null = no free delivery → nothing is shown; 0 = every order) and scope (all
// methods, or offices / lockers only). Pure: usable in server and client components.
import { fmt, getDict, type Dict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { formatAmount } from "./format";
import type { StoreSettings } from "./settings-types";

type Shipping = Pick<StoreSettings["shipping"], "freeOver" | "freeScope">;

/** The four wordings of the promise ({amount} in the "over" ones). Default: dict.common.freeShipping. */
export type FreeShippingTexts = Dict["common"]["freeShipping"];

/** "Безплатна доставка над {amount}" / "… за всяка поръчка" (a `{amount}` token only when there is a threshold), or null. */
export function freeShippingTemplate(shipping: Shipping, t: FreeShippingTexts): string | null {
  if (shipping.freeOver === null) return null;
  const office = shipping.freeScope === "office";
  if (shipping.freeOver <= 0) return office ? t.officeAll : t.all;
  return office ? t.officeOver : t.over;
}

/**
 * The promise in parts, for rich rendering (a bold amount): the template and the formatted threshold ("50 €",
 * whole euros without ",00"). null = no free delivery.
 */
export function freeShippingParts(shipping: Shipping, lang: Lang, texts?: FreeShippingTexts): { template: string; amount: string } | null {
  const template = freeShippingTemplate(shipping, texts ?? getDict(lang).common.freeShipping);
  if (template === null) return null;
  return { template, amount: formatAmount(Math.max(0, shipping.freeOver ?? 0), lang) };
}

/** The promise as plain text: "Безплатна доставка над 50 €", "Free delivery to an office on every order"; null = none. */
export function freeShippingText(shipping: Shipping, lang: Lang, texts?: FreeShippingTexts): string | null {
  const parts = freeShippingParts(shipping, lang, texts);
  return parts ? fmt(parts.template, { amount: parts.amount }) : null;
}

/**
 * Is delivery free for this qualifying amount (paid lines after sale prices, no gifts / shipping)? Compared in cents
 * (48,99 € is charged, 49,00 € is free). `kind` = the chosen delivery; unknown (no method chosen yet) = the
 * threshold is reached for the methods it applies to.
 */
export function isFreeDelivery(qualifying: number, shipping: Shipping, kind?: "office" | "address"): boolean {
  if (shipping.freeOver === null) return false;
  if (Math.round(qualifying * 100) < Math.round(shipping.freeOver * 100)) return false;
  return !(shipping.freeScope === "office" && kind === "address");
}

/**
 * Progress towards free delivery: the threshold (null = none), what is missing, whether it is reached (for the
 * methods it applies to) and whether it applies to offices / lockers only (then address delivery is always charged).
 */
export function freeShippingProgress(
  qualifying: number,
  shipping: Shipping,
): { threshold: number | null; missing: number; reached: boolean; officeOnly: boolean } {
  const threshold = shipping.freeOver;
  const cents = Math.round(qualifying * 100);
  return {
    threshold,
    missing: threshold === null ? 0 : Math.max(0, Math.round(threshold * 100) - cents) / 100,
    reached: isFreeDelivery(qualifying, shipping),
    officeOnly: threshold !== null && shipping.freeScope === "office",
  };
}
