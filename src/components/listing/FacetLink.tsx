// One option of a listing filter: a server-rendered link that toggles the option (checkbox look; `radio` for
// single-choice groups such as the price range). Options with no results are shown greyed out and not linked.
// No hooks: used by the server-rendered sidebar and by the client-side FacetList.
import Link from "next/link";
import clsx from "clsx";
import type { Lang } from "@/i18n/config";
import { formatNumber } from "@/lib/format";

export type FacetOption = { key: string; label: string; count: number | null; selected: boolean; href: string };

export function FacetLink({ option: o, lang, radio = false }: { option: FacetOption; lang: Lang; radio?: boolean }) {
  const disabled = !o.selected && o.count === 0;
  const box = (
    <span
      aria-hidden
      className={clsx(
        "grid h-5 w-5 shrink-0 place-items-center border-[1.5px] transition",
        radio ? "rounded-pill" : "rounded-[3px]",
        o.selected ? "border-primary bg-primary text-white" : "border-[#858585] bg-surface group-hover:border-ink",
      )}
    >
      {o.selected ? (
        radio ? (
          <span className="h-2 w-2 rounded-pill bg-white" />
        ) : (
          <svg viewBox="0 0 12 12" className="h-3 w-3">
            <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      ) : null}
    </span>
  );
  const body = (
    <>
      {box}
      <span className="min-w-0 flex-1 leading-snug wrap-break-word">{o.label}</span>
      {o.count != null ? <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{formatNumber(o.count, lang)}</span> : null}
    </>
  );
  const cls = "group flex min-h-10 items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-[0.93rem] lg:min-h-9";
  if (disabled) {
    return (
      <span aria-disabled="true" className={clsx(cls, "cursor-default text-ink/60 opacity-50")}>
        {body}
      </span>
    );
  }
  return (
    <Link
      href={o.href}
      scroll={false}
      prefetch={false}
      rel="nofollow"
      aria-current={o.selected ? "true" : undefined}
      className={clsx(cls, "transition hover:bg-canvas", o.selected ? "font-semibold text-ink" : "text-ink-soft hover:text-ink")}
    >
      {body}
    </Link>
  );
}
