import clsx from "clsx";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import type { PriceHistoryRow } from "@/lib/admin/products";
import { formatDateTime, formatPrice } from "@/lib/format";

/**
 * Every change of the price the customer paid (store.db price_history, newest first). This is what the
 * "lowest price in the last 30 days" (Omnibus) next to a discount is computed from.
 */
export function PriceHistory({ rows, total }: { rows: PriceHistoryRow[]; total: number }) {
  if (!rows.length) return <p className="text-sm text-muted">Още няма записани цени.</p>;
  return (
    <details className="group rounded-2xl border border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
        История на цената
        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-muted">{total === 1 ? "1 запис" : `${total.toLocaleString("bg-BG")} записа`}</span>
        <ChevronDown className="ml-auto h-4 w-4 text-muted transition group-open:rotate-180" />
      </summary>
      <table className="w-full border-t border-line text-left text-sm">
        <thead className="bg-canvas text-xs font-extrabold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2">От</th>
            <th className="px-4 py-2 text-right">Цена</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => {
            const prev = rows[i + 1]?.price;
            const dir = prev === undefined || Math.abs(prev - r.price) < 0.001 ? 0 : r.price < prev ? -1 : 1;
            return (
              <tr key={`${r.at}-${i}`}>
                <td className="px-4 py-2 text-ink-soft">{formatDateTime(r.at, "bg")}</td>
                <td className={clsx("px-4 py-2 text-right font-bold", dir < 0 && "text-mint", dir > 0 && "text-brand")}>
                  <span className="inline-flex items-center gap-1">
                    {dir < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-label="намаление" /> : dir > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-label="увеличение" /> : null}
                    {formatPrice(r.price, "bg")}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {total > rows.length ? <p className="border-t border-line px-4 py-2 text-xs text-muted">Показани са последните {rows.length} промени.</p> : null}
    </details>
  );
}
