"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { HeroSlide } from "@/lib/settings-types";
import { HeroSlideView, type CollageProduct } from "./HeroSlideView";

const SWIPE_PX = 50;
const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * Home page banners. All slides share one grid cell (the tallest sets the height, so nothing jumps) and cross-fade.
 * Autoplay every `autoplaySeconds` (0 = off) — paused on hover / focus, by the pause button, and never with
 * "reduce motion". Swipe on touch screens, arrows (md+), dots, ← → keys. Off-screen slides are inert.
 */
export function HeroCarousel({
  slides,
  productCount,
  collage,
  autoplaySeconds,
  badge,
  firstIsH1 = true,
}: {
  slides: HeroSlide[];
  productCount: number;
  collage: CollageProduct[];
  autoplaySeconds: number;
  badge?: string;
  /** The first slide's title is the page's h1 (off when the page renders its own h1). */
  firstIsH1?: boolean;
}) {
  const lang = useLang();
  const dict = useDict();
  const t = dict.home;
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => true,
  );
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);
  const autoplay = count > 1 && autoplaySeconds > 0 && !reduced && !stopped;
  const running = autoplay && !hovered && !focused;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), autoplaySeconds * 1000);
    return () => clearInterval(timer);
  }, [running, count, autoplaySeconds]);

  if (!count) return null;
  if (count === 1) {
    return <HeroSlideView slide={slides[0]} lang={lang} productCount={productCount} collage={collage} badge={badge} headingLevel={firstIsH1 ? 1 : 2} eager />;
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t.heroLabel}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(e) => {
        // ← → on the carousel's own controls; not inside a slide (its links would become inert under the focus).
        if ((e.target as HTMLElement).closest('[aria-roledescription="slide"]')) return;
        if (e.key === "ArrowLeft") go(index - 1);
        else if (e.key === "ArrowRight") go(index + 1);
      }}
    >
      <div
        className="grid touch-pan-y grid-cols-[minmax(0,1fr)]"
        aria-live={running ? "off" : "polite"}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          swiped.current = false;
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y)) {
            swiped.current = true;
            go(index + (dx < 0 ? 1 : -1));
          }
        }}
        onClickCapture={(e) => {
          // A swipe that ends on a link must not follow it.
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={fmt(t.heroSlideOf, { n: i + 1, total: count })}
              aria-hidden={!active}
              inert={!active}
              className={clsx(
                "col-start-1 row-start-1 min-w-0 transition-[opacity,visibility] duration-500 ease-out",
                active ? "visible z-[1] opacity-100" : "invisible opacity-0",
              )}
            >
              <HeroSlideView
                slide={s}
                lang={lang}
                productCount={productCount}
                collage={collage}
                badge={badge}
                headingLevel={i === 0 && firstIsH1 ? 1 : 2}
                eager={i === 0}
                inactive={!active}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => go(index - 1)}
        className="absolute left-3 top-1/2 z-[2] hidden h-11 w-11 -translate-y-[calc(50%+1.25rem)] place-items-center rounded-pill bg-surface/90 text-ink shadow-[var(--shadow-lift)] transition hover:bg-surface md:grid"
        aria-label={t.heroPrev}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        className="absolute right-3 top-1/2 z-[2] hidden h-11 w-11 -translate-y-[calc(50%+1.25rem)] place-items-center rounded-pill bg-surface/90 text-ink shadow-[var(--shadow-lift)] transition hover:bg-surface md:grid"
        aria-label={t.heroNext}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      <div className="mt-2 flex items-center justify-center gap-0.5">
        {autoplaySeconds > 0 && !reduced ? (
          <button
            type="button"
            onClick={() => setStopped((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-pill text-muted hover:bg-surface hover:text-ink"
            aria-label={stopped ? t.heroPlay : t.heroPause}
          >
            {stopped ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          </button>
        ) : null}
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(i)}
            aria-label={fmt(t.heroGoTo, { n: i + 1 })}
            aria-current={i === index ? "true" : undefined}
            className="group grid h-10 min-w-10 place-items-center px-1"
          >
            <span className={clsx("block h-2.5 rounded-pill transition-all", i === index ? "w-8 bg-primary" : "w-2.5 bg-ink/20 group-hover:bg-ink/40")} />
          </button>
        ))}
      </div>
    </section>
  );
}
