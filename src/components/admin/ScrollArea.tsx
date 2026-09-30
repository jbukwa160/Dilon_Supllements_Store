"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { MoveHorizontal } from "lucide-react";

/**
 * A horizontally scrollable box for wide admin tables on phones / tablets, with a visible hint while there is more
 * to see: a line "Плъзнете настрани…" above it and soft fades on the side(s) that hide columns. No hint when the
 * table fits.
 */
export function ScrollArea({ className, wrapperClassName, children }: { className?: string; wrapperClassName?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 2, right: max - el.scrollLeft > 2 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scrollable = edges.left || edges.right;
  return (
    <div className={clsx("min-w-0", wrapperClassName)}>
      {scrollable ? (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted">
          <MoveHorizontal className="h-4 w-4" aria-hidden /> Плъзнете таблицата настрани, за да видите всички колони.
        </p>
      ) : null}
      <div className="relative">
        <div ref={ref} className={clsx("relative overflow-x-auto", className)} tabIndex={scrollable ? 0 : undefined} role={scrollable ? "region" : undefined} aria-label={scrollable ? "Таблица (превърта се настрани)" : undefined}>
          {children}
        </div>
        <span
          className={clsx("pointer-events-none absolute inset-y-px left-px w-8 rounded-l-[inherit] bg-gradient-to-r from-ink/15 to-transparent transition-opacity", edges.left ? "opacity-100" : "opacity-0")}
          aria-hidden
        />
        <span
          className={clsx("pointer-events-none absolute inset-y-px right-px w-8 rounded-r-[inherit] bg-gradient-to-l from-ink/15 to-transparent transition-opacity", edges.right ? "opacity-100" : "opacity-0")}
          aria-hidden
        />
      </div>
    </div>
  );
}
