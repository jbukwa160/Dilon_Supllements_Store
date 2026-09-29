"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, CircleAlert, LoaderCircle, Wand2, X } from "lucide-react";
import type { CategoryOption, Choice } from "@/lib/admin/products";
import type { ProductKind } from "@/lib/catalog-types";
import { bulkProductsAction, type BulkChange, type BulkTarget } from "@/app/admin/_actions/products";

type Action = "move" | "hide" | "show" | "goals" | "diets" | "adult" | "productKind";
type TagMode = "add" | "remove" | "set";

const ACTIONS: Record<Action, string> = {
  move: "Премести в категория",
  hide: "Скрий от сайта",
  show: "Покажи в сайта",
  goals: "Задай цели",
  diets: "Задай хранителен режим",
  adult: "Задай „само за 18+“",
  productKind: "Задай вид на продукта",
};

const TAG_MODES: Record<TagMode, string> = { add: "Добави", remove: "Премахни", set: "Замени всички с" };

/** "1 продукт" / "12 продукта" */
export const products = (n: number) => (n === 1 ? "1 продукт" : `${n.toLocaleString("bg-BG")} продукта`);

/** A multi-choice dropdown (goals, diets) that opens upwards from the sticky bar. */
function MultiPick({ label, options, value, onChange }: { label: string; options: Choice[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <details className="group relative">
      <summary className="field flex cursor-pointer list-none items-center gap-2 !py-2 font-bold [&::-webkit-details-marker]:hidden">
        {value.length ? `${label}: ${value.length}` : `Изберете ${label.toLowerCase()}…`}
        <ChevronDown className="ml-auto h-4 w-4 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="absolute bottom-full left-0 z-30 mb-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-lift)]">
        {options.map((o) => (
          <label key={o.key} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-bold hover:bg-canvas">
            <input
              type="checkbox"
              checked={value.includes(o.key)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.key] : value.filter((x) => x !== o.key))}
              className="h-4 w-4 accent-[var(--color-sky)]"
            />
            {o.label}
            {o.hidden ? <span className="text-xs font-semibold text-muted">(скрита)</span> : null}
          </label>
        ))}
      </div>
    </details>
  );
}

/** Sticky bar for the ticked products: move, hide / show, goals, diets, 18+, kind. */
export function BulkBar({
  count,
  offerAll,
  total,
  onSelectAll,
  onClear,
  target,
  categories,
  goals,
  diets,
  kinds,
  onDone,
}: {
  count: number;
  offerAll: boolean;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  target: BulkTarget;
  categories: CategoryOption[];
  goals: Choice[];
  diets: Choice[];
  kinds: Choice[];
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action>("move");
  const [category, setCategory] = useState("");
  const [tagMode, setTagMode] = useState<TagMode>("add");
  const [tags, setTags] = useState<string[]>([]);
  const [adult, setAdult] = useState<"" | "yes" | "no">("");
  const [kind, setKind] = useState<ProductKind | "">("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const categoryName = (slug: string) => {
    for (const c of categories) {
      if (c.slug === slug) return c.name;
      const s = c.subs.find((x) => x.slug === slug);
      if (s) return s.name;
    }
    return slug;
  };

  const ready =
    action === "move" ? !!category : action === "goals" || action === "diets" ? tags.length > 0 || tagMode === "set" : action === "adult" ? !!adult : action === "productKind" ? !!kind : true;

  const change = (): BulkChange => {
    switch (action) {
      case "move":
        return { kind: "move", category };
      case "hide":
      case "show":
        return { kind: "hidden", hidden: action === "hide" };
      case "goals":
      case "diets":
        return { kind: action, mode: tagMode, values: tags };
      case "adult":
        return { kind: "adult", adultOnly: adult === "yes" };
      case "productKind":
        return { kind: "productKind", value: kind as ProductKind };
    }
  };

  const message = (n: number): string => {
    if (!n) return "Нищо не се промени — избраните продукти вече са такива.";
    switch (action) {
      case "move":
        return `Готово! ${products(n)} са преместени в „${categoryName(category)}“.`;
      case "hide":
        return `Готово! ${products(n)} са скрити от сайта.`;
      case "show":
        return `Готово! ${products(n)} вече се показват в сайта.`;
      case "goals":
        return `Готово! Целите са променени при ${products(n)}.`;
      case "diets":
        return `Готово! Хранителният режим е променен при ${products(n)}.`;
      case "adult":
        return adult === "yes" ? `Готово! ${products(n)} са отбелязани „само за 18+“.` : `Готово! ${products(n)} вече не са „само за 18+“.`;
      case "productKind":
        return `Готово! ${products(n)} са с вид „${kinds.find((k) => k.key === kind)?.label ?? kind}“.`;
    }
  };

  const apply = () => {
    if (count > 100 && !confirm(`Промяната ще засегне ${products(count)}. Да продължа ли?`)) return;
    start(async () => {
      setError(null);
      const r = await bulkProductsAction(target, change());
      if (!r.ok) {
        setError(r.error ?? "Възникна грешка.");
        return;
      }
      onDone(message(r.changed ?? 0));
      router.refresh();
    });
  };

  const select = "field w-auto cursor-pointer !py-2";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t-2 border-sky bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgb(29_35_64/0.08)] backdrop-blur md:px-8" role="region" aria-label="Действия с избраните продукти">
      <span className="font-black">Избрани: {count.toLocaleString("bg-BG")}</span>
      {offerAll ? (
        <button type="button" onClick={onSelectAll} className="text-sm font-bold text-sky hover:underline">
          Избери всички {total.toLocaleString("bg-BG")} намерени
        </button>
      ) : null}
      <button type="button" onClick={onClear} className="btn btn-ghost ml-auto h-9 px-3 text-sm">
        <X className="h-4 w-4" /> Откажи
      </button>
      <span className="flex w-full flex-wrap items-center gap-2">
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value as Action);
            setTags([]);
            setError(null);
          }}
          className={clsx(select, "font-bold")}
          aria-label="Действие"
        >
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {action === "move" ? (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={clsx(select, "min-w-52")} aria-label="Категория">
            <option value="">Изберете категория…</option>
            {categories.map((c) => (
              <optgroup key={c.slug} label={c.hidden ? `${c.name} (скрита)` : c.name}>
                <option value={c.slug}>{c.name} — без подкатегория</option>
                {c.subs.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : null}
        {action === "goals" || action === "diets" ? (
          <>
            <select value={tagMode} onChange={(e) => setTagMode(e.target.value as TagMode)} className={select} aria-label="Как">
              {Object.entries(TAG_MODES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <MultiPick label={action === "goals" ? "Цели" : "Режими"} options={action === "goals" ? goals : diets} value={tags} onChange={setTags} />
          </>
        ) : null}
        {action === "adult" ? (
          <select value={adult} onChange={(e) => setAdult(e.target.value as typeof adult)} className={select} aria-label="Само за 18+">
            <option value="">Изберете…</option>
            <option value="yes">Да — само за пълнолетни</option>
            <option value="no">Не — за всички</option>
          </select>
        ) : null}
        {action === "productKind" ? (
          <select value={kind} onChange={(e) => setKind(e.target.value as ProductKind | "")} className={select} aria-label="Вид на продукта">
            <option value="">Изберете вид…</option>
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" onClick={apply} disabled={!ready || pending} className="btn btn-primary h-11 px-5 !shadow-none">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Приложи
        </button>
      </span>
      {tagMode === "set" && (action === "goals" || action === "diets") ? (
        <p className="w-full text-sm text-muted">
          „Замени всички с“ изтрива досегашните {action === "goals" ? "цели" : "режими"} на продуктите{tags.length ? "" : " (без избор = без нито един)"}.
        </p>
      ) : null}
      {error ? (
        <p className="flex w-full items-center gap-1.5 text-sm font-bold text-brand" role="alert">
          <CircleAlert className="h-4 w-4" /> {error}
        </p>
      ) : null}
    </div>
  );
}
