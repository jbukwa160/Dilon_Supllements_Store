// The promo tiles under the hero. Also rendered by the admin's preview (Начална страница): no server-only code, no hooks.
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import type { Lang } from "@/i18n/config";
import { loc } from "@/lib/l10n";
import { isExternalHref, localizeHref } from "@/lib/links";
import { THEMES, type PromoCard } from "@/lib/settings-types";
import { ProductImage } from "@/components/product/ProductImage";

/**
 * Up to 6 themed cards (title, text, button, picture in a circle). A card without an uploaded picture shows
 * `autoImage[card.id]` (the home page fills it with the linked category's / goal's / brand's picture).
 * Phones: a swipeable row; from `md` a grid.
 */
export function PromoCards({ promos, lang, autoImage = {} }: { promos: PromoCard[]; lang: Lang; autoImage?: Record<string, string | null> }) {
  const shown = promos.filter((p) => p.enabled && loc(p.title, lang));
  if (!shown.length) return null;
  const n = shown.length;
  return (
    <ul
      className={clsx(
        // Phones and tablets: a swipeable row (the container's side padding moves into the row); desktop: a grid.
        "-mx-4 grid auto-cols-[84%] grid-flow-col gap-3 overflow-x-auto px-4 pb-1 [scroll-snap-type:x_mandatory] scroll-px-4 sm:auto-cols-[60%] md:-mx-6 md:auto-cols-[46%] md:gap-4 md:px-6 md:scroll-px-6",
        "lg:mx-0 lg:auto-cols-auto lg:grid-flow-row lg:overflow-visible lg:px-0 lg:pb-0 lg:scroll-px-0",
        n === 1 ? "lg:grid-cols-1" : n === 2 || n === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3",
        n === 4 && "xl:grid-cols-4",
      )}
    >
      {shown.map((c) => {
        const theme = THEMES[c.theme] ?? THEMES.sunrise;
        const image = c.image || autoImage[c.id] || null;
        const title = loc(c.title, lang);
        const text = loc(c.text, lang);
        const button = loc(c.buttonLabel, lang);
        const external = isExternalHref(c.href);
        const body = (
          <>
            <span className={clsx("relative z-10 flex flex-col justify-center", image ? "max-w-[58%]" : "max-w-[64%]")}>
              <span className="text-[1.4rem] font-black uppercase leading-[1.02] tracking-[-0.02em] md:text-[1.6rem] xl:text-[1.9rem]">{title}</span>
              {text ? <span className={clsx("mt-2 text-[0.92rem] leading-snug", theme.dark ? "text-white" : "text-ink-soft")}>{text}</span> : null}
              {button ? (
                <span
                  className={clsx(
                    "mt-5 inline-flex min-h-11 w-fit max-w-full items-center gap-1.5 rounded-[var(--radius-md)] px-4 py-2 text-[0.8rem] font-extrabold uppercase tracking-[0.03em]",
                    theme.dark ? "bg-white text-ink" : "bg-primary text-white",
                  )}
                >
                  {button} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              ) : null}
            </span>
            {image ? (
              <span className="absolute -right-[7%] top-1/2 aspect-square w-[46%] max-w-[13rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#ffffff_0%,#ffffff_58%,rgba(255,255,255,0.6)_100%)] p-[7%] transition duration-300 group-hover:scale-105" aria-hidden>
                <ProductImage src={image} alt="" className={c.image ? "" : "mix-blend-multiply"} />
              </span>
            ) : (
              // No picture: the brand's slanted colour block on the right instead.
              <span className={clsx("pointer-events-none absolute inset-y-0 -right-12 w-[34%] -skew-x-[14deg]", theme.dark ? "bg-white/10" : "bg-accent")} aria-hidden />
            )}
          </>
        );
        const cls = clsx(
          "group relative flex h-full min-h-52 overflow-hidden rounded-[var(--radius-xl)] p-6 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] md:min-h-60 md:p-8",
          theme.dark ? "on-dark text-white" : "text-ink",
        );
        return (
          <li key={c.id} className="[scroll-snap-align:start]">
            {c.href ? (
              <Link
                href={localizeHref(c.href, lang)}
                className={cls}
                style={{ background: theme.background }}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener" : undefined}
              >
                {body}
              </Link>
            ) : (
              <div className={cls} style={{ background: theme.background }}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
