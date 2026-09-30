"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useDict } from "@/i18n/client";

export type ProductSection = { id: string; title: string; content: React.ReactNode };

/**
 * The information sections of a product page. Phones and tablets: an accordion (the first section open). Desktop:
 * tabs (GymBeam) — one section at a time; the others stay in the HTML (display: none from lg). The contents are server-rendered and passed in; only
 * sections that have content are given.
 */
export function ProductSections({ sections }: { sections: ProductSection[] }) {
  const t = useDict().product.sections;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(sections.slice(0, 1).map((s) => s.id)));
  const [tab, setTab] = useState(sections[0]?.id ?? "");
  if (!sections.length) return null;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const current = sections.find((s) => s.id === tab)?.id ?? sections[0].id;
  const onTabKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = sections.findIndex((s) => s.id === current);
    const next =
      e.key === "ArrowRight" ? (i + 1) % sections.length : e.key === "ArrowLeft" ? (i - 1 + sections.length) % sections.length : e.key === "Home" ? 0 : e.key === "End" ? sections.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(sections[next].id);
    document.getElementById(`${sections[next].id}-tab`)?.focus();
  };

  return (
    <div className="mt-10 md:mt-14">
      {/* Desktop: GymBeam-style tabs (one section at a time, orange underline). */}
      {sections.length > 1 ? (
        <div role="tablist" aria-label={t.nav} onKeyDown={onTabKeys} className="mb-6 hidden gap-x-2 border-b border-line lg:flex">
          {sections.map((s) => {
            const on = s.id === current;
            return (
              <button
                key={s.id}
                id={`${s.id}-tab`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={s.id}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(s.id)}
                className={clsx(
                  "-mb-px inline-flex min-h-12 items-center border-b-[3px] px-3 text-[0.88rem] font-extrabold uppercase tracking-[0.02em] transition",
                  on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {s.title}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface lg:divide-y-0 lg:overflow-visible lg:border-0 lg:bg-transparent">
        {sections.map((s) => {
          const expanded = open.has(s.id);
          const shown = s.id === current || sections.length === 1;
          return (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-h`}
              className={clsx("scroll-mt-20 lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:p-8", !shown && "lg:hidden")}
            >
              {/* Desktop: a plain heading; phones / tablets: the heading is the accordion button (only one is displayed). */}
              <h2 id={`${s.id}-h`} className="mb-4 hidden text-xl font-extrabold uppercase tracking-[-0.01em] lg:block">
                {s.title}
              </h2>
              <h2 className="text-base font-extrabold uppercase lg:hidden">
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-expanded={expanded}
                  aria-controls={`${s.id}-c`}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left md:px-6"
                >
                  {s.title}
                  <ChevronDown className={clsx("h-5 w-5 shrink-0 text-muted transition", expanded && "rotate-180")} aria-hidden />
                </button>
              </h2>
              <div id={`${s.id}-c`} className={clsx("px-4 pb-5 md:px-6 lg:block lg:p-0", expanded ? "block" : "hidden")}>
                {s.content}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
