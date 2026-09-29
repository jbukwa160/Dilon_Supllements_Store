"use client";

import { TriangleAlert } from "lucide-react";
import { findClaims } from "@/lib/admin/claims";
import type { L10n } from "@/lib/l10n";

const EU_REGISTER = "https://ec.europa.eu/food/food-feed-portal/screen/health-claims/eu-register";

/**
 * Non-blocking warning when marketing texts contain wording food supplements may not use (disease claims,
 * weight-loss promises, "clinically proven", green claims …). Renders nothing when everything is fine.
 */
export function ClaimWarnings({ items }: { items: { label: string; value: L10n | string }[] }) {
  const rows = items.flatMap(({ label, value }) => {
    const texts = typeof value === "string" ? [{ lang: "", text: value }] : [{ lang: "БГ", text: value.bg }, { lang: "EN", text: value.en }];
    return texts.flatMap(({ lang, text }) => findClaims(text).map((hit) => ({ where: lang ? `${label} (${lang})` : label, ...hit })));
  });
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border-2 border-sun bg-sun-soft p-4" role="status">
      <p className="flex items-center gap-2 font-black">
        <TriangleAlert className="h-5 w-5 shrink-0" /> Проверете текста — може да съдържа забранени твърдения
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={i}>
            <b>{r.where}:</b> „{r.match}“ — <span className="text-ink-soft">{r.reason}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-ink-soft">
        Това е само предупреждение — можете да запазите. За хранителни добавки се ползват само разрешените здравни претенции от{" "}
        <a href={EU_REGISTER} target="_blank" rel="noopener noreferrer" className="font-bold text-sky hover:underline">
          регистъра на ЕС
        </a>
        .
      </p>
    </div>
  );
}

/** Small flag for a collapsed list row whose texts contain problem wording. */
export function ClaimFlag({ values }: { values: L10n[] }) {
  const hit = values.some((v) => findClaims(v.bg).length || findClaims(v.en).length);
  return hit ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-sun px-2 py-0.5 text-[0.7rem] font-bold text-ink" title="Текстът може да съдържа забранени здравни твърдения">
      <TriangleAlert className="h-3 w-3" /> Проверете текста
    </span>
  ) : null;
}
