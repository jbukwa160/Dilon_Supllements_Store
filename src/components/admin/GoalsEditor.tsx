"use client";

import { useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Eye, EyeOff, Package } from "lucide-react";
import type { GoalEntry } from "@/lib/categories";
import { CATEGORY_ICONS } from "@/lib/category-config";
import { CategoryIcon } from "@/components/layout/CategoryIcon";
import { Card, Field, ImageField, L10nInput } from "./ui";

export function moveItem<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Grid of the lucide icons a category or goal tile can have (the current one first if it is a built-in extra). */
export function IconPicker({ value, onChange, color, accent }: { value: string; onChange: (icon: string) => void; color?: string; accent?: string }) {
  const icons: string[] = (CATEGORY_ICONS as readonly string[]).includes(value) ? [...CATEGORY_ICONS] : [value, ...CATEGORY_ICONS];
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Иконка">
      {icons.map((name) => {
        const on = value === name;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={name}
            title={name}
            onClick={() => onChange(name)}
            className={clsx("grid h-10 w-10 place-items-center rounded-xl border-2 transition", on ? "border-ink" : "border-transparent hover:border-line")}
            style={on ? { background: color ?? "var(--color-canvas)", color: accent } : undefined}
          >
            <CategoryIcon icon={name} className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}

/** Row buttons: show / hide, up, down (the /web collapsible-list look). */
export function RowControls({
  hidden,
  onToggle,
  onUp,
  onDown,
  name,
  first,
  last,
}: {
  hidden: boolean;
  onToggle: () => void;
  onUp: () => void;
  onDown: () => void;
  name: string;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="ml-auto flex gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        className={clsx("grid h-10 w-10 place-items-center rounded-lg border", hidden ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink")}
        aria-label={hidden ? `Покажи „${name}“` : `Скрий „${name}“`}
        aria-pressed={hidden}
        title={hidden ? "Скрита — натиснете, за да се показва" : "Показва се — натиснете, за да я скриете"}
      >
        {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <button type="button" disabled={first} onClick={onUp} className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white hover:border-ink disabled:opacity-30" aria-label={`„${name}“ по-нагоре`}>
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" disabled={last} onClick={onDown} className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white hover:border-ink disabled:opacity-30" aria-label={`„${name}“ по-надолу`}>
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Goals ("Пазарувай по цел"): order, names, descriptions, icons, pictures, hidden. Products get goals from their
 * subcategory and name automatically; in Продукти they can be changed one by one or in bulk.
 */
export function GoalsEditor({
  value,
  onChange,
  counts,
  autoImages,
  minCards,
}: {
  value: GoalEntry[];
  onChange: (goals: GoalEntry[]) => void;
  counts: Record<string, number>;
  autoImages: Record<string, string>;
  /** Goals with fewer products are not listed in the shop (their page still opens). */
  minCards: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (slug: string, patch: Partial<GoalEntry>) => onChange(value.map((g) => (g.slug === slug ? { ...g, ...patch } : g)));

  return (
    <Card
      title="Цели („Пазарувай по цел“)"
      description="Показват се на началната страница, в менюто „Цели“ и на страниците /tsel/…. Продуктите получават цели автоматично по подкатегорията и името; в „Продукти“ можете да ги промените."
    >
      <ol className="space-y-2">
        {value.map((g, i) => {
          const isOpen = open === g.slug;
          const n = counts[g.slug] ?? 0;
          return (
            <li key={g.slug} className={clsx("rounded-2xl border-2", isOpen ? "border-ink" : "border-line", g.hidden && !isOpen && "bg-canvas")}>
              <div className="flex flex-wrap items-center gap-3 p-3">
                <button type="button" onClick={() => setOpen(isOpen ? null : g.slug)} className="flex min-w-0 flex-1 basis-60 items-center gap-3 text-left" aria-expanded={isOpen}>
                  <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-canvas text-ink", g.hidden && "opacity-50")}>
                    <CategoryIcon icon={g.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx("block truncate font-black", g.hidden && "text-muted")}>{g.name.bg || "Без име"}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-muted">
                      <span>{n.toLocaleString("bg-BG")} продукта в сайта</span>
                      {g.hidden ? <span className="rounded-full bg-ink px-2 py-0.5 text-white">Скрита</span> : null}
                      {!g.hidden && n < minCards ? (
                        <span className="rounded-full bg-sun-soft px-2 py-0.5 text-ink">Под {minCards} продукта — не се показва в менюто и на началната страница</span>
                      ) : null}
                      {g.name.bg && !g.name.en ? <span className="rounded-full bg-sun-soft px-2 py-0.5 text-ink">Липсва превод</span> : null}
                    </span>
                  </span>
                  <ChevronDown className={clsx("h-5 w-5 shrink-0 text-muted transition", isOpen && "rotate-180")} />
                </button>
                <RowControls
                  name={g.name.bg}
                  hidden={g.hidden}
                  onToggle={() => update(g.slug, { hidden: !g.hidden })}
                  onUp={() => onChange(moveItem(value, i, -1))}
                  onDown={() => onChange(moveItem(value, i, 1))}
                  first={i === 0}
                  last={i === value.length - 1}
                />
              </div>
              {isOpen ? (
                <div className="space-y-5 border-t border-line p-4 md:p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Име" group>
                      <L10nInput label="Име на целта" value={g.name} onChange={(v) => update(g.slug, { name: v })} maxLength={60} invalid={!g.name.bg.trim()} />
                    </Field>
                    <Field label="Описание" group hint="Кратко изречение под името.">
                      <L10nInput label="Описание на целта" multiline rows={2} value={g.description} onChange={(v) => update(g.slug, { description: v })} maxLength={300} />
                    </Field>
                  </div>
                  <Field label="Иконка" group>
                    <IconPicker value={g.icon} onChange={(icon) => update(g.slug, { icon })} />
                  </Field>
                  <Field label="Снимка" group hint={g.image ? undefined : "Празно = снимка на най-популярния продукт с тази цел."}>
                    <div className="flex flex-wrap items-center gap-4">
                      <ImageField value={g.image} onChange={(v) => update(g.slug, { image: v })} compact recommended="Квадратна снимка на продукт на бял или прозрачен фон." />
                      {!g.image && autoImages[g.slug] ? (
                        <span className="flex items-center gap-2 text-sm text-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={autoImages[g.slug]} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-xl border border-line bg-white object-contain p-1" /> Сега се показва тази
                        </span>
                      ) : null}
                    </div>
                  </Field>
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    {n ? (
                      <a href={`/tsel/${g.slug}`} target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
                        <ExternalLink className="h-4 w-4" /> Виж в сайта
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm font-bold text-muted">
                        <Package className="h-4 w-4" /> Няма продукти с тази цел — не се показва в сайта.
                      </span>
                    )}
                    <span className="text-xs text-muted">Адрес: /tsel/{g.slug} — не се променя при ново име.</span>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
