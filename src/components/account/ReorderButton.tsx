"use client";

import { useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { CartSnapshot } from "@/lib/catalog-types";
import { plural } from "@/lib/format";
import { useCart } from "@/lib/store";
import { useSettings } from "@/components/SettingsProvider";

// "Поръчай отново": puts the paid lines of an old order back in the cart with fresh product data and today's
// prices (GET /api/products). Gifts are not re-added (they are chosen again in the cart); products that are hidden
// or out of stock are listed as no longer available.

type Line = { id: number; qty: number; name: string };
type Result = { kind: "done"; added: number; missing: string[] } | { kind: "none" } | { kind: "error" };

export function ReorderButton({ lines }: { lines: Line[] }) {
  const lang = useLang();
  const d = useDict();
  const t = d.account.orderPage;
  const { add } = useCart();
  const { allowOutOfStockOrders } = useSettings();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function reorder() {
    setBusy(true);
    setResult(null);
    try {
      const ids = [...new Set(lines.map((l) => l.id))].join(",");
      const res = await fetch(`/api/products?ids=${ids}&lang=${lang}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const fresh = (await res.json()) as CartSnapshot[];
      const byId = new Map(fresh.map((p) => [p.id, p]));
      let added = 0;
      const missing: string[] = [];
      for (const l of lines) {
        const p = byId.get(l.id);
        if (!p || p.hidden || (p.stock <= 0 && !allowOutOfStockOrders)) {
          missing.push(l.name);
          continue;
        }
        add(p, l.qty);
        added += l.qty;
      }
      setResult(added ? { kind: "done", added, missing } : { kind: "none" });
    } catch {
      setResult({ kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={reorder} disabled={busy} className="btn btn-primary h-12 w-full sm:w-auto">
        {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <RotateCcw className="h-5 w-5" aria-hidden />}
        {t.reorder}
      </button>
      <div aria-live="polite" className="text-sm">
        {result?.kind === "done" ? (
          <p className="mt-2 font-semibold text-success">
            {fmt(t.reorderDone, { n: plural(lang, result.added, d.account.ordersPage.items) })}
            {result.missing.length ? (
              <span className="mt-1 block font-normal text-muted">{fmt(t.reorderMissing, { names: result.missing.join(", ") })}</span>
            ) : null}
          </p>
        ) : result?.kind === "none" ? (
          <p className="mt-2 font-semibold text-warning">{t.reorderNone}</p>
        ) : result?.kind === "error" ? (
          <p className="mt-2 font-semibold text-sale">{t.reorderError}</p>
        ) : null}
      </div>
    </div>
  );
}
