"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { fmt } from "@/i18n";
import { useLang } from "@/i18n/client";
import { FacetLink, type FacetOption } from "./FacetLink";

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

/**
 * A long filter group (brands, flavours): the first `limit` options (selected ones always stay visible), "+ Още N"
 * to show the rest, and a search box that filters the whole list as you type. The options are server-built links.
 */
export function FacetList({
  options,
  limit = 10,
  searchLabel,
  moreLabel,
  lessLabel,
  noMatch,
}: {
  options: FacetOption[];
  limit?: number;
  /** Placeholder / label of the search box (shown when the list is longer than `limit`). */
  searchLabel?: string;
  /** "+ Още {n} марки" */
  moreLabel: string;
  lessLabel: string;
  noMatch: string;
}) {
  const lang = useLang();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const needle = norm(query);

  let shown: FacetOption[];
  if (needle) shown = options.filter((o) => norm(o.label).includes(needle));
  else if (expanded) shown = options;
  else shown = options.filter((o, i) => i < limit || o.selected);
  const hidden = options.length - shown.length;

  return (
    <div>
      {searchLabel && options.length > limit ? (
        <div className="relative mb-2">
          <label htmlFor={inputId} className="sr-only">
            {searchLabel}
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchLabel}
            autoComplete="off"
            className="field h-10 py-1.5 pl-9 lg:text-sm"
          />
        </div>
      ) : null}
      <div className="space-y-0.5">
        {shown.map((o) => (
          <FacetLink key={o.key} option={o} lang={lang} />
        ))}
        {needle && !shown.length ? <p className="px-1.5 py-2 text-sm text-muted">{noMatch}</p> : null}
      </div>
      {!needle && (hidden > 0 || expanded) && options.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 rounded-sm px-1.5 py-1.5 text-sm font-bold text-primary hover:underline"
        >
          {expanded ? lessLabel : fmt(moreLabel, { n: hidden })}
        </button>
      ) : null}
    </div>
  );
}
