// Home page sections (Server Components). Each one is switched on / off in Admin → Начална страница and renders
// nothing when it has nothing to show.
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, CheckCircle2, ChevronRight, Gift, MessageCircle, RotateCcw, ShieldCheck, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { BrandInfo, GoalInfo } from "@/lib/catalog-types";
import type { PublicGiftTier } from "@/lib/cart-gifts";
import { formatNumber, plural } from "@/lib/format";
import { freeShippingText } from "@/lib/free-shipping";
import { localizeHref } from "@/lib/links";
import { ProductImage } from "@/components/product/ProductImage";
import { CategoryIcon } from "@/components/layout/CategoryIcon";
import { formatAmount } from "@/components/layout/format-amount";
import type { NavCategory } from "@/components/layout/nav-types";
import { NewsletterForm } from "@/components/layout/NewsletterForm";

/** Section title (short Inter ExtraBold uppercase), optional subtitle and a "see all" link. */
export function SectionHeader({ id, title, subtitle, href, linkLabel, lang }: { id?: string; title: string; subtitle?: string; href?: string; linkLabel?: string; lang: Lang }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 md:mb-5">
      <div className="min-w-0">
        <h2 id={id} className="h-display text-[1.25rem] md:text-[1.625rem]">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-muted md:text-base">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link
          href={localizeHref(href, lang)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-extrabold uppercase tracking-[0.02em] text-ink hover:text-primary hover:underline"
        >
          <span className="hidden sm:inline">{linkLabel ?? getDict(lang).common.seeAll}</span>
          <span className="sm:hidden">{getDict(lang).common.seeAll}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** The four promises under the hero (gift threshold, free delivery, returns, genuine products), all from settings. */
export function TrustStrip({
  lang,
  giftFrom,
  freeOver,
  freeScope = "all",
  returnDays,
  deliveryDays,
}: {
  lang: Lang;
  giftFrom: number | null;
  freeOver: number | null;
  freeScope?: "all" | "office";
  returnDays: number;
  deliveryDays: string;
}) {
  const t = getDict(lang).home.trust;
  const items: { icon: LucideIcon; title: string; text: string }[] = [];
  if (giftFrom !== null) items.push({ icon: Gift, title: t.gift, text: fmt(t.giftText, { amount: formatAmount(giftFrom, lang) }) });
  // The shared free-delivery helper with the strip's own (shorter) wording under the "Безплатна доставка" title.
  const shippingText = freeShippingText({ freeOver, freeScope }, lang, {
    over: t.shippingText,
    all: t.shippingAllText,
    officeOver: t.shippingOfficeText,
    officeAll: t.shippingOfficeAllText,
  });
  if (shippingText !== null) items.push({ icon: Truck, title: t.shipping, text: shippingText });
  items.push({ icon: RotateCcw, title: fmt(t.returns, { n: returnDays }), text: t.returnsText });
  items.push({ icon: ShieldCheck, title: t.original, text: t.originalText });
  // Always four: fill in with the delivery options and the human support.
  if (items.length < 4) items.splice(items.length - 2, 0, { icon: ShoppingBag, title: t.delivery, text: fmt(t.deliveryText, { days: deliveryDays }) });
  if (items.length < 4) items.push({ icon: MessageCircle, title: t.support, text: t.supportText });

  return (
    <section aria-label={t.label} className="on-dark mt-4 bg-ink text-white md:mt-6">
      <ul className="container-shop grid grid-cols-2 gap-x-4 gap-y-4 py-4 md:py-5 lg:grid-cols-4 lg:gap-x-8">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex min-w-0 items-start gap-2.5 md:items-center md:gap-3">
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-accent md:mt-0 md:h-7 md:w-7" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[0.8rem] font-extrabold uppercase leading-tight tracking-[0.02em] md:text-[0.85rem]">{title}</span>
              <span className="mt-0.5 block text-[0.75rem] uppercase leading-snug text-white/80 md:text-[0.8rem]">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** "Пазарувай по цел": 8 goal tiles — a grey picture tile with the goal's icon and a product, the name under it
 * (a swipeable row on phones and tablets, 4 × 2 on desktop). */
export function GoalTiles({ lang, goals }: { lang: Lang; goals: GoalInfo[] }) {
  const dict = getDict(lang);
  const t = dict.home.goals;
  if (!goals.length) return null;
  return (
    <section aria-labelledby="home-goals" className="container-shop py-8 md:py-12">
      <SectionHeader id="home-goals" title={t.title} subtitle={t.subtitle} href="/tseli" linkLabel={t.all} lang={lang} />
      <ul className="-mx-4 grid auto-cols-[44%] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 [scroll-snap-type:x_mandatory] scroll-px-4 sm:auto-cols-[30%] md:-mx-6 md:gap-4 md:px-6 md:scroll-px-6 lg:mx-0 lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {goals.slice(0, 8).map((g) => (
          <li key={g.slug} className="[scroll-snap-align:start]">
            <Link href={localizeHref(`/tsel/${g.slug}`, lang)} className="group flex h-full flex-col">
              <span className="relative block aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] bg-canvas transition group-hover:shadow-[var(--shadow-lift)]">
                <span className="absolute left-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-ink text-white" aria-hidden>
                  <CategoryIcon icon={g.icon} className="h-5 w-5" />
                </span>
                {g.image ? (
                  <span className="absolute inset-[10%] left-[22%] block transition duration-300 group-hover:scale-105" aria-hidden>
                    <ProductImage src={g.image} alt="" className="mix-blend-multiply" />
                  </span>
                ) : null}
              </span>
              <span className="mt-2.5 flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[0.95rem] font-extrabold leading-tight group-hover:text-primary md:text-base">{g.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{plural(lang, g.count, dict.common.products)}</span>
                </span>
                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** "#rrggbb" / "#rgb" → [r, g, b], or null. */
function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * The category's accent colour, darkened just enough to reach WCAG AA (4.5:1) as small text on the tile's
 * background (both are set per category in Admin → Категории; e.g. the lime-green "Креатин" was 4.47:1).
 * Unknown colour formats fall back to ink.
 */
export function readableAccent(fg: string, bg: string): string {
  const f = rgb(fg);
  const b = rgb(bg);
  if (!f || !b) return "var(--color-ink)";
  const lb = luminance(b);
  for (let k = 0; k <= 1.0001; k += 0.04) {
    const c = f.map((v) => Math.round(v * (1 - k))) as [number, number, number];
    if (ratio(luminance(c), lb) >= 4.6) return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return "var(--color-ink)";
}

/** "Популярни категории": coloured tiles with the category's icon, product count and picture. */
export function CategoryTiles({ lang, categories }: { lang: Lang; categories: NavCategory[] }) {
  const dict = getDict(lang);
  const t = dict.home.categories;
  if (!categories.length) return null;
  return (
    <section aria-labelledby="home-categories" className="container-shop py-8 md:py-12">
      <SectionHeader id="home-categories" title={t.title} subtitle={t.subtitle} href="/produkti" linkLabel={t.all} lang={lang} />
      <ul className="-mx-4 grid auto-cols-[42%] grid-flow-col grid-rows-2 gap-3 overflow-x-auto px-4 pb-2 [scroll-snap-type:x_mandatory] scroll-px-4 md:scroll-px-0 sm:auto-cols-[30%] md:mx-0 md:grid-flow-row md:grid-cols-4 md:grid-rows-none md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-8">
        {categories.map((c) => (
          <li key={c.slug} className="[scroll-snap-align:start]">
            <Link
              href={localizeHref(`/kategoria/${c.slug}`, lang)}
              className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface transition hover:border-[#c8c8c8] hover:shadow-[var(--shadow-lift)]"
            >
              <span className="relative block aspect-square bg-canvas p-[16%]" aria-hidden>
                <span className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-surface" style={{ color: readableAccent(c.accent, "#ffffff") }}>
                  <CategoryIcon icon={c.icon} className="h-[1.1rem] w-[1.1rem]" />
                </span>
                <span className="block h-full w-full transition duration-300 group-hover:scale-105">
                  <ProductImage src={c.image} alt="" className="mix-blend-multiply" />
                </span>
              </span>
              <span className="flex flex-col gap-0.5 px-2.5 py-2.5 md:px-3">
                <span className="text-[0.88rem] font-extrabold leading-tight group-hover:text-primary md:text-[0.92rem]">{c.name}</span>
                <span className="text-xs tabular-nums text-muted">{plural(lang, c.count, dict.common.products)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** "Колкото повече, толкова повече подаръци": the purchase-threshold gift tiers as steps (ink band). */
export function GiftTiersBlock({ lang, tiers, single }: { lang: Lang; tiers: PublicGiftTier[]; single: boolean }) {
  const dict = getDict(lang);
  const t = dict.home.giftTiers;
  const shown = tiers.filter((x) => x.gifts.length > 0);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="home-gifts" className="container-shop py-6 md:py-10">
      <div className="on-dark relative overflow-hidden rounded-[var(--radius-xl)] bg-ink px-5 py-8 text-white md:px-10 md:py-12">
        <span className="pointer-events-none absolute inset-y-0 -right-24 hidden w-[38%] -skew-x-[14deg] bg-white/[0.04] md:block" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center lg:gap-12">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.06em] text-accent">
              <Gift className="h-4 w-4" aria-hidden /> {t.eyebrow}
            </p>
            <h2 id="home-gifts" className="h-title mt-3 text-[1.75rem] text-white md:text-[2.4rem]">
              {t.title}
            </h2>
            <p className="mt-3 max-w-md leading-relaxed text-white/85">{single ? t.textSingle : t.text}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={localizeHref("/kolichka", lang)} className="btn btn-energy h-12 px-6">
                {t.cta} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href={localizeHref("/produkti", lang)} className="btn h-12 border-white px-6 text-white hover:bg-white/10">
                {t.shop}
              </Link>
            </div>
            <Link href={localizeHref("/obshti-usloviya#podaratsi", lang)} className="mt-4 inline-block text-sm text-white/80 underline underline-offset-2 hover:text-white">
              {t.terms}
            </Link>
          </div>

          <ol className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((tier, i) => (
              <li key={tier.id} className="flex flex-col rounded-[var(--radius-lg)] bg-white/[0.06] p-5 ring-1 ring-white/10">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.06em] text-white/75">{fmt(t.step, { n: i + 1 })}</span>
                  <span className="text-xs text-white/75">{plural(lang, tier.gifts.length, t.choices)}</span>
                </div>
                <p className="mt-2 font-display text-[2rem] font-black leading-none text-accent tabular-nums">
                  <span className="sr-only">{fmt(t.over, { amount: formatAmount(tier.threshold, lang) })}</span>
                  <span aria-hidden>{formatAmount(tier.threshold, lang)}</span>
                </p>
                <p className="mt-2 font-semibold text-white">{tier.title}</p>
                {tier.note ? <p className="mt-1 text-sm text-white/80">{tier.note}</p> : null}
                <ul className="mt-4 grid grid-cols-4 gap-1.5" aria-label={tier.title}>
                  {tier.gifts.slice(0, tier.gifts.length > 4 ? 3 : 4).map((g) => (
                    <li key={g.id} className="aspect-square rounded-[var(--radius-sm)] bg-surface p-1" title={g.variant ? `${g.name} · ${g.variant}` : g.name}>
                      <ProductImage src={g.image} alt={g.variant ? `${g.name} · ${g.variant}` : g.name} dim={!g.available} />
                    </li>
                  ))}
                  {tier.gifts.length > 4 ? (
                    <li className="grid aspect-square place-items-center rounded-[var(--radius-sm)] bg-white/10 text-sm font-bold text-white" aria-hidden>
                      +{tier.gifts.length - 3}
                    </li>
                  ) : null}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** "Популярни марки": a wall of brand names (the catalogue has no logos), most stocked first. */
export function BrandsStrip({ lang, brands, total }: { lang: Lang; brands: BrandInfo[]; total: number }) {
  const t = getDict(lang).home.brands;
  if (!brands.length) return null;
  const rounded = total >= 100 ? Math.floor(total / 100) * 100 : total;
  return (
    <section aria-labelledby="home-brands" className="container-shop py-8 md:py-12">
      <SectionHeader id="home-brands" title={t.title} subtitle={fmt(t.subtitle, { n: formatNumber(rounded, lang) })} href="/marki" linkLabel={t.all} lang={lang} />
      <ul className="-mx-4 grid auto-cols-[44%] grid-flow-col grid-rows-2 gap-3 overflow-x-auto px-4 pb-2 [scroll-snap-type:x_mandatory] scroll-px-4 md:scroll-px-0 sm:auto-cols-[30%] md:mx-0 md:grid-flow-row md:grid-cols-4 md:grid-rows-none md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-6">
        {brands.map((b) => (
          <li key={b.slug} className="[scroll-snap-align:start]">
            <Link
              href={localizeHref(`/marka/${b.slug}`, lang)}
              className="group flex h-20 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-line bg-surface px-3 text-center transition hover:border-ink hover:shadow-[var(--shadow-lift)]"
            >
              <span className="line-clamp-2 font-display text-[0.9rem] font-black uppercase italic leading-tight tracking-[-0.01em] text-ink group-hover:text-primary">{b.name}</span>
              <span className="mt-1 text-xs text-muted">{plural(lang, b.count, getDict(lang).common.products)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** The home page's newsletter band. Its id hides the footer's smaller sign-up form on this page (CSS :has()). */
export function NewsletterBand({ lang }: { lang: Lang }) {
  const t = getDict(lang).home.newsletter;
  return (
    <section id="home-newsletter" aria-labelledby="home-newsletter-title" className="container-shop py-8 md:py-12">
      <div className="on-dark relative overflow-hidden rounded-[var(--radius-xl)] bg-primary px-5 py-8 text-white md:px-12 md:py-12">
        <span className="pointer-events-none absolute inset-y-0 -right-20 hidden w-[36%] -skew-x-[14deg] bg-black/10 md:block" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 id="home-newsletter-title" className="h-display text-[1.5rem] text-white md:text-[2.1rem]">
              {t.title}
            </h2>
            <p className="mt-3 max-w-lg leading-relaxed text-white">{t.text}</p>
            <ul className="mt-4 space-y-1.5">
              {t.benefits.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-white" aria-hidden /> {b}
                </li>
              ))}
            </ul>
          </div>
          <NewsletterForm tone="dark" className={clsx("lg:justify-self-end", "lg:max-w-md")} />
        </div>
      </div>
    </section>
  );
}
