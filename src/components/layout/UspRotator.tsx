"use client";

import { Children, useEffect, useState } from "react";
import clsx from "clsx";

const INTERVAL_MS = 5000;

/**
 * The top bar's messages on small screens: one at a time, the next every 5 s. Paused while hovered, focused or
 * touched; not announced while it rotates. With "reduce motion" the swap is instant (globals.css drops transitions).
 */
export function UspRotator({ children, className }: { children: React.ReactNode; className?: string }) {
  const items = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  if (!count) return null;
  return (
    <div
      className={clsx("relative grid min-w-0", className)}
      aria-live={paused ? "polite" : "off"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {items.map((item, i) => {
        const shown = i === index % count;
        return (
          <div
            key={i}
            aria-hidden={!shown}
            inert={!shown}
            className={clsx(
              "col-start-1 row-start-1 flex min-w-0 items-center justify-center transition-[opacity,transform] duration-300 ease-out",
              shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
            )}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
