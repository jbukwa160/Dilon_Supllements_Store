"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict } from "@/i18n/client";
import { Dialog } from "@/components/ui/Dialog";
import { ProductImage } from "./ProductImage";

/**
 * Product photos: a swipeable snap-scroll strip (phones swipe, dots show the position), thumbnails from `md`, and a
 * zoom dialog with previous / next. The first photo loads eagerly (it is the page's largest image). `badges` are
 * drawn over the main photo. Remount with a `key` when the product changes.
 */
export function Gallery({ images, alt, badges }: { images: string[]; alt: string; badges?: React.ReactNode }) {
  const t = useDict().product.gallery;
  const list = images.length ? images : [""];
  const many = list.length > 1;
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);

  const go = (i: number) => {
    const el = track.current;
    const next = (i + list.length) % list.length;
    setActive(next);
    el?.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-3" role="region" aria-roledescription="carousel" aria-label={t.label}>
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
        <div
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (i !== active && i >= 0 && i < list.length) setActive(i);
          }}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {list.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setZoom(i)}
              className="aspect-square w-full shrink-0 snap-center cursor-zoom-in p-[7%] md:p-[9%]"
              aria-label={many ? `${t.zoom} — ${fmt(t.photo, { n: i + 1, total: list.length })}` : t.zoom}
              tabIndex={i === active ? 0 : -1}
            >
              <ProductImage src={src || null} alt={i === 0 ? alt : ""} eager={i === 0} />
            </button>
          ))}
        </div>
        {badges ? <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5 md:left-4 md:top-4">{badges}</div> : null}
        <button
          type="button"
          onClick={() => setZoom(active)}
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-pill border border-line bg-surface/90 text-ink transition hover:border-ink md:right-4 md:top-4"
          aria-label={t.zoom}
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
        </button>
        {many ? (
          <>
            <button
              type="button"
              onClick={() => go(active - 1)}
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-pill border border-line bg-surface/90 hover:border-ink md:grid"
              aria-label={t.prev}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(active + 1)}
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-pill border border-line bg-surface/90 hover:border-ink md:grid"
              aria-label={t.next}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
              {list.map((src, i) => (
                <span key={`${src}-${i}`} className={clsx("h-1.5 rounded-pill transition-all", i === active ? "w-5 bg-ink" : "w-1.5 bg-ink/25")} />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {many ? (
        <div className="hidden gap-2 overflow-x-auto pb-1 md:flex">
          {list.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => go(i)}
              className={clsx(
                "h-20 w-20 shrink-0 rounded-md border-[1.5px] bg-surface p-1.5 transition",
                i === active ? "border-primary" : "border-line hover:border-ink",
              )}
              aria-label={fmt(t.photo, { n: i + 1, total: list.length })}
              aria-current={i === active ? "true" : undefined}
            >
              <ProductImage src={src || null} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      <Dialog open={zoom !== null} onClose={() => setZoom(null)} title={alt} size="lg">
        {zoom !== null ? (
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="relative w-full">
              <div className="mx-auto aspect-square max-h-[70dvh] w-full max-w-[70dvh] bg-surface">
                <ProductImage src={list[zoom] || null} alt={alt} eager />
              </div>
              {many ? (
                <>
                  <button
                    type="button"
                    onClick={() => setZoom((zoom - 1 + list.length) % list.length)}
                    className="absolute left-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-pill border border-line bg-surface hover:border-ink"
                    aria-label={t.prev}
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom((zoom + 1) % list.length)}
                    className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-pill border border-line bg-surface hover:border-ink"
                    aria-label={t.next}
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                </>
              ) : null}
            </div>
            {many ? (
              <p className="text-sm tabular-nums text-muted" aria-live="polite">
                {fmt(t.photo, { n: zoom + 1, total: list.length })}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
