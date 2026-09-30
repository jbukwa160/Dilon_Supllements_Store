"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";

export type ShelfTab = {
  key: string;
  label: string;
  /** Language-neutral "see all" link of the tab. */
  href: string;
  /** The tab's product row (server-rendered <li> cards). */
  children: React.ReactNode;
};

/**
 * Home page product shelves as tabs ("Най-продавани / Горещи оферти / Нови"), as on XXL Nutrition / fitness1: a tab bar
 * with an orange underline, one swipeable row of cards per tab (2 visible on phones, 3 on tablets, 4–5 on desktop) and
 * prev / next arrows from `md`. All panels are in the HTML (inactive ones `hidden`), so crawlers still see every product.
 * Keyboard: ← → / Home / End move between the tabs (automatic activation).
 */
export function ShelfTabs({ title, tabs }: { title: string; tabs: ShelfTab[] }) {
  const dict = useDict();
  const lang = useLang();
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const rows = useRef<Record<string, HTMLUListElement | null>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!current) return null;

  const scrollBy = (dir: 1 | -1) => {
    const row = rows.current[current.key];
    if (!row) return;
    row.scrollBy({ left: dir * row.clientWidth * 0.9, behavior: "smooth" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.key === current.key);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(tabs[next].key);
    tabRefs.current[tabs[next].key]?.focus();
  };

  return (
    <section aria-labelledby={`${base}-title`} className="container-shop py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id={`${base}-title`} className="h-display text-[1.25rem] md:text-[1.625rem]">
          {title}
        </h2>
        <div className="hidden items-center gap-2 md:flex">
          <button type="button" onClick={() => scrollBy(-1)} className="grid h-10 w-10 place-items-center rounded-pill border border-line bg-surface transition hover:border-ink" aria-label={dict.common.previous}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => scrollBy(1)} className="grid h-10 w-10 place-items-center rounded-pill border border-line bg-surface transition hover:border-ink" aria-label={dict.common.next}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4 border-b border-line">
        <div role="tablist" aria-labelledby={`${base}-title`} className="-mb-px flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]" onKeyDown={onKeyDown}>
          {tabs.map((t) => {
            const on = t.key === current.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`${base}-panel-${t.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(t.key)}
                className={clsx(
                  "min-h-11 shrink-0 whitespace-nowrap border-b-[3px] px-3 pb-2 pt-2.5 text-[0.85rem] font-extrabold uppercase tracking-[0.02em] transition md:px-4 md:text-[0.92rem]",
                  on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <Link
          href={localizeHref(current.href, lang)}
          className="mb-1 hidden min-h-10 shrink-0 items-center gap-1 text-sm font-extrabold uppercase tracking-[0.02em] text-ink hover:text-primary hover:underline sm:inline-flex"
        >
          {dict.common.seeAll} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`${base}-panel-${t.key}`} aria-labelledby={`${base}-tab-${t.key}`} hidden={t.key !== current.key} className="pt-5">
          <ul
            ref={(el) => {
              rows.current[t.key] = el;
            }}
            className="shelf-row -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 md:scroll-px-0"
          >
            {t.children}
          </ul>
          <Link
            href={localizeHref(t.href, lang)}
            className="btn btn-outline mt-5 w-full sm:hidden"
          >
            {dict.common.seeAll} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ))}
    </section>
  );
}
