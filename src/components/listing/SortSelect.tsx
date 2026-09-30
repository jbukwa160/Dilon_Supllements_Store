"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useDict } from "@/i18n/client";

/** Sorting of a listing: a native select that navigates to the server-built (already localized) URL of the option. */
export function SortSelect({ value, options }: { value: string; options: { key: string; label: string; href: string }[] }) {
  const router = useRouter();
  const t = useDict().listing;
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="hidden text-sm font-semibold text-muted sm:inline">
        {t.sortLabel}
      </label>
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <select
          id={id}
          value={value}
          aria-label={t.sortLabel}
          onChange={(e) => {
            const opt = options.find((o) => o.key === e.target.value);
            if (opt) router.push(opt.href, { scroll: false });
          }}
          className="h-11 w-full min-w-0 cursor-pointer appearance-none truncate rounded-[var(--radius-md)] border-[1.5px] border-ink bg-surface pl-4 pr-9 text-[0.9rem] font-bold text-ink transition hover:bg-canvas focus:border-primary"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </div>
  );
}
