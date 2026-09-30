"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from "lucide-react";
import type { NutritionRow, ProductKind } from "@/lib/catalog-types";

const EMPTY_ROW: NutritionRow = { name: "", perServing: "", per100: "", nrv: "" };

/** The nutrition declaration of a food, in the order of Reg. (EU) 1169/2011 Annex XV. */
const DECLARATION = ["Енергийна стойност", "Мазнини", "от които наситени мастни киселини", "Въглехидрати", "от които захари", "Белтъчини", "Сол"];

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * The label table: one row per nutrient or active substance, with the amount in the daily dose, per 100 g / 100 ml
 * and the % of the reference intake (NRV). Supplements need the daily dose (and %NRV for vitamins and minerals);
 * protein powders, bars and other foods need the values per 100 g.
 */
export function NutritionEditor({ value, onChange, kind, invalid }: { value: NutritionRow[]; onChange: (rows: NutritionRow[]) => void; kind: ProductKind; invalid?: boolean }) {
  const set = (i: number, patch: Partial<NutritionRow>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const missingDeclaration = DECLARATION.filter((n) => !value.some((r) => r.name.trim().toLowerCase() === n.toLowerCase()));
  const cell = "field !px-2.5 !py-2 text-sm";
  const nameCell = (name: string) => clsx(cell, invalid && !name.trim() && "!border-brand");
  const cols = "grid gap-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_80px_auto] md:items-center";

  return (
    <div>
      {value.length ? (
        <div className="space-y-2">
          <div className={clsx(cols, "hidden text-xs font-extrabold uppercase tracking-wide text-muted md:grid")} aria-hidden>
            <span>Съставка / вещество</span>
            <span>В дневна доза</span>
            <span>На 100 g / 100 ml</span>
            <span>% РСП</span>
            <span className="w-[7.5rem]" />
          </div>
          <ol className="space-y-2">
            {value.map((r, i) => (
              <li key={i} className={clsx(cols, "rounded-2xl border border-line p-2 md:border-0 md:p-0")}>
                <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="напр. Витамин C" maxLength={80} aria-label={`Ред ${i + 1}: съставка`} className={nameCell(r.name)} />
                <div className="grid grid-cols-3 gap-2 md:contents">
                  <input value={r.perServing} onChange={(e) => set(i, { perServing: e.target.value })} placeholder="80 mg" maxLength={80} aria-label={`Ред ${i + 1}: в дневна доза`} className={cell} />
                  <input value={r.per100} onChange={(e) => set(i, { per100: e.target.value })} placeholder="—" maxLength={80} aria-label={`Ред ${i + 1}: на 100 g`} className={cell} />
                  <input value={r.nrv} onChange={(e) => set(i, { nrv: e.target.value })} placeholder="100%" maxLength={80} aria-label={`Ред ${i + 1}: % РСП`} className={cell} />
                </div>
                <div className="flex justify-end gap-1">
                  <button type="button" disabled={i === 0} onClick={() => onChange(move(value, i, -1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:border-ink disabled:opacity-30" aria-label={`Ред ${i + 1} по-нагоре`}>
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === value.length - 1}
                    onClick={() => onChange(move(value, i, 1))}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:border-ink disabled:opacity-30"
                    aria-label={`Ред ${i + 1} по-надолу`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-brand hover:border-brand" aria-label={`Изтрий ред ${i + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-line p-5 text-center text-sm text-ink-soft">Таблицата е празна.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange([...value, { ...EMPTY_ROW }])} disabled={value.length >= 60} className="btn btn-ghost min-h-10 max-w-full whitespace-normal px-4 py-2 text-left text-sm">
          <Plus className="h-4 w-4" strokeWidth={3} /> Добави ред
        </button>
        {kind !== "non-food" && missingDeclaration.length ? (
          <button
            type="button"
            onClick={() => onChange([...value.filter((r) => r.name.trim() || r.perServing || r.per100 || r.nrv), ...missingDeclaration.map((name) => ({ ...EMPTY_ROW, name }))])}
            className="btn btn-ghost min-h-10 max-w-full whitespace-normal px-4 py-2 text-left text-sm"
            title={DECLARATION.join(", ")}
          >
            <ListPlus className="h-4 w-4" /> Добави редовете за хранителна стойност
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted">
        {kind === "supplement"
          ? "За хранителна добавка: количеството на всяко вещество в препоръчителната дневна доза, а за витамините и минералите — и % от референтния прием (РСП)."
          : "За протеини, барове и други храни: хранителната стойност на 100 g / 100 ml (енергия, мазнини, въглехидрати, захари, белтъчини, сол)."}{" "}
        Пишете мерните единици, напр. „25 g“, „400 kcal“, „80 mg“.
      </p>
    </div>
  );
}
