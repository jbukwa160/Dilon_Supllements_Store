import "server-only";
import { catalogDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getDict } from "@/i18n";
import {
  COURIERS,
  DELIVERY_KEYS,
  DELIVERY_METHODS,
  deliveryLabel,
  isDeliveryKey,
  type City,
  type Courier,
  type DeliveryKey,
  type Office,
  type OrderDelivery,
  type ShippingQuote,
} from "@/lib/checkout";
import { isFreeDelivery } from "@/lib/free-shipping";
import { normalizeSearch } from "./cache";
import { speedyCities, speedyCity, speedyConfigured, speedyOffices, speedyQuote } from "./speedy";
import { econtCities, econtOffices, econtQuote } from "./econt";

// Owner: D (ported by F from /web: labels from the dictionary, error codes instead of Bulgarian messages,
// qualifying subtotal + freeOver null / freeScope, capped quote cache, per-form default weights incl. gift lines).
//
// Courier outages never block an order (R4-07):
// - a courier the shop can't use is not offered: Speedy needs SPEEDY_USERNAME / SPEEDY_PASSWORD for everything
//   (offices, towns, prices); Econt's office and town lists are public (its login only adds live prices);
// - office / town lists live in a two-level cache with the last good copy as fallback, pre-loaded by
//   warmCourierCaches() (at start-up / daily from the scheduler, and lazily from the checkout page);
// - address delivery also accepts a town typed by hand (name + post code) when the town search is down; such an
//   order, and any order whose live price can't be fetched, pays the fixed price from Настройки → Доставка.

/** Couriers the shop can use now (Speedy only with its API login). */
export function availableCouriers(): Courier[] {
  return COURIERS.filter((c) => c !== "speedy" || speedyConfigured());
}

/** Delivery methods offered at checkout (those of the available couriers), in the usual order. */
export function availableDeliveryMethods(): DeliveryKey[] {
  const couriers = new Set(availableCouriers());
  return DELIVERY_KEYS.filter((k) => couriers.has(DELIVERY_METHODS[k].courier));
}

export function officesFor(courier: Courier): Promise<Office[]> {
  return courier === "speedy" ? speedyOffices() : econtOffices();
}

const WARM_EVERY_MS = 6 * 3600_000;
const warm = globalThis as unknown as { __courierWarm?: { at: number; job: Promise<Record<string, number | string>> } };

/**
 * Loads the courier lists the checkout needs (Econt offices + towns, Speedy offices when configured) into the cache,
 * so an outage later is covered by the stored copy; copies that are still fresh are not fetched again. At most one
 * run per 6 hours per process (`force`: now, e.g. the daily scheduler tick). Never throws: resolves to the list
 * sizes, or the error message per list (for logs).
 */
export function warmCourierCaches(opts: { force?: boolean } = {}): Promise<Record<string, number | string>> {
  const last = warm.__courierWarm;
  if (last && Date.now() - last.at < (opts.force ? 5_000 : WARM_EVERY_MS)) return last.job;
  const jobs: [string, () => Promise<unknown[]>][] = [
    ["econt:offices", econtOffices],
    ["econt:cities", econtCities],
  ];
  if (speedyConfigured()) jobs.push(["speedy:offices", speedyOffices]);
  const job = Promise.all(
    jobs.map(async ([name, load]): Promise<[string, number | string]> => {
      try {
        return [name, (await load()).length];
      } catch (e) {
        console.error(`[shipping] could not pre-load ${name}: ${(e as Error).message}`);
        return [name, (e as Error).message];
      }
    }),
  ).then((r) => Object.fromEntries(r));
  warm.__courierWarm = { at: Date.now(), job };
  return job;
}

/** Offices whose city, name or address contain every word typed. Offices before lockers. */
export async function searchOffices(courier: Courier, query: string, limit = 40): Promise<Office[]> {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const all = await officesFor(courier);
  const scored: { o: Office; score: number }[] = [];
  for (const o of all) {
    const city = normalizeSearch(o.city);
    const hay = `${city} ${normalizeSearch(o.name)} ${normalizeSearch(o.address)} ${o.postCode}`;
    if (!words.every((w) => hay.includes(w))) continue;
    // Exact city match ranks first, then offices before lockers.
    const score = (city === words.join(" ") ? 0 : city.startsWith(words[0]) ? 1 : 2) * 2 + (o.locker ? 1 : 0);
    scored.push({ o, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.o.name.localeCompare(b.o.name, "bg"))
    .slice(0, limit)
    .map((s) => s.o);
}

export async function searchCities(courier: Courier, query: string): Promise<City[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (courier === "speedy") return speedyCities(q);
  const words = normalizeSearch(q);
  const [all, offices] = await Promise.all([econtCities(), econtOffices().catch(() => [] as Office[])]);
  // Bigger towns (more Econt offices) first, so "Плов" finds Пловдив before Пловка.
  const officeCount = new Map<string, number>();
  for (const o of offices) officeCount.set(o.city, (officeCount.get(o.city) ?? 0) + 1);
  return all
    .filter((c) => normalizeSearch(c.name).startsWith(words) || c.postCode === q)
    .sort((a, b) => (officeCount.get(b.name) ?? 0) - (officeCount.get(a.name) ?? 0) || a.name.length - b.name.length)
    .slice(0, 25);
}

async function findCity(courier: Courier, id: string): Promise<City | null> {
  if (courier === "speedy") return speedyCity(id);
  return (await econtCities()).find((c) => c.id === id) ?? null;
}

/**
 * The delivery choice from the checkout. Address delivery: `cityId` (picked from the courier's town search), or —
 * when the search is down — a town typed by hand: `cityName` + `postCode`.
 */
export type DeliveryInput = { method: string; officeId?: string; cityId?: string; cityName?: string; postCode?: string; address?: string };

/** Error codes of resolveDelivery → dict.checkout.errors[code]; `field` is the form field to mark. */
export type DeliveryErrorCode = "noMethod" | "noOffice" | "noCity" | "noAddress" | "courierDown";

const POST_CODE_RE = /^\d{4}$/;
const TOWN_RE = /^\p{L}[\p{L}\p{M} .'’()-]{1,59}$/u;
const TOWN_PREFIX_RE = /^\s*(гр|с|град|село)\.?\s+/iu;

/** "гр. София" / "с. Бистрица" / "София" → "софия" (to match a typed town with the courier's list). */
const townKey = (s: string) => normalizeSearch(s.replace(TOWN_PREFIX_RE, ""));

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** The courier's own town for a typed name + post code, when its list answers within 4 s; null otherwise. */
async function matchTypedCity(courier: Courier, name: string, postCode: string): Promise<City | null> {
  const key = townKey(name);
  const find = (list: City[]) => list.find((c) => c.postCode === postCode && townKey(c.name) === key) ?? null;
  const list = courier === "speedy" ? speedyCities(name.replace(TOWN_PREFIX_RE, "")) : econtCities();
  return withTimeout(list.then(find), 4_000).catch(() => null);
}

/** Check the customer's delivery choice against the courier's data. Returns an error code or the delivery to store. */
export async function resolveDelivery(
  input: DeliveryInput,
): Promise<{ delivery: OrderDelivery; office?: Office; city?: City } | { error: DeliveryErrorCode; field: "delivery" | "office" | "city" | "address" }> {
  if (!isDeliveryKey(input.method)) return { error: "noMethod", field: "delivery" };
  const m = DELIVERY_METHODS[input.method];
  if (!availableCouriers().includes(m.courier)) return { error: "noMethod", field: "delivery" };
  // Stored with the order in Bulgarian (admin panel, waybill).
  const label = deliveryLabel(input.method, "bg");
  try {
    if (m.kind === "office") {
      const office = input.officeId ? (await officesFor(m.courier)).find((o) => o.id === input.officeId) : undefined;
      if (!office) return { error: "noOffice", field: "office" };
      const words = getDict("bg").checkout;
      return {
        office,
        delivery: {
          method: input.method,
          label,
          courier: m.courier,
          officeId: office.id,
          officeName: office.name,
          city: office.city,
          postCode: office.postCode,
          address: `${office.locker ? words.lockerShort : words.officeShort} „${office.name}“, ${office.address}`,
        },
      };
    }
    const address = (input.address ?? "").trim().slice(0, 300);
    if (!input.cityId) {
      // A town typed by hand (the town search was down): checked lightly, matched with the courier's list when it
      // answers quickly (the order then also keeps the courier's town id); always charged the fixed price.
      const name = (input.cityName ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      const postCode = (input.postCode ?? "").trim();
      if (!TOWN_RE.test(name) || !POST_CODE_RE.test(postCode)) return { error: "noCity", field: "city" };
      if (address.length < 4) return { error: "noAddress", field: "address" };
      const known = await matchTypedCity(m.courier, name, postCode);
      const city: City = known ?? { id: "", courier: m.courier, name, region: "", postCode };
      return {
        city,
        delivery: { method: input.method, label, courier: m.courier, ...(known ? { cityId: known.id } : {}), city: city.name, postCode, address, typedCity: true },
      };
    }
    const city = await findCity(m.courier, input.cityId);
    if (!city) return { error: "noCity", field: "city" };
    if (address.length < 4) return { error: "noAddress", field: "address" };
    return {
      city,
      delivery: { method: input.method, label, courier: m.courier, cityId: city.id, city: city.name, postCode: city.postCode, address },
    };
  } catch (e) {
    console.error("[shipping] resolve failed:", (e as Error).message);
    return { error: "courierDown", field: "delivery" };
  }
}

/**
 * Typical packed weight (kg) by product form, used when the catalogue has no weight (most supplement rows don't):
 * a tub of powder ≈ 1 kg, a jar of capsules ≈ 150 g, a bar ≈ 70 g…
 */
const FORM_WEIGHT: Record<string, number> = {
  powder: 1,
  capsules: 0.15,
  tablets: 0.15,
  softgels: 0.15,
  gummies: 0.2,
  liquid: 0.5,
  drink: 0.4,
  bar: 0.07,
  food: 0.3,
  accessory: 0.3,
  other: 0.5,
};
const UNKNOWN_WEIGHT = 0.5;

/** Parcel weight in kg for the courier quote (gift lines count too): catalogue weight, else the form's typical weight, +10% packaging. */
export function parcelWeight(items: { id: number; qty: number }[]): number {
  if (!items.length) return 1;
  const ids = [...new Set(items.map((i) => i.id))];
  const rows = catalogDb()
    .prepare(`SELECT id, weight, form FROM products WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as { id: number; weight: number | null; form: string | null }[];
  const w = new Map(rows.map((r) => [r.id, r.weight && r.weight > 0 ? r.weight : (FORM_WEIGHT[r.form ?? ""] ?? UNKNOWN_WEIGHT)]));
  const total = items.reduce((sum, i) => sum + (w.get(i.id) ?? UNKNOWN_WEIGHT) * i.qty, 0);
  return Math.min(50, Math.max(0.2, total * 1.1));
}

const QUOTE_TTL_MS = 30 * 60_000;
const QUOTE_CACHE_MAX = 2000;
const quoteCache = new Map<string, { at: number; value: number | null }>();

/** Is delivery free for this qualifying subtotal and method? (freeOver null = never; freeScope "office" = offices / lockers only.) */
export function isFreeShipping(qualifying: number, method: string | undefined): boolean {
  // An unknown method is never free under an offices-only rule.
  const kind = isDeliveryKey(method) ? DELIVERY_METHODS[method].kind : "address";
  return isFreeDelivery(qualifying, getSettings().shipping, kind);
}

/**
 * Delivery price for the customer: free over the threshold, else the courier's live price or the fixed price
 * from the settings. `qualifying` = paid lines after sale prices, without gifts and shipping.
 */
export async function quoteShipping(input: {
  method: string;
  officeId?: string;
  cityId?: string;
  items: { id: number; qty: number }[];
  qualifying: number;
  cashOnDelivery: boolean;
}): Promise<ShippingQuote> {
  const s = getSettings();
  const m = isDeliveryKey(input.method) ? DELIVERY_METHODS[input.method] : null;
  const fixed = m?.kind === "address" ? s.shipping.address : s.shipping.office;
  if (isFreeShipping(input.qualifying, input.method)) return { price: 0, free: true, source: "free" };
  if (!m || s.shipping.mode !== "courier" || (m.kind === "office" ? !input.officeId : !input.cityId)) {
    return { price: fixed, free: false, source: "fixed" };
  }

  const weight = parcelWeight(input.items);
  const cod = input.cashOnDelivery ? input.qualifying + fixed : 0;
  const key = [input.method, input.officeId ?? input.cityId, weight.toFixed(1), Math.round(cod / 10)].join("|");
  let price: number | null;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < QUOTE_TTL_MS) price = hit.value;
  else {
    if (m.courier === "speedy") {
      price = await speedyQuote({ officeId: input.officeId, siteId: input.cityId, weight, codAmount: cod });
    } else {
      const city = input.cityId ? await findCity("econt", input.cityId).catch(() => null) : null;
      price = await econtQuote({ officeCode: input.officeId, city: city ?? undefined, weight, codAmount: cod });
    }
    if (quoteCache.size >= QUOTE_CACHE_MAX) quoteCache.clear();
    quoteCache.set(key, { at: Date.now(), value: price });
  }
  if (price == null || !(price > 0)) return { price: fixed, free: false, source: "fixed" };
  return { price: Math.ceil(price * 100) / 100, free: false, source: "courier" };
}
