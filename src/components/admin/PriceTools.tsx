"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, CircleAlert, Download, FileSpreadsheet, Info, LoaderCircle, Percent, TrendingDown, TrendingUp, Upload, X } from "lucide-react";
import { applyBulkAction, applyPriceFileAction, previewBulkAction } from "@/app/admin/_actions/prices";
// The price file is uploaded to a route handler (too big for the 1 MB Server Action limit): see _actions/uploads.ts.
import { uploadPriceFile } from "@/app/admin/_actions/uploads";
import type { BulkInput, BulkPreview, PricePreview } from "@/lib/admin/prices";
import { Card, Field } from "./ui";

export type CategoryOption = { slug: string; name: string; subs: { slug: string; name: string }[] };
export type BrandOption = { slug: string; name: string; count: number };

/** Category or subcategory ("Протеини — всички" + its subcategories in an optgroup). */
export function CategorySelect({
  value,
  onChange,
  categories,
  allLabel,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: CategoryOption[];
  allLabel: string;
  ariaLabel?: string;
}) {
  return (
    <select className="field cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
      <option value="">{allLabel}</option>
      {categories.map((c) => (
        <optgroup key={c.slug} label={c.name}>
          <option value={c.slug}>{c.name} — всички</option>
          {c.subs.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Lower case without accents, for matching what the admin types ("oliMP" finds "Olimp", "nutrend" finds "Nutrend"). */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const MAX_OPTIONS = 50;

/**
 * Brand picker for 1 500+ brands: type any part of the name (any letter case) and pick from the filtered list with the
 * mouse or the arrow keys + Enter. Names starting with the typed text come first, then the brands with most products.
 */
export function BrandPicker({ brands, onPick, placeholder = "Напишете марка, напр. Optimum Nutrition" }: { brands: BrandOption[]; onPick: (b: BrandOption) => void; placeholder?: string }) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const folded = useMemo(() => brands.map((b) => ({ b, key: fold(b.name) })), [brands]);
  const q = fold(text);
  const matches = useMemo(() => {
    if (!q) return folded.map((x) => x.b);
    const starts: BrandOption[] = [];
    const contains: BrandOption[] = [];
    for (const x of folded) {
      if (x.key.startsWith(q)) starts.push(x.b);
      else if (x.key.includes(q)) contains.push(x.b);
    }
    return [...starts, ...contains];
  }, [folded, q]);
  const shown = matches.slice(0, MAX_OPTIONS);
  const current = Math.min(active, Math.max(0, shown.length - 1));

  const pick = (b: BrandOption) => {
    onPick(b);
    setText("");
    setOpen(false);
    setActive(0);
  };
  const move = (to: number) => {
    const next = (to + shown.length) % shown.length;
    setActive(next);
    requestAnimationFrame(() => document.getElementById(`${id}-o${next}`)?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <div className="relative">
      <input
        className="field"
        role="combobox"
        aria-label="Марка"
        aria-autocomplete="list"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && shown.length ? `${id}-o${current}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) setOpen(true);
            else if (shown.length) move(current + (e.key === "ArrowDown" ? 1 : -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && shown[current]) pick(shown[current]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border-2 border-line bg-white shadow-lg">
          {shown.length ? (
            <ul id={listId} role="listbox" aria-label="Марки" className="max-h-72 overflow-y-auto py-1">
              {shown.map((b, i) => (
                <li
                  key={b.slug}
                  id={`${id}-o${i}`}
                  role="option"
                  aria-selected={i === current}
                  // mousedown, not click: picking must happen before the input's blur closes the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(b);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={clsx("flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2", i === current && "bg-sky-soft")}
                >
                  <span className="font-bold">{b.name}</span>
                  <span className="shrink-0 text-xs text-muted">{b.count} продукта</span>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} className="px-3.5 py-3 text-sm font-bold text-brand">
              Няма марка, която съдържа „{text.trim()}“.
            </p>
          )}
          {matches.length > shown.length ? (
            <p className="border-t border-line px-3.5 py-2 text-xs text-muted">
              Показани са {shown.length} от {matches.length} — напишете още от името.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-black text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-black">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function FileImport({ categories }: { categories: CategoryOption[] }) {
  const [kat, setKat] = useState("");
  const [withStock, setWithStock] = useState(false);
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const upload = (f: File) => {
    setError(null);
    setDone(null);
    setPreview(null);
    setFileName(f.name);
    const fd = new FormData();
    fd.append("file", f);
    start(async () => {
      const r = await uploadPriceFile(fd);
      if ("error" in r) setError(r.error);
      else setPreview(r);
    });
  };
  const apply = () =>
    start(async () => {
      if (!preview?.id) return;
      const r = await applyPriceFileAction(preview.id);
      if (r.ok) {
        setDone(r.changed ?? 0);
        setPreview(null);
      } else setError(r.error ?? "Възникна грешка.");
    });

  const q = `${kat ? `&kat=${encodeURIComponent(kat)}` : ""}${withStock ? "&stock=1" : ""}`;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-mint" /> Промяна на цени с Excel файл
        </span>
      }
      description="Най-лесният начин да смените цените на много продукти: изтеглете файла, променете цените в Excel и го качете обратно."
    >
      <div className="space-y-6">
        <Step n={1} title="Изтеглете текущите цени">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-80">
              <CategorySelect value={kat} onChange={setKat} categories={categories} allLabel="Всички продукти" ariaLabel="Кои продукти да съдържа файлът" />
            </div>
            <a href={`/admin/tseni/export?format=xlsx${q}`} className="btn btn-primary h-12 px-5 !shadow-none">
              <Download className="h-4 w-4" /> Изтегли за Excel
            </a>
            <a href={`/admin/tseni/export?format=csv${q}`} className="btn btn-ghost h-12 px-4 text-sm">
              или CSV
            </a>
          </div>
          <label className="mt-3 flex items-start gap-2.5 text-sm font-bold">
            <input type="checkbox" checked={withStock} onChange={(e) => setWithStock(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
            <span>
              Включи и колона „Наличност“
              <span className="block font-normal text-ink-soft">
                Само ако ще я променяте: наличностите идват от CSV файла на каталога и при следващото му зареждане ще бъдат презаписани.
              </span>
            </span>
          </label>
          <p className="mt-2 text-sm text-muted">
            Колони: Код, Баркод, Име, Марка, Категория, Цена (редовна), Промо цена, Промо до{withStock ? ", Наличност" : ""}. Вторият лист „Как се попълва“ обяснява
            всичко.
          </p>
        </Step>
        <Step n={2} title="Променете цените в Excel">
          <p className="text-ink-soft">
            Сменете <b>„Цена (редовна)“</b>, <b>„Промо цена“</b> (намаление само за този продукт) и/или <b>„Промо до“</b> (последен ден, напр. 30.11.2026)
            {withStock ? (
              <>
                {" "}
                — и при нужда <b>„Наличност“</b>
              </>
            ) : null}
            . Не пипайте колоната „Код“. Можете да изтриете редовете, които не променяте. Запазете файла.
          </p>
        </Step>
        <Step n={3} title="Качете файла">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => input.current?.click()} disabled={pending} className="btn btn-primary h-12 px-5 !shadow-none">
              {pending && !preview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Качи файл (.xlsx или .csv)
            </button>
            {fileName ? <span className="text-sm text-muted">{fileName}</span> : null}
          </div>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <p className="mt-2 text-sm text-muted">Нищо не се променя, докато не потвърдите — първо ще видите какво ще се промени.</p>
        </Step>

        <div aria-live="polite">
          {error ? (
            <p className="flex items-start gap-2 rounded-2xl bg-brand-soft p-4 font-bold text-brand-dark">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /> {error}
            </p>
          ) : null}
          {done != null ? (
            <p className="flex items-center gap-2 rounded-2xl bg-mint-soft p-4 font-bold text-mint">
              <Check className="h-5 w-5 shrink-0" strokeWidth={3} /> Готово! Променени са {done} продукта. Новите цени вече са в сайта.
            </p>
          ) : null}
        </div>

        {preview ? (
          <div className="rounded-2xl border-2 border-sky bg-sky-soft/40 p-5">
            <h3 className="text-lg font-black">Преглед преди запазване</h3>
            <ul className="mt-2 space-y-1 font-bold">
              <li>Редове във файла: {preview.totalRows}</li>
              <li className="text-mint">Ще бъдат променени: {preview.changed} продукта</li>
              <li className="text-ink-soft">Без промяна: {preview.unchanged}</li>
              {preview.unmatchedCount ? (
                <li className="text-brand">
                  Непознати кодове: {preview.unmatchedCount}{" "}
                  <span className="font-normal text-ink-soft">
                    ({preview.unmatched.join(", ")}
                    {preview.unmatchedCount > preview.unmatched.length ? "…" : ""})
                  </span>
                </li>
              ) : null}
              {preview.errors.length ? <li className="text-brand">Редове с грешки (ще бъдат пропуснати): {preview.errors.length}</li> : null}
            </ul>
            {preview.errors.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-brand-dark">
                {preview.errors.map((e) => (
                  <li key={e.line}>{e.message}</li>
                ))}
              </ul>
            ) : null}
            {preview.bigChangeCount ? (
              <div className="mt-3 rounded-xl bg-sun-soft p-3 text-sm" role="status">
                <p className="flex items-start gap-2 font-bold">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  Проверете {preview.bigChangeCount} {preview.bigChangeCount === 1 ? "цена, която се променя" : "цени, които се променят"} с повече от 50 % — възможна
                  грешка при писане (напр. „1,299“ се чете като 1299 €):
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-9">
                  {preview.bigChanges.map((c) => (
                    <li key={c.sku}>
                      <b>{c.name}</b> ({c.sku}): {c.before} → <b>{c.after}</b> — {c.note}
                    </li>
                  ))}
                </ul>
                {preview.bigChangeCount > preview.bigChanges.length ? <p className="pl-9 text-xs">…и още {preview.bigChangeCount - preview.bigChanges.length}</p> : null}
              </div>
            ) : null}
            {preview.stockColumn ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
                Файлът има колона „Наличност“: новите наличности важат до следващото зареждане на каталога от CSV файла, който е водещ за наличностите.
              </p>
            ) : null}
            {preview.samples.length ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-canvas text-xs font-extrabold uppercase text-muted">
                    <tr>
                      <th className="px-3 py-2">Продукт</th>
                      <th className="px-3 py-2">Сега</th>
                      <th className="px-3 py-2">След промяната</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.samples.map((s) => (
                      <tr key={s.sku}>
                        <td className="px-3 py-2">
                          <span className="line-clamp-1 font-bold">{s.name}</span>
                          <span className="text-xs text-muted">{s.sku}</span>
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{s.before}</td>
                        <td className="px-3 py-2 font-bold">{s.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.changed > preview.samples.length ? <p className="px-3 py-2 text-xs text-muted">…и още {preview.changed - preview.samples.length}</p> : null}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {preview.id ? (
                <button type="button" onClick={apply} disabled={pending} className="btn btn-primary h-12 px-6">
                  {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={3} />} Приложи промените ({preview.changed})
                </button>
              ) : (
                <p className="self-center font-bold text-ink-soft">Няма какво да се промени.</p>
              )}
              <button type="button" onClick={() => setPreview(null)} className="btn btn-ghost h-12 px-5">
                Отказ
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

const DIRECTIONS: { key: BulkInput["direction"]; label: string; help: string; icon: typeof TrendingUp }[] = [
  { key: "increase", label: "Увеличи редовните цени", help: "Напр. при поскъпване от доставчика.", icon: TrendingUp },
  { key: "decrease", label: "Намали редовните цени", help: "Трайно намаление — не е промоция и не показва зачертана цена.", icon: TrendingDown },
];

/** Percentage typed as text ("7,5") → number (NaN when it isn't one; the server re-checks the range). */
export const percentValue = (s: string) => Number(s.replace(",", ".").trim() || NaN);

type BulkForm = Omit<BulkInput, "percent"> & { percent: string };

function BulkChange({ categories, brands }: { categories: CategoryOption[]; brands: BrandOption[] }) {
  const [input, setInput] = useState<BulkForm>({ scope: "category", value: "", direction: "increase", percent: "5", round99: false });
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<BulkForm>) => {
    setInput((i) => ({ ...i, ...patch }));
    setPreview(null);
    setMessage(null);
  };
  const payload = (): BulkInput => ({ ...input, percent: percentValue(input.percent) });
  const pct = percentValue(input.percent);
  const pctOk = pct >= 1 && pct <= 90;
  const check = () =>
    start(async () => {
      const r = await previewBulkAction(payload());
      if ("error" in r) setMessage({ ok: false, text: r.error });
      else setPreview(r);
    });
  const apply = () =>
    start(async () => {
      const r = await applyBulkAction(payload());
      setPreview(null);
      setMessage(r.ok ? { ok: true, text: `Готово! Променени са ${r.changed} продукта. Новите цени вече са в сайта.` } : { ok: false, text: r.error ?? "Възникна грешка." });
    });

  const brand = brands.find((b) => b.slug === input.value);
  const scopeText =
    input.scope === "all"
      ? "всички продукти"
      : input.scope === "category"
        ? `„${categories.flatMap((c) => [c, ...c.subs]).find((c) => c.slug === input.value)?.name ?? ""}“`
        : `„${brand?.name ?? ""}“`;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-brand" /> Промяна на редовните цени с процент
        </span>
      }
      description="Повишете или намалете редовните цени на цяла категория или марка наведнъж. За намаление със зачертана цена използвайте „Промоции“."
    >
      <div className="space-y-5">
        <Field group label="1. За кои продукти?">
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <select className="field cursor-pointer" value={input.scope} onChange={(e) => set({ scope: e.target.value as BulkInput["scope"], value: "" })} aria-label="Обхват">
              <option value="category">Категория</option>
              <option value="brand">Марка</option>
              <option value="all">Всички продукти</option>
            </select>
            {input.scope === "category" ? (
              <CategorySelect value={input.value} onChange={(v) => set({ value: v })} categories={categories} allLabel="— Изберете категория —" ariaLabel="Категория" />
            ) : input.scope === "brand" ? (
              brand ? (
                <span className="flex items-center gap-2">
                  <span className="chip !border-ink">{brand.name}</span>
                  <button type="button" onClick={() => set({ value: "" })} className="btn btn-ghost h-10 px-3 text-sm">
                    <X className="h-4 w-4" /> Друга марка
                  </button>
                </span>
              ) : (
                <BrandPicker brands={brands} onPick={(b) => set({ value: b.slug })} />
              )
            ) : null}
          </div>
        </Field>

        <Field group label="2. Какво да се направи?">
          <div className="grid gap-2 sm:grid-cols-2">
            {DIRECTIONS.map(({ key, label, help, icon: Icon }) => (
              <label key={key} className={clsx("flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition", input.direction === key ? "border-brand bg-brand-soft/40" : "border-line hover:border-ink-soft")}>
                <input type="radio" name="bulk-direction" className="sr-only" checked={input.direction === key} onChange={() => set({ direction: key })} />
                <Icon className="h-6 w-6 shrink-0 text-brand" />
                <span>
                  <span className="block font-black">{label}</span>
                  <span className="text-sm text-ink-soft">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="3. С колко процента?" hint="От 1 до 90 %. Промо цените на отделни продукти се променят със същия процент.">
            <PercentInput value={input.percent} onChange={(percent) => set({ percent })} invalid={!pctOk} />
          </Field>
          <label className="flex items-center gap-2.5 self-center font-bold sm:pt-6">
            <input type="checkbox" checked={input.round99} onChange={(e) => set({ round99: e.target.checked })} className="h-5 w-5 accent-brand" />
            Закръгли цените до най-близкото ,99 (напр. 18,73 € → 18,99 €)
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={check} disabled={pending || !pctOk || (input.scope !== "all" && !input.value)} className="btn btn-ghost h-12 px-6">
            {pending && !preview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Провери какво ще се промени
          </button>
        </div>

        {preview ? (
          <div className="rounded-2xl border-2 border-sky bg-sky-soft/40 p-5">
            {preview.count ? (
              <>
                <p className="text-lg font-black">
                  Ще бъдат променени {preview.count} от {preview.inScope} продукта от {scopeText}.
                </p>
                {preview.unchanged ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    {preview.unchanged} {preview.unchanged === 1 ? "продукт остава" : "продукта остават"} със същата цена след закръглянето и не се променят.
                  </p>
                ) : null}
                <ul className="mt-3 space-y-1 text-sm">
                  {preview.samples.map((s) => (
                    <li key={s.sku} className="flex flex-wrap gap-x-2">
                      <span className="line-clamp-1 max-w-md font-bold">{s.name}:</span>
                      <span className="text-ink-soft">{s.before}</span> → <span className="font-bold">{s.after}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={apply} disabled={pending} className="btn btn-primary h-12 px-6">
                    {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={3} />} Да, приложи
                  </button>
                  <button type="button" onClick={() => setPreview(null)} className="btn btn-ghost h-12 px-5">
                    Отказ
                  </button>
                </div>
              </>
            ) : (
              <p className="font-bold">Няма продукти за промяна с този избор.</p>
            )}
          </div>
        ) : null}
        {message ? (
          <p className={clsx("flex items-center gap-2 rounded-2xl p-4 font-bold", message.ok ? "bg-mint-soft text-mint" : "bg-brand-soft text-brand-dark")} aria-live="polite">
            {message.ok ? <Check className="h-5 w-5 shrink-0" strokeWidth={3} /> : <CircleAlert className="h-5 w-5 shrink-0" />} {message.text}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** "20 %" box (whole or decimal percentages; the text is parsed when saving). */
export function PercentInput({ value, onChange, invalid, id }: { value: string; onChange: (v: string) => void; invalid?: boolean; id?: string }) {
  return (
    <div className={clsx("flex w-40 items-center rounded-[0.875rem] border-2 bg-white focus-within:border-sky", invalid ? "border-brand" : "border-line")}>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
        className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-lg font-bold outline-none focus-visible:outline-none"
      />
      <span className="pr-3.5 font-bold text-muted">%</span>
    </div>
  );
}

export function PriceTools({ categories, brands }: { categories: CategoryOption[]; brands: BrandOption[] }) {
  return (
    <div className="space-y-6">
      <FileImport categories={categories} />
      <BulkChange categories={categories} brands={brands} />
    </div>
  );
}
