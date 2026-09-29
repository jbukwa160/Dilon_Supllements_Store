"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useDict } from "@/i18n/client";

export type ProductSection = { id: string; title: string; content: React.ReactNode };

/**
 * The information sections of a product page. Phones and tablets: an accordion (the first section open). Desktop:
 * every section expanded, with a row of anchor links on top. The contents are server-rendered and passed in; only
 * sections that have content are given.
 */
export function ProductSections({ sections }: { sections: ProductSection[] }) {
  const t = useDict().product.sections;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(sections.slice(0, 1).map((s) => s.id)));
  if (!sections.length) return null;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-10 md:mt-14">
      {sections.length > 1 ? (
        <nav aria-label={t.nav} className="mb-6 hidden border-b border-line lg:block">
          <ul className="-mb-px flex flex-wrap gap-x-6">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-12 items-center border-b-[3px] border-transparent text-[0.85rem] font-extrabold uppercase tracking-[0.02em] text-ink transition hover:border-primary hover:text-primary"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface lg:divide-y-0 lg:overflow-visible lg:border-0 lg:bg-transparent">
        {sections.map((s) => {
          const expanded = open.has(s.id);
          return (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20 lg:mb-6 lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:p-8">
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
