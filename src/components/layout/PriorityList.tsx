"use client";

import { useLayoutEffect, useRef } from "react";
import clsx from "clsx";

/**
 * A one-line list of nav links that shows only the items that fit (GymBeam's row of category names in the nav bar):
 * items that would wrap onto a second line get `hidden`, so they are neither visible nor focusable. Re-measured on
 * every resize. Server-rendered with everything visible and clipped to one line (no flash of a second row).
 */
export function PriorityList({ className, children, label }: { className?: string; children: React.ReactNode; label?: string }) {
  const ref = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const fit = () => {
      const items = Array.from(ul.children) as HTMLElement[];
      for (const li of items) li.hidden = false;
      const top = items[0]?.offsetTop ?? 0;
      for (const li of items) if (li.offsetTop > top + 2) li.hidden = true;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(ul);
    return () => ro.disconnect();
  }, []);

  return (
    <ul ref={ref} aria-label={label} className={clsx("flex max-h-11 min-w-0 flex-wrap items-center overflow-hidden", className)}>
      {children}
    </ul>
  );
}
