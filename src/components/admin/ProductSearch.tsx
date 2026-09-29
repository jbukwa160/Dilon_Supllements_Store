"use client";

import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, EyeOff, LoaderCircle, Plus, Search, X } from "lucide-react";
import { findProductsAction, type PickerProduct } from "@/app/admin/_actions/product-search";
import { formatPrice } from "@/lib/format";

/**
 * Search box + result list with an "Добави" button per product (gift tiers, blog product cards).
 * `includeHidden` also finds products hidden in the shop (e.g. samples offered only as threshold gifts).
 */
export function ProductSearch({
  onAdd,
  isAdded = () => false,
  includeHidden = false,
  placeholder = "Търсете по име, код или баркод, напр. Gold Standard Whey",
  addLabel = "Добави",
}: {
  onAdd: (p: PickerProduct) => void;
  isAdded?: (sku: string) => boolean;
  includeHidden?: boolean;
  placeholder?: string;
  addLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: PickerProduct[] } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => start(async () => setResults({ q: term, items: await findProductsAction(term, { includeHidden }) })), 250);
    return () => clearTimeout(t);
  }, [q, includeHidden]);
  const showing = results && results.q === q.trim() && q.trim().length >= 2 ? results.items : null;
  return (
    <div>
      <label className="flex items-center rounded-[0.875rem] border-2 border-line bg-white px-3 focus-within:border-sky">
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin text-muted" /> : <Search className="h-5 w-5 text-muted" />}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent px-2 py-3 outline-none focus-visible:outline-none"
          aria-label="Търсене на продукт за добавяне"
        />
        {q ? (
          <button type="button" onClick={() => setQ("")} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-canvas" aria-label="Изчисти">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>
      {showing ? (
        showing.length ? (
          <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-white" aria-live="polite">
            {showing.map((p) => {
              const added = isAdded(p.sku);
              return (
                <li key={p.sku} className="flex items-center gap-3 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image ?? "/placeholder.svg"} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-lg border border-line object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-bold">{p.name}</span>
                    <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
                      {p.variant ? <span>{p.variant} ·</span> : null}
                      <span>
                        {p.sku} {p.ean ? `· баркод ${p.ean}` : ""} · {formatPrice(p.price, "bg")}
                      </span>
                      {p.stock <= 0 ? <span className="rounded-full bg-sun-soft px-2 py-0.5 font-bold text-ink">изчерпан</span> : null}
                      {p.hidden ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-bold text-white">
                          <EyeOff className="h-3 w-3" /> скрит
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => onAdd(p)}
                    className={clsx("btn h-9 shrink-0 px-4 text-sm", added ? "bg-mint-soft text-mint" : "btn-primary !shadow-none")}
                  >
                    {added ? <Check className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-4 w-4" />} {added ? "Добавен" : addLabel}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 rounded-2xl bg-canvas p-3 text-sm font-bold text-ink-soft">Няма намерени продукти.</p>
        )
      ) : null}
    </div>
  );
}
