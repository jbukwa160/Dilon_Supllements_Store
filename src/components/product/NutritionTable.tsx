// Nutrition information of a product label: per serving (the recommended daily dose), per 100 g / ml and % of the
// nutrient reference value (NRV / ХСП, Reg. 1169/2011 Annex XIII). Columns without any value are left out. No hooks.
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { NutritionRow } from "@/lib/catalog-types";

export function NutritionTable({ rows, servingSize, lang }: { rows: NutritionRow[]; servingSize?: string; lang: Lang }) {
  if (!rows.length) return null;
  const t = getDict(lang).product;
  const hasServing = rows.some((r) => r.perServing.trim());
  const has100 = rows.some((r) => r.per100.trim());
  const hasNrv = rows.some((r) => r.nrv.trim());
  const cell = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";
  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[20rem] border-collapse bg-surface text-[0.9rem]">
          <caption className="sr-only">{t.nutritionTable.caption}</caption>
          <thead className="bg-canvas text-left text-[0.8rem] font-semibold text-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5">
                {t.nutritionTable.name}
              </th>
              {hasServing ? (
                <th scope="col" className="px-3 py-2.5 text-right">
                  {servingSize ? fmt(t.nutritionTable.perServingSize, { size: servingSize }) : t.nutritionTable.perServing}
                </th>
              ) : null}
              {has100 ? (
                <th scope="col" className="px-3 py-2.5 text-right">
                  {t.nutritionTable.per100}
                </th>
              ) : null}
              {hasNrv ? (
                <th scope="col" className="px-3 py-2.5 text-right">
                  {t.nrv}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <th scope="row" className="px-3 py-2.5 text-left font-medium">
                  {r.name}
                </th>
                {hasServing ? <td className={cell}>{r.perServing || "—"}</td> : null}
                {has100 ? <td className={cell}>{r.per100 || "—"}</td> : null}
                {hasNrv ? <td className={cell}>{r.nrv || "—"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasNrv ? <p className="mt-2 text-xs text-muted">{t.nrvNote}</p> : null}
    </div>
  );
}
