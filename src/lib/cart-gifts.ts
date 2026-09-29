import "server-only";
import { fmt } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { site } from "@/config/site";
import type { CartSnapshot } from "./catalog-types";
import type { GiftTiersPayload, PublicGiftTier } from "./checkout";
import { formatAmount } from "./format";
import { getSnapshots } from "./catalog";
import { catalogDb } from "./db";
import { loc } from "./l10n";
import { getGiftTiers } from "./settings";
import type { GiftTierSettings } from "./settings-types";

// Purchase-threshold gifts for the storefront (settings "giftTiers" → what the cart shows and what priceCart
// accepts). One resolver feeds both, so the gift picker never offers a gift the server would refuse. Owner: D.
//
// Rules (SPEC §2, web-commerce.md D1, §11b):
// - Active = settings.enabled and today (Europe/Sofia) inside [startsAt, endsAt] (inclusive, either may be open).
// - A tier counts only when it is enabled and has at least one giftable product; tiers are sorted by threshold.
// - Gifts are variant SKUs; hidden products are allowed (samples not sold separately); 18+ products are NEVER gifts.
// - Gifts without a picture are allowed even while the shop hides such products: marketing picked them explicitly,
//   the picker shows a placeholder (the admin editor warns about them).
// - available = stock >= 1 (never backordered, even when out-of-stock orders are allowed).

export type { PublicGiftTier };

/** A tier with its gift products resolved (server side; priceCart validates choices against `gifts`). */
export type ResolvedGiftTier = {
  id: string;
  threshold: number;
  title: string;
  note: string;
  gifts: CartSnapshot[];
};

/** "2026-09-29" in Bulgarian time. */
export function sofiaDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: site.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Gift tiers switched on and today inside the campaign dates (YYYY-MM-DD, inclusive, Europe/Sofia). */
export function isGiftCampaignActive(cfg: GiftTierSettings, now: Date = new Date()): boolean {
  if (!cfg.enabled) return false;
  const today = sofiaDay(now);
  if (cfg.startsAt && today < cfg.startsAt) return false;
  if (cfg.endsAt && today > cfg.endsAt) return false;
  return true;
}

/** Snapshots of these SKUs in `lang` (hidden and picture-less products included, 18+ products left out), keyed by SKU. */
function giftProducts(lang: Lang, skus: string[]): Map<string, CartSnapshot> {
  const clean = [...new Set(skus.filter(Boolean))];
  if (!clean.length) return new Map();
  const rows = catalogDb()
    .prepare(`SELECT id FROM products WHERE sku IN (${clean.map(() => "?").join(",")})`)
    .all(...clean) as { id: number }[];
  const snaps = getSnapshots(
    lang,
    rows.map((r) => r.id),
    { includeHidden: true },
  );
  return new Map(snaps.filter((s) => !s.adultOnly).map((s) => [s.sku, s]));
}

/**
 * The active campaign: mode, localized headline and the enabled tiers that have at least one gift, each with
 * its gift products in the admin's order. `tiers` is [] when gift tiers are off or outside their dates.
 */
export function resolveGiftTiers(lang: Lang, now: Date = new Date()): { mode: GiftTierSettings["mode"]; headline: string; tiers: ResolvedGiftTier[] } {
  const cfg = getGiftTiers();
  const headline = loc(cfg.headline, lang);
  if (!isGiftCampaignActive(cfg, now)) return { mode: cfg.mode, headline, tiers: [] };
  const enabled = cfg.tiers.filter((t) => t.enabled && t.threshold > 0).sort((a, b) => a.threshold - b.threshold);
  const products = giftProducts(
    lang,
    enabled.flatMap((t) => t.skus),
  );
  const tiers: ResolvedGiftTier[] = [];
  for (const t of enabled) {
    const gifts = t.skus.map((sku) => products.get(sku)).filter((p): p is CartSnapshot => !!p);
    if (!gifts.length) continue;
    const amount = formatAmount(t.threshold, lang);
    tiers.push({ id: t.id, threshold: t.threshold, title: fmt(loc(t.title, lang), { amount }), note: loc(t.note, lang), gifts });
  }
  return { mode: cfg.mode, headline, tiers };
}

function toPublic(t: ResolvedGiftTier): PublicGiftTier {
  return {
    id: t.id,
    threshold: t.threshold,
    title: t.title,
    note: t.note,
    gifts: t.gifts.map((p) => ({
      id: p.id,
      sku: p.sku,
      groupId: p.groupId,
      name: p.name,
      variant: p.variant,
      image: p.image,
      value: p.price,
      available: p.stock >= 1,
    })),
  };
}

/**
 * Enabled tiers of the active campaign (settings.enabled and today, Europe/Sofia, inside [startsAt, endsAt]),
 * sorted by threshold, with their gift products (hidden products allowed; 18+ products never offered).
 * [] when gift tiers are off.
 */
export function getActiveGiftTiers(lang: Lang): PublicGiftTier[] {
  return resolveGiftTiers(lang).tiers.map(toPublic);
}

/** The whole public payload of GET /api/gift-tiers (tiers + mode + headline). */
export function getGiftTiersPayload(lang: Lang): GiftTiersPayload {
  const r = resolveGiftTiers(lang);
  return { mode: r.mode, headline: r.headline, tiers: r.tiers.map(toPublic) };
}
