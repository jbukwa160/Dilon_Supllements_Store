// Purchase-threshold gifts (Admin → Цени и промоции → Подаръци над сума): gift product details for the editor and
// the checks before saving settings "giftTiers". The storefront side (cart, checkout) is lib/cart-gifts.ts.
import "server-only";
import { catalogDb } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { normalizeGiftTiers } from "@/lib/settings-normalize";
import { parseWhen } from "@/lib/price-engine";
import type { GiftTierSettings } from "@/lib/settings-types";

/** A gift choice as the editor shows it (hidden products included: samples may be sold only as gifts). */
export type GiftProduct = {
  id: number;
  sku: string;
  name: string;
  variant: string | null;
  image: string | null;
  /** Catalogue price ("стойност 4,90 €"). */
  price: number;
  stock: number;
  hidden: boolean;
  /** 18+ products (high caffeine, pre-workouts …) are never offered as gifts. */
  adultOnly: boolean;
};

export const MAX_TIERS = 6;
export const MAX_GIFTS_PER_TIER = 24;

export function giftProductsBySku(skus: string[]): GiftProduct[] {
  const list = [...new Set(skus)].filter(Boolean);
  const out: GiftProduct[] = [];
  for (let i = 0; i < list.length; i += 500) {
    const part = list.slice(i, i + 500);
    const rows = catalogDb()
      .prepare(`SELECT id, sku, name, flavour, size_label, image, price, stock, hidden, adult_only FROM products WHERE sku IN (${part.map(() => "?").join(",")})`)
      .all(...part) as {
      id: number;
      sku: string;
      name: string;
      flavour: string | null;
      size_label: string | null;
      image: string | null;
      price: number;
      stock: number;
      hidden: number;
      adult_only: number;
    }[];
    for (const r of rows) {
      out.push({
        id: r.id,
        sku: r.sku,
        name: r.name,
        variant: [r.flavour, r.size_label].filter(Boolean).join(" · ") || null,
        image: r.image,
        price: r.price,
        stock: r.stock,
        hidden: !!r.hidden,
        adultOnly: !!r.adult_only,
      });
    }
  }
  return out;
}

/** "40 €" / "49,99 €" in the admin's messages (the shop-wide amount formatter). */
const money = (n: number) => formatAmount(n, "bg");

/**
 * Check what the editor sent and return the settings to store (normalized: sorted by threshold, texts clipped, unknown
 * SKUs dropped). Problems the admin must fix come back as an error instead of being silently "corrected".
 */
export function validateGiftTiers(raw: unknown): { value: GiftTierSettings; dropped: number } | { error: string } {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawTiers = Array.isArray(r.tiers) ? (r.tiers as Record<string, unknown>[]) : [];
  if (rawTiers.length > MAX_TIERS) return { error: `Може да има най-много ${MAX_TIERS} нива.` };

  const seen = new Map<number, number>();
  for (const [i, t] of rawTiers.entries()) {
    const n = Math.round(Number(String(t?.threshold ?? "").replace(/\s/g, "").replace(",", ".")) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) return { error: `Ниво ${i + 1}: въведете сума, по-голяма от 0 (напр. 40).` };
    if (n > 100000) return { error: `Ниво ${i + 1}: сумата е твърде голяма.` };
    if (seen.has(n)) return { error: `Нива ${seen.get(n)! + 1} и ${i + 1} са с една и съща сума (${money(n)}) — сумите трябва да са различни.` };
    seen.set(n, i);
  }

  const value = normalizeGiftTiers(raw);
  if (value.startsAt && value.endsAt && parseWhen(value.endsAt, true)! <= parseWhen(value.startsAt)!) {
    return { error: "Крайната дата на кампанията трябва да е след началната." };
  }

  const products = new Map(giftProductsBySku(value.tiers.flatMap((t) => t.skus)).map((p) => [p.sku, p]));
  const adult = value.tiers.flatMap((t) => t.skus).map((s) => products.get(s)).find((p) => p?.adultOnly);
  if (adult) return { error: `„${adult.name}“ е продукт за пълнолетни (18+) и не може да е подарък. Премахнете го.` };
  let dropped = 0;
  const tiers = value.tiers.map((t) => {
    const skus = t.skus.filter((s) => products.has(s)).slice(0, MAX_GIFTS_PER_TIER);
    dropped += t.skus.length - skus.length;
    return { ...t, skus };
  });
  if (value.enabled) {
    const empty = tiers.find((t) => t.enabled && !t.skus.length);
    if (empty) return { error: `Нивото над ${money(empty.threshold)} е включено, но няма подаръци. Добавете поне един продукт или изключете нивото.` };
  }
  return { value: { ...value, tiers }, dropped };
}
