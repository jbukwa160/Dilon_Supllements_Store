// The milestone bar's pure logic (no React): positions of the gift / free-delivery markers for a cart amount and
// the texts that go with them. Shared by the storefront bar (GiftTierBar), the admin preview (GiftTiersEditor)
// and tests.
import type { Dict } from "@/i18n";

type Milestone = { kind: "gift" | "shipping"; id: string; at: number };

/** Milestones sorted by amount; the progress, each marker's position and the next target for amount `q`. */
export function milestones(q: number, tiers: readonly { id: string; threshold: number }[], freeOver: number | null) {
  const list: Milestone[] = [
    ...tiers.map((t) => ({ kind: "gift" as const, id: t.id, at: t.threshold })),
    ...(freeOver !== null && freeOver > 0 ? [{ kind: "shipping" as const, id: "shipping", at: freeOver }] : []),
  ].sort((a, b) => a.at - b.at || (a.kind === "gift" ? -1 : 1));
  const cents = Math.round(q * 100);
  const reachedAt = (m: Milestone) => cents >= Math.round(m.at * 100);
  const max = list.at(-1)?.at ?? 0;
  const next = list.find((m) => !reachedAt(m)) ?? null;
  // Everything due at the same amount as the next milestone ("…за подарък и безплатна доставка").
  const nextGroup = next ? list.filter((m) => Math.round(m.at * 100) === Math.round(next.at * 100)) : [];
  return {
    list,
    pct: max > 0 ? Math.min(100, (q / max) * 100) : 100,
    markers: list.map((m) => ({ ...m, left: max > 0 ? (m.at / max) * 100 : 100, reached: reachedAt(m) })),
    next,
    nextKinds: new Set(nextGroup.map((m) => m.kind)),
    missing: next ? Math.max(0, Math.round(next.at * 100) - cents) / 100 : 0,
  };
}

type BarTexts = Dict["giftTiers"];

/**
 * The bar's texts for milestones `m` (shared with the admin preview): the headline — a template with `{amount}`
 * while something is left, else the "all reached" line — and the free-delivery texts, "до офис" when free
 * delivery covers offices / lockers only.
 */
export function milestoneTexts(m: ReturnType<typeof milestones>, t: BarTexts, opts: { hasGifts: boolean; officeOnly: boolean }) {
  const o = opts.officeOnly;
  const hasShipping = m.list.some((x) => x.kind === "shipping");
  const shippingReached = o ? t.shippingReachedOffice : t.shippingReached;
  let headline: string;
  if (m.next) {
    const both = m.nextKinds.has("gift") && m.nextKinds.has("shipping");
    headline = both ? (o ? t.leftBothOffice : t.leftBoth) : m.nextKinds.has("gift") ? t.left : o ? t.leftShippingOffice : t.leftShipping;
  } else {
    headline = opts.hasGifts && hasShipping ? (o ? t.allReachedOffice : t.allReached) : opts.hasGifts ? t.allGiftsReached : shippingReached;
  }
  return { headline, done: !m.next, shippingReached, markerShipping: o ? t.markerShippingOffice : t.markerShipping };
}
