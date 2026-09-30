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
  collageOffset = 0,
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
  /** Small label next to the buttons (e.g. the gift threshold). */
  badge?: string;
  /** Position of the slide in the carousel: picks a different trio of collage products per slide. */
  collageOffset?: number;
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
      <div className="h-full overflow-hidden" style={{ background: theme.background }}>
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
  // Three packshots per slide; each slide starts at a different product so the slides don't repeat the same trio.
  const tiles = collage.length ? [0, 1, 2].map((k) => collage[(collageOffset * 3 + k) % collage.length]).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i) : [];

  // GymBeam-style banner: a full-width band in the theme colour, the headline + one or two CTAs on the left and a
  // light "studio" on the right (phones: on top) where the slide's picture — or three popular products — stand on a
  // floor. The studio's slanted left edge echoes the brand's slanted blocks.
  const stage = image ? (
    <picture className="relative block h-full w-full">
      {mobileImage ? <source media="(max-width: 767px)" srcSet={mobileImage} /> : null}
      <img
        src={image}
        alt=""
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain p-4 md:p-8"
      />
    </picture>
  ) : tiles.length ? (
    <ul className="flex h-full items-end justify-center gap-0 px-3 pb-6 pt-5 sm:pb-8 md:px-8 lg:pb-12" aria-label={badge}>
      {tiles.map((p, i) => {
        const center = tiles.length === 3 ? i === 1 : i === 0;
        return (
          // No z-index / transforms here: they would isolate the picture and break its mix-blend-multiply (the white
          // photo background melting into the stage).
          <li key={p.id} className={clsx("min-w-0", center ? "h-[94%] w-[40%]" : "h-[74%] w-[30%]")}>
            <Link href={localizeHref(`/produkt/${p.slug}`, lang)} tabIndex={tab} className="block h-full" title={p.name}>
              <ProductImage src={p.image} alt={p.name} eager={eager} className="mix-blend-multiply" />
            </Link>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div className={clsx("relative flex h-full flex-col overflow-hidden", dark ? "on-dark text-white" : "text-ink")} style={{ background: theme.background }}>
      {/* The studio: phones — a band on top; md+ — the right half with a slanted left edge. */}
      {stage ? (
        <div
          className={clsx(
            "relative h-56 shrink-0 min-[420px]:h-64 sm:h-72 md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[50%] md:[clip-path:polygon(14%_0,100%_0,100%_100%,0_100%)] lg:w-[52%]",
            dark ? "bg-[radial-gradient(ellipse_at_60%_45%,#ffffff_0%,#f1f1f1_55%,#e2e2e2_100%)]" : "bg-[radial-gradient(ellipse_at_60%_45%,#ffffff_0%,#ffffff_45%,#ececec_100%)]",
          )}
        >
          {/* Floor shadow the products stand on. */}
          <span className="pointer-events-none absolute inset-x-[18%] bottom-[5%] h-[9%] rounded-[50%] bg-black/[0.07] blur-md md:inset-x-[26%] lg:bottom-[8%]" aria-hidden />
          <div className="relative h-full md:ml-[12%]">{stage}</div>
        </div>
      ) : null}

      <div className="container-shop relative flex flex-1 items-start md:items-center">
        <div className={clsx("w-full pb-16 pt-6 sm:pb-16 sm:pt-8 md:min-h-[24rem] md:py-12 md:pb-16 lg:min-h-[25rem] xl:min-h-[26rem]", stage ? "md:w-[48%] md:pl-10 md:pr-6 lg:w-[46%] lg:pl-12" : "max-w-3xl md:pl-10 lg:pl-12", "flex flex-col justify-center")}>
          {eyebrow ? (
            <p
              className={clsx(
                "inline-flex w-fit max-w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] md:text-[0.75rem]",
                dark ? "bg-white text-ink" : "bg-ink text-white",
              )}
            >
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{eyebrow}</span>
            </p>
          ) : null}
          {/* Sentence-case banner headline of any length: Inter Black, big (.h-title). */}
          <H className="h-title mt-3 break-words text-[1.8rem] min-[400px]:text-[2rem] sm:text-[2.4rem] md:mt-4 md:text-[2.15rem] lg:text-[2.6rem] xl:text-[3.1rem]">
            {title}
            {highlight ? (
              <>
                {" "}
                <span style={{ color: theme.highlight }}>{highlight}</span>
              </>
            ) : null}
          </H>
          {body ? <p className={clsx("mt-4 hidden max-w-xl text-base leading-relaxed sm:block md:hidden xl:block xl:text-lg", dark ? "text-white" : "text-ink-soft")}>{body}</p> : null}
          {(primary.label && primary.href) || (secondary.label && secondary.href) ? (
            <div className="mt-5 flex flex-wrap gap-3 md:mt-7">
              {primary.label && primary.href ? (
                <SmartLink
                  href={primary.href}
                  lang={lang}
                  tabIndex={tab}
                  className={clsx("btn h-auto min-h-12 max-w-full whitespace-normal px-6 py-2 text-[0.95rem] md:min-h-14 lg:px-8", dark ? (slide.theme === "brand" ? "btn-dark" : "btn-energy") : "btn-primary")}
                >
                  {primary.label} <ArrowRight className="h-5 w-5" aria-hidden />
                </SmartLink>
              ) : null}
              {secondary.label && secondary.href ? (
                <SmartLink
                  href={secondary.href}
                  lang={lang}
                  tabIndex={tab}
                  className={clsx(
                    "btn h-12 px-6 text-[0.95rem] md:h-14 md:px-7",
                    dark ? "border-white text-white hover:bg-white/10" : "btn-outline bg-surface",
                  )}
                >
                  {secondary.label}
                </SmartLink>
              ) : null}
            </div>
          ) : null}
          {badge && !image && tiles.length ? (
            <p className={clsx("mt-5 hidden w-fit items-center gap-2 text-sm font-bold md:flex", dark ? "text-white" : "text-ink")}>
              <Gift className={clsx("h-5 w-5", dark ? "text-white" : "text-primary")} aria-hidden />
              {badge}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
