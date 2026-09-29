"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";

export type TocItem = { id: string; title: string };

/**
 * Table of contents of a legal page (desktop sidebar): anchor links to the sections, with the section being read
 * highlighted (the last one whose top has passed a line under the sticky header). Works without JavaScript as plain
 * anchor links.
 */
export function InfoToc({ items, label }: { items: TocItem[]; label: string }) {
  const [active, setActive] = useState<string | null>(null);
  // A stable dependency: the ids only change when the page does.
  const ids = items.map((i) => i.id).join(" ");

  useEffect(() => {
    const sections = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!sections.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = Math.min(window.innerHeight * 0.35, 300);
      let current: string | null = null;
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
        else break;
      }
      // Scrolled to the very bottom: the last section, even if it is too short to reach the line.
      const doc = document.documentElement;
      if (current && window.innerHeight + window.scrollY >= doc.scrollHeight - 4) current = sections[sections.length - 1].id;
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);

  return (
    <nav aria-label={label}>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <ol className="mt-3 border-l border-line">
        {items.map((i) => {
          const current = active === i.id;
          return (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                aria-current={current ? "location" : undefined}
                className={clsx(
                  "-ml-px block rounded-r-sm border-l-2 py-1.5 pl-4 pr-2 text-sm leading-snug transition-colors",
                  current ? "border-primary bg-primary-50/70 font-semibold text-primary-700" : "border-transparent text-muted hover:border-ink/30 hover:text-ink",
                )}
              >
                {i.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
