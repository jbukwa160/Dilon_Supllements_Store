// One hero banner of the home page. Used by the home page carousel AND by the admin's live preview (Начална
// страница), so it must stay free of server-only code and hooks: it gets the language as a prop.
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Gift, ImageIcon, Sparkles } from "lucide-react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { ProductCard } from "@/lib/catalog-types";
import { formatNumber } from "@/lib/format";
import { loc } from "@/lib/l10n";
import { isExternalHref, localizeHref } from "@/lib/links";
import { COUNT_TOKEN, COUNT_TOKEN_EN, THEMES, type HeroSlide, type L10n } from "@/lib/settings-types";
import { ProductImage } from "@/components/product/ProductImage";

/** What the automatic picture of a text-image slide needs from a product. */
export type CollageProduct = Pick<ProductCard, "id" | "slug" | "name" | "image">;

// Full class names (Tailwind only sees literal strings).
const TILT = ["lg:-rotate-3", "lg:rotate-2", "lg:rotate-2", "lg:-rotate-2"];

function SmartLink({ href, lang, className, tabIndex, children }: { href: string; lang: Lang; className?: string; tabIndex?: number; children: React.ReactNode }) {
  const external = isExternalHref(href);
  return (
    <Link href={localizeHref(href, lang)} className={className} tabIndex={tabIndex} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {children}
    </Link>
  );
}

export function HeroSlideView({
  slide,
  lang,
  productCount = 0,
  collage = [],
  eager = false,
  headingLevel = 2,
  inactive = false,
  badge,
}: {
  slide: HeroSlide;
  lang: Lang;
  /** Replaces "{брой}" / "{count}" in the texts. */
  productCount?: number;
  /** Products for the automatic picture of a text-image slide without an image. */
  collage?: CollageProduct[];
  /** The first slide: load its pictures at once. */
  eager?: boolean;
  /** The first slide of the home page carries the page's h1. */
  headingLevel?: 1 | 2;
  /** Off-screen slides of the carousel: their links leave the tab order. */
  inactive?: boolean;
  /** Small label under the product collage (e.g. the gift threshold). */
  badge?: string;
}) {
  const theme = THEMES[slide.theme] ?? THEMES.sunrise;
  const dark = theme.dark;
  // Round the product count down to a "nice" number ("над 29 000 продукта").
  const count = productCount >= 1000 ? Math.floor(productCount / 1000) * 1000 : productCount;
  const text = (v: L10n) =>
    loc(v, lang).replaceAll(COUNT_TOKEN, formatNumber(count, lang)).replaceAll(COUNT_TOKEN_EN, formatNumber(count, lang));
  const tab = inactive ? -1 : undefined;
  const title = text(slide.title);
  const image = loc(slide.image, lang);
  const mobileImage = loc(slide.mobileImage, lang);

  if (slide.layout === "image-only") {
    const frame = mobileImage ? "aspect-[4/5] md:aspect-[21/8]" : "aspect-[21/8]";
    const picture = image ? (
      <picture>
        {mobileImage ? <source media="(max-width: 767px)" srcSet={mobileImage} /> : null}
        <img
          src={image}
          alt={title}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          className={clsx("block w-full object-cover", frame)}
        />
      </picture>
    ) : (
      <div className={clsx("grid place-items-center text-muted", frame)}>
        <span className="flex flex-col items-center gap-2 text-lg font-semibold">
          <ImageIcon className="h-8 w-8" aria-hidden />
          {getDict(lang).home.heroNoImage}
        </span>
      </div>
    );
    return (
      <div className="h-full overflow-hidden rounded-[var(--radius-xl)]" style={{ background: theme.background }}>
        {slide.href && image ? (
          <SmartLink href={slide.href} lang={lang} tabIndex={tab} className="block h-full">
            {picture}
          </SmartLink>
        ) : (
          picture
        )}
      </div>
    );
  }

  const H = headingLevel === 1 ? "h1" : "h2";
  const eyebrow = text(slide.eyebrow);
  const highlight = text(slide.highlight);
  const body = text(slide.text);
  const primary = { label: text(slide.primary.label), href: slide.primary.href };
  const secondary = { label: text(slide.secondary.label), href: slide.secondary.href };
  const tiles = collage.slice(0, 4);

  return (
    <div
      className={clsx("relative h-full overflow-hidden rounded-[var(--radius-xl)] px-5 py-8 sm:px-8 md:px-16 md:py-12", dark ? "on-dark text-white" : "text-ink")}
      style={{ background: theme.background }}
    >
      {/* md:px-16 keeps the text clear of the carousel's 44 px arrows (left-3), which sit over the slide from md up.
          Decoration: a slanted colour block behind the picture (hot orange on light themes, a faint white one on dark). */}
      <span
        className={clsx(
          "pointer-events-none absolute inset-y-0 -right-16 hidden w-[44%] -skew-x-[14deg] lg:block",
          dark ? "bg-white/[0.07]" : "bg-accent",
        )}
        aria-hidden
      />
      <div className="relative grid h-full grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div>
          {eyebrow ? (
            <p
              className={clsx(
                "inline-flex max-w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1 text-[0.75rem] font-extrabold uppercase tracking-[0.06em]",
                dark ? "bg-white text-ink" : "bg-ink text-white",
              )}
            >
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{eyebrow}</span>
            </p>
          ) : null}
          {/* Sentence-case title of any length: Inter Black (.h-title). */}
          <H className="h-title mt-4 break-words text-[1.85rem] min-[400px]:text-[2rem] sm:text-[2.6rem] lg:text-[2.85rem] xl:text-[3.25rem]">
            {title}
            {highlight ? (
              <>
                {" "}
                <span style={{ color: theme.highlight }}>{highlight}</span>
              </>
            ) : null}
          </H>
          {body ? <p className={clsx("mt-4 max-w-xl text-base leading-relaxed md:text-lg", dark ? "text-white" : "text-ink-soft")}>{body}</p> : null}
          {(primary.label && primary.href) || (secondary.label && secondary.href) ? (
            <div className="mt-7 flex flex-wrap gap-3">
              {primary.label && primary.href ? (
                <SmartLink href={primary.href} lang={lang} tabIndex={tab} className={clsx("btn h-12 px-6 text-[0.95rem] md:h-14 md:px-8", dark ? (slide.theme === "brand" ? "btn-dark" : "btn-energy") : "btn-primary")}>
                  {primary.label} <ArrowRight className="h-5 w-5" aria-hidden />
                </SmartLink>
              ) : null}
              {secondary.label && secondary.href ? (
                <SmartLink
                  href={secondary.href}
                  lang={lang}
                  tabIndex={tab}
                  className={clsx("btn h-12 px-6 text-[0.95rem] md:h-14 md:px-7", dark ? "border-white text-white hover:bg-white/10" : "btn-outline bg-surface")}
                >
                  {secondary.label}
                </SmartLink>
              ) : null}
            </div>
          ) : null}
        </div>

        {image ? (
          <picture className="relative mx-auto block w-full max-w-[560px]">
            {mobileImage ? <source media="(max-width: 767px)" srcSet={mobileImage} /> : null}
            <img
              src={image}
              alt=""
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : undefined}
              decoding="async"
              className="max-h-56 w-full rounded-[var(--radius-lg)] object-contain sm:max-h-72 lg:max-h-[420px]"
            />
          </picture>
        ) : tiles.length ? (
          <div className="relative mx-auto w-full max-w-[520px] lg:pb-5">
            <ul className="grid grid-cols-4 gap-2.5 sm:gap-4 lg:grid-cols-2">
              {tiles.map((p, i) => (
                <li key={p.id} className={clsx("transition duration-300 lg:hover:rotate-0", TILT[i])}>
                  <Link
                    href={localizeHref(`/produkt/${p.slug}`, lang)}
                    tabIndex={tab}
                    className="group relative block aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface p-2.5 shadow-[var(--shadow-lift)] sm:p-4 lg:p-6"
                  >
                    <ProductImage src={p.image} alt={p.name} eager={eager} />
                  </Link>
                </li>
              ))}
            </ul>
            {badge ? (
              // Left-aligned on phones: centred it reached into the bottom-right corner where the chat bubble sits.
              <p className="mt-4 flex w-fit max-w-full items-center gap-2 rounded-[var(--radius-md)] bg-ink px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow-lift)] sm:mx-auto lg:absolute lg:-bottom-1 lg:left-1/2 lg:mt-0 lg:-translate-x-1/2 lg:whitespace-nowrap">
                <Gift className="h-4 w-4 text-accent" aria-hidden />
                {badge}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
