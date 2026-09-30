"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ExternalLink, LayoutGrid, Package, Plus, Trash2 } from "lucide-react";
import type { CategoryEntry, GoalEntry, SubCategoryEntry } from "@/lib/categories";
import { contrastText } from "@/lib/settings-types";
import { slugify } from "@/lib/slug";
import { saveCategoriesAction, type CategoriesInput } from "@/app/admin/_actions/categories";
import { CategoryIcon } from "@/components/layout/CategoryIcon";
import { Card, ColorField, Field, ImageField, L10nInput, SaveBar, TextInput, useEditor } from "./ui";
import { GoalsEditor, IconPicker, RowControls, moveItem } from "./GoalsEditor";

/** Pastel tile colours that go with the shop's palette. */
const TILE_COLORS = ["#e6f2ef", "#eef6d6", "#e8eeff", "#ffe9dc", "#fdebec", "#fff4c8", "#e0f2fe", "#f3e8ff", "#fce7f3", "#f1f5f9"];
const NEW_CATEGORY_ACCENT = "#334155";

/** A free address for a new category / subcategory (they all live under /kategoria/…). */
function freeSlug(name: string, taken: Set<string>): string {
  const base = slugify(name, 50) || "kategoria";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const count = (n: number) => (n === 1 ? "1 продукт" : `${n.toLocaleString("bg-BG")} продукта`);

type Props = {
  initial: CategoryEntry[];
  goals: GoalEntry[];
  /** Products per category / subcategory address (hidden ones too). */
  counts: Record<string, number>;
  /** Products shown in the shop per goal. */
  goalCounts: Record<string, number>;
  /** Pictures shown when the admin chose none (the most popular product's). */
  autoImages: Record<string, string>;
  goalImages: Record<string, string>;
  /** Category / subcategory addresses the importer fills (taxonomy.ts IMPORTED_CATEGORIES — fitness only). */
  inScope: string[];
  /** Fewest products a goal needs to be listed in the shop. */
  minGoalCards: number;
};

export function CategoriesEditor({ initial, goals, counts, goalCounts, autoImages, goalImages, inScope, minGoalCards }: Props) {
  const router = useRouter();
  const ed = useEditor<CategoriesInput>({ categories: initial, goals, moves: {} }, async (v) => {
    const r = await saveCategoriesAction(v);
    if (r.ok) router.refresh();
    return r;
  });
  const cats = ed.value.categories;
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // Addresses that exist (or were used by categories deleted but not saved yet).
  const taken = new Set([...initial, ...cats].flatMap((c) => [c.slug, ...c.subs.map((s) => s.slug)]));

  const setCats = (fn: (c: CategoryEntry[]) => CategoryEntry[]) => ed.setValue((v) => ({ ...v, categories: fn(v.categories) }));
  const update = (slug: string, patch: Partial<CategoryEntry>) => setCats((list) => list.map((c) => (c.slug === slug ? { ...c, ...patch } : c)));
  const n = (slug: string) => counts[slug] ?? 0;

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const slug = freeSlug(name, taken);
    setCats((list) => [
      ...list,
      {
        slug,
        name: { bg: name, en: "" },
        tagline: { bg: "", en: "" },
        icon: "package",
        color: "#f1f5f9",
        accent: NEW_CATEGORY_ACCENT,
        image: "",
        hidden: false,
        builtIn: false,
        subs: [],
      },
    ]);
    setNewName("");
    setOpen(slug);
  };

  const remove = (c: CategoryEntry, moveTo: string) => {
    ed.setValue((v) => ({ ...v, categories: v.categories.filter((x) => x.slug !== c.slug), moves: moveTo ? { ...v.moves, [c.slug]: moveTo } : v.moves }));
    setOpen(null);
  };

  const visible = cats.filter((c) => !c.hidden);

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card title="Категории в менюто" description="Подредени както в бутона „Всички категории“ и на началната страница. Натиснете категория, за да я промените.">
            <ol className="space-y-2">
              {cats.map((c, i) => {
                const isOpen = open === c.slug;
                const k = n(c.slug);
                return (
                  <li key={c.slug} className={clsx("rounded-2xl border-2", isOpen ? "border-ink" : "border-line", c.hidden && !isOpen && "bg-canvas")}>
                    <div className="flex flex-wrap items-center gap-3 p-3">
                      <button type="button" onClick={() => setOpen(isOpen ? null : c.slug)} className="flex min-w-0 flex-1 basis-60 items-center gap-3 text-left" aria-expanded={isOpen}>
                        <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", c.hidden && "opacity-50")} style={{ background: c.color, color: c.accent }}>
                          <CategoryIcon icon={c.icon} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={clsx("block truncate font-black", c.hidden && "text-muted")}>{c.name.bg || "Без име"}</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-muted">
                            <span>{count(k)}</span>
                            {c.subs.length ? <span>· {c.subs.length} подкатегории</span> : null}
                            {c.hidden ? <span className="rounded-full bg-ink px-2 py-0.5 text-white">Скрита</span> : null}
                            {!c.builtIn ? <span className="rounded-full bg-sky-soft px-2 py-0.5 text-sky">Добавена от вас</span> : null}
                            {!k && !c.hidden ? (
                              <span className="rounded-full bg-sun-soft px-2 py-0.5 text-ink">
                                {c.builtIn && !inScope.includes(c.slug) ? "Извън асортимента (само фитнес) — не се внася" : "Празна — не се вижда в сайта"}
                              </span>
                            ) : null}
                            {c.name.bg && !c.name.en ? <span className="rounded-full bg-sun-soft px-2 py-0.5 text-ink">Липсва превод</span> : null}
                          </span>
                        </span>
                        <ChevronDown className={clsx("h-5 w-5 shrink-0 text-muted transition", isOpen && "rotate-180")} />
                      </button>
                      <RowControls
                        name={c.name.bg}
                        hidden={c.hidden}
                        onToggle={() => update(c.slug, { hidden: !c.hidden })}
                        onUp={() => setCats((l) => moveItem(l, i, -1))}
                        onDown={() => setCats((l) => moveItem(l, i, 1))}
                        first={i === 0}
                        last={i === cats.length - 1}
                      />
                    </div>
                    {isOpen ? (
                      <CategoryPanel
                        c={c}
                        counts={counts}
                        autoImage={autoImages[c.slug] ?? ""}
                        others={cats.filter((x) => x.slug !== c.slug)}
                        taken={taken}
                        onChange={(patch) => update(c.slug, patch)}
                        onRemove={(moveTo) => remove(c, moveTo)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <div className="mt-5 flex flex-wrap gap-2 rounded-2xl bg-canvas p-3">
              <TextInput
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="Име на нова категория, напр. Веган продукти"
                maxLength={60}
                className="min-w-0 flex-1 basis-56"
                aria-label="Име на нова категория"
              />
              <button type="button" onClick={add} disabled={!newName.trim()} className="btn btn-primary h-12 px-5 !shadow-none">
                <Plus className="h-5 w-5" strokeWidth={3} /> Добави категория
              </button>
            </div>
          </Card>

          <GoalsEditor value={ed.value.goals} onChange={(goals) => ed.setValue((v) => ({ ...v, goals }))} counts={goalCounts} autoImages={goalImages} minCards={minGoalCards} />
        </div>

        <div className="min-w-0 space-y-6 xl:sticky xl:top-6">
          <Card title="Преглед" description="Така изглежда списъкът в бутона „Всички категории“.">
            <div className="overflow-hidden rounded-2xl border border-line bg-canvas py-2">
              <p className="mx-2 mb-1 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-sm font-extrabold text-white">
                <LayoutGrid className="h-4 w-4" /> Всички категории
              </p>
              <ul>
                {visible.map((c) => (
                  <li key={c.slug} className={clsx("mx-2 flex items-center gap-3 rounded-xl px-3 py-1.5 text-[0.9rem] font-bold", !n(c.slug) && "opacity-40")}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: c.color, color: c.accent }}>
                      <CategoryIcon icon={c.icon} className="h-4 w-4" />
                    </span>
                    <span className="truncate">{c.name.bg}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-3 text-sm text-muted">Празните и скритите категории не се показват в менюто, но страницата им работи.</p>
          </Card>
          <Card title="Как да сложа продукти в категория?">
            <ul className="space-y-2 text-sm text-ink-soft">
              <li>
                <b>Един продукт:</b> Продукти → „Редактирай“ → поле „Категория“.
              </li>
              <li>
                <b>Много наведнъж:</b> в{" "}
                <Link href="/admin/produkti" className="font-bold text-sky hover:underline">
                  Продукти
                </Link>{" "}
                ги потърсете, отметнете ги и изберете „Премести в категория“.
              </li>
              <li>
                <b>Нови продукти от файла</b> се подреждат автоматично в основните категории.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </>
  );
}

function CategoryPanel({
  c,
  counts,
  autoImage,
  others,
  taken,
  onChange,
  onRemove,
}: {
  c: CategoryEntry;
  counts: Record<string, number>;
  autoImage: string;
  others: CategoryEntry[];
  taken: Set<string>;
  onChange: (patch: Partial<CategoryEntry>) => void;
  onRemove: (moveTo: string) => void;
}) {
  const [subName, setSubName] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const k = counts[c.slug] ?? 0;
  const setSub = (slug: string, patch: Partial<SubCategoryEntry>) => onChange({ subs: c.subs.map((s) => (s.slug === slug ? { ...s, ...patch } : s)) });
  const addSub = () => {
    const name = subName.trim();
    if (!name) return;
    onChange({ subs: [...c.subs, { slug: freeSlug(name, taken), name: { bg: name, en: "" }, tagline: { bg: "", en: "" }, hidden: false, builtIn: false }] });
    setSubName("");
  };
  const light = contrastText(c.color) === "#ffffff";

  return (
    <div className="space-y-6 border-t border-line p-4 md:p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Име" group>
          <L10nInput label="Име на категорията" value={c.name} onChange={(v) => onChange({ name: v })} maxLength={60} invalid={!c.name.bg.trim()} />
        </Field>
        <Field label="Кратък текст" group hint="Показва се в менюто и най-горе на страницата на категорията.">
          <L10nInput label="Кратък текст" value={c.tagline} onChange={(v) => onChange({ tagline: v })} maxLength={120} placeholder="напр. Суроватъчен, изолат и растителен" />
        </Field>
      </div>

      <Field label="Иконка" group>
        <IconPicker value={c.icon} onChange={(icon) => onChange({ icon })} color={c.color} accent={c.accent} />
      </Field>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Field label="Цвят на плочката" group hint="Фон на плочката в менюто и на началната страница.">
          <ColorField value={c.color} onChange={(v) => onChange({ color: v })} presets={TILE_COLORS} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-extrabold">Така изглежда</span>
          <div className="rounded-3xl p-4" style={{ background: c.color }}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/80" style={{ color: c.accent }}>
              <CategoryIcon icon={c.icon} className="h-5 w-5" />
            </span>
            <span className="mt-3 block font-black leading-tight" style={{ color: light ? "#ffffff" : c.accent }}>
              {c.name.bg || "Без име"}
            </span>
            <span className="text-sm font-semibold" style={{ color: light ? "rgba(255,255,255,.75)" : "rgba(15,26,23,.6)" }}>
              {count(k)}
            </span>
          </div>
        </div>
      </div>

      <Field label="Снимка" group hint={c.image ? undefined : "Празно = снимка на най-популярния продукт в категорията."}>
        <div className="flex flex-wrap items-center gap-4">
          <ImageField value={c.image} onChange={(v) => onChange({ image: v })} compact recommended="Квадратна снимка на продукт на бял или прозрачен фон." />
          {!c.image && autoImage ? (
            <span className="flex items-center gap-2 text-sm text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={autoImage} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-xl border border-line bg-white object-contain p-1" /> Сега се показва тази
            </span>
          ) : null}
        </div>
      </Field>

      <Field label="Подкатегории" group hint="Показват се, когато посетителят посочи категорията в менюто. Скритите и празните не се показват. Английското име е по желание.">
        {c.subs.length ? (
          <ul className="space-y-2">
            {c.subs.map((s, i) => (
              <li key={s.slug} className={clsx("flex flex-wrap items-center gap-2 rounded-2xl border border-line p-2", s.hidden && "bg-canvas")}>
                <TextInput
                  value={s.name.bg}
                  onChange={(e) => setSub(s.slug, { name: { ...s.name, bg: e.target.value } })}
                  maxLength={60}
                  invalid={!s.name.bg.trim()}
                  className={clsx("min-w-0 flex-1 basis-52", s.hidden && "!text-muted")}
                  aria-label={`Подкатегория ${i + 1} — име на български`}
                />
                <TextInput
                  value={s.name.en}
                  onChange={(e) => setSub(s.slug, { name: { ...s.name, en: e.target.value } })}
                  maxLength={60}
                  placeholder={`EN: ${s.name.bg}`}
                  className={clsx("min-w-0 flex-1 basis-52", s.hidden && "!text-muted")}
                  aria-label={`Подкатегория ${i + 1} — име на английски`}
                />
                <span className="ml-auto flex items-center gap-2">
                  <span className="w-24 shrink-0 text-right text-xs font-bold text-muted">{count(counts[s.slug] ?? 0)}</span>
                  <RowControls
                    name={s.name.bg}
                    hidden={s.hidden}
                    onToggle={() => setSub(s.slug, { hidden: !s.hidden })}
                    onUp={() => onChange({ subs: moveItem(c.subs, i, -1) })}
                    onDown={() => onChange({ subs: moveItem(c.subs, i, 1) })}
                    first={i === 0}
                    last={i === c.subs.length - 1}
                  />
                  {!s.builtIn ? (
                    <button
                      type="button"
                      onClick={() => {
                        const m = counts[s.slug] ?? 0;
                        if (!m || confirm(`Продуктите от „${s.name.bg}“ (${m}) ще останат в „${c.name.bg}“ без подкатегория. Да изтрия ли подкатегорията?`)) {
                          onChange({ subs: c.subs.filter((x) => x.slug !== s.slug) });
                        }
                      }}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-brand hover:bg-brand-soft"
                      aria-label={`Изтрий „${s.name.bg}“`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-9 shrink-0" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Няма подкатегории.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <TextInput
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSub();
              }
            }}
            placeholder="Нова подкатегория"
            maxLength={60}
            className="min-w-0 flex-1 basis-56"
            aria-label="Име на нова подкатегория"
          />
          <button type="button" onClick={addSub} disabled={!subName.trim()} className="btn btn-ghost h-12 px-4">
            <Plus className="h-4 w-4" strokeWidth={3} /> Добави подкатегория
          </button>
        </div>
      </Field>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Link href={`/admin/produkti?kat=${c.slug}`} className="btn btn-ghost h-10 px-4 text-sm">
          <Package className="h-4 w-4" /> Продуктите в категорията
        </Link>
        {k ? (
          <a href={`/kategoria/${c.slug}`} target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
            <ExternalLink className="h-4 w-4" /> Виж в сайта
          </a>
        ) : null}
        <span className="text-xs text-muted">Адрес: /kategoria/{c.slug} — не се променя при ново име.</span>
      </div>

      {!c.builtIn ? (
        <div className="rounded-2xl border-2 border-brand/20 bg-brand-soft/40 p-4">
          <p className="font-black">Изтриване на категорията</p>
          {k ? (
            <>
              <p className="mt-1 text-sm text-ink-soft">В нея има {count(k)}. Изберете къде да отидат:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="field min-w-0 flex-1 basis-56 cursor-pointer" aria-label="Премести продуктите в">
                  <option value="">— Изберете категория —</option>
                  {others.map((o) => (
                    <optgroup key={o.slug} label={o.name.bg}>
                      <option value={o.slug}>{o.name.bg} — без подкатегория</option>
                      {o.subs.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name.bg}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button type="button" disabled={!moveTo} onClick={() => onRemove(moveTo)} className="btn h-12 bg-brand px-5 text-white hover:bg-brand-dark">
                  <Trash2 className="h-4 w-4" /> Премести и изтрий
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => confirm(`Да изтрия ли „${c.name.bg}“?`) && onRemove("")} className="btn mt-2 h-10 bg-brand px-4 text-sm text-white hover:bg-brand-dark">
              <Trash2 className="h-4 w-4" /> Изтрий категорията
            </button>
          )}
          <p className="mt-2 text-xs text-muted">Изтриването става окончателно, когато натиснете „Запази промените“.</p>
        </div>
      ) : (
        <p className="text-xs text-muted">Основните категории не могат да се изтриват (към тях автоматично се подреждат новите продукти от файла), но можете да ги скриете.</p>
      )}
    </div>
  );
}
