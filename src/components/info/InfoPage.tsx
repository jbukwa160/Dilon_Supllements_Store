// Layout of the info / legal pages: breadcrumbs, title, lead text, "last updated", a table of contents (sticky
// sidebar on desktop, collapsible on phones) and the sections as readable cards. Server component.
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { InfoToc } from "./InfoToc";
import type { LegalSection } from "./prose";

/**
 * Typography of long legal texts (applied to every section body): 17px text, relaxed leading, a line length of
 * ~70 characters, pine links, calm bullets. Children use plain <p>, <ul>, <ol>, <h3>, <strong>, <a>.
 */
export const LEGAL_PROSE = clsx(
  "text-base leading-[1.75] text-ink-soft md:text-[1.0625rem]",
  "[&>*+*]:mt-3.5",
  "[&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_li]:pl-1 [&_li]:marker:text-primary",
  "[&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:leading-snug [&_h3]:text-ink",
  "[&_strong]:font-semibold [&_strong]:text-ink",
  "[&_a:not(.btn)]:font-semibold [&_a:not(.btn)]:text-primary [&_a:not(.btn)]:underline [&_a:not(.btn)]:decoration-primary/35 [&_a:not(.btn)]:underline-offset-[3px] [&_a:not(.btn):hover]:decoration-primary",
);

/** A section card (also used by pages that compose their own content). */
export function InfoSection({ id, title, children, className }: { id?: string; title?: string; children: React.ReactNode; className?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={clsx("card scroll-mt-20 p-5 sm:p-6 md:p-8", className)}>
      {title ? (
        <h2 id={headingId} className="text-[1.2rem] font-bold leading-snug tracking-[-0.01em] text-ink md:text-[1.4rem]">
          {title}
        </h2>
      ) : null}
      <div className={clsx(LEGAL_PROSE, title && "mt-3.5")}>{children}</div>
    </section>
  );
}

export function InfoPage({
  lang,
  title,
  intro,
  updated,
  sections = [],
  before,
  children,
  toc = true,
  wide = false,
}: {
  lang: Lang;
  title: string;
  /** Lead paragraph under the title. */
  intro?: React.ReactNode;
  /** Formatted revision date ("Последна актуализация: …"). */
  updated?: string;
  sections?: LegalSection[];
  /** Content above the sections (price cards, call-to-action…). */
  before?: React.ReactNode;
  /** Content after the sections. */
  children?: React.ReactNode;
  /** Table of contents (shown when there are at least 4 sections). */
  toc?: boolean;
  /** Use the full container width for the content (pages with their own grid, e.g. a form + a sidebar). */
  wide?: boolean;
}) {
  const t = getDict(lang).info;
  const items = sections.map((s) => ({ id: s.id, title: s.title }));
  const showToc = toc && items.length >= 4;

  return (
    <div className="container-shop pb-16 md:pb-20">
      <Breadcrumbs items={[{ label: title }]} />
      <header className="max-w-3xl pb-6 pt-1 md:pb-9">
        <h1 className="h-display text-[1.65rem] sm:text-3xl md:text-[2.5rem]">{title}</h1>
        {intro ? <div className="mt-4 text-[1.0625rem] leading-relaxed text-ink-soft md:text-xl md:leading-relaxed">{intro}</div> : null}
        {updated ? <p className="mt-3 text-sm text-muted">{fmt(t.lastUpdated, { date: updated })}</p> : null}
      </header>

      <div className={clsx(showToc && "lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-10 xl:gap-14")}>
        {showToc ? (
          <aside className="hidden lg:block">
            <div className="sticky top-40 max-h-[calc(100vh-11rem)] overflow-y-auto pb-4 pr-1">
              <InfoToc items={items} label={t.toc} />
            </div>
          </aside>
        ) : null}

        <div className={clsx("min-w-0 space-y-4 md:space-y-5", !wide && "max-w-3xl")}>
          {showToc ? (
            <details className="card group lg:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-bold [&::-webkit-details-marker]:hidden">
                {t.toc}
                <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <nav aria-label={t.toc} className="border-t border-line px-5 py-3">
                <ol className="space-y-0.5">
                  {items.map((i) => (
                    <li key={i.id}>
                      <a href={`#${i.id}`} className="block rounded-sm py-2.5 text-[0.95rem] leading-snug text-ink-soft hover:text-primary">
                        {i.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </details>
          ) : null}

          {before}

          {sections.map((s) => (
            <InfoSection key={s.id} id={s.id} title={s.title}>
              {s.body}
            </InfoSection>
          ))}

          {children}
        </div>
      </div>
    </div>
  );
}
