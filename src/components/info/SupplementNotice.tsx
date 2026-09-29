"use client";

// The mandatory food-supplement statements on every supplement's product page (Directive 2002/46/EC Art. 6;
// Наредба за хранителните добавки чл. 14, ал. 2–3; legal-content.md C.7.1): the designation „Хранителна добавка“,
// the recommended daily dose (when known), "do not exceed the recommended daily dose", "not a substitute for a
// varied diet", "keep out of reach of young children" and the BFSA registration number (when known).
// [ЮРИСТ] The Bulgarian wording is the legally required one; the English rows are a courtesy translation.
import { clsx } from "clsx";
import { Info } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict } from "@/i18n/client";

export function SupplementNotice({
  isSupplement,
  dose,
  regNo,
  className,
}: {
  isSupplement: boolean;
  /** Recommended daily dose ("1 капсула дневно"); shown when known. */
  dose?: string | null;
  /** BFSA (БАБХ) registration number and date; shown when known. */
  regNo?: string | null;
  className?: string;
}) {
  const t = useDict().info.supplement;
  if (!isSupplement) return null;
  const doseText = dose?.trim().replace(/[.\s]+$/, "");
  const statements = [t.doNotExceed, t.notSubstitute, t.keepAway];
  return (
    <section
      aria-label={t.label.replace(/\.$/, "")}
      className={clsx("rounded-md border border-primary/20 bg-primary-50/60 p-4 text-sm leading-relaxed", className)}
    >
      <p className="flex items-center gap-2 font-bold text-ink">
        <Info className="h-4.5 w-4.5 shrink-0 text-primary" aria-hidden />
        {t.label}
      </p>
      {doseText ? <p className="mt-2 font-medium text-ink">{fmt(t.dailyDose, { dose: doseText })}</p> : null}
      <ul className="mt-2 space-y-1 text-ink-soft">
        {statements.map((s) => (
          <li key={s} className="flex gap-2">
            <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{s}</span>
          </li>
        ))}
      </ul>
      {regNo?.trim() ? <p className="mt-2.5 text-xs text-muted">{fmt(t.regNo, { no: regNo.trim() })}</p> : null}
    </section>
  );
}
