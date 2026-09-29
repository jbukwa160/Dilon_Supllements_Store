"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, ChevronDown, CircleAlert, LoaderCircle, Save, Search } from "lucide-react";
import type { BrandManufacturerRow, ManufacturerInfo } from "@/lib/manufacturers";
import { saveManufacturerAction } from "@/app/admin/_actions/manufacturers";
import { Field, TextInput } from "./ui";

const EMPTY: ManufacturerInfo = { name: "", address: "", country: "", email: "", website: "", importer: "" };
/** Name and postal address are what the label needs (Reg. (EU) 1169/2011 Art. 9(1)(h)). */
const filled = (m: ManufacturerInfo | null) => !!m && !!m.name && !!m.address;
type Filter = "all" | "missing" | "done";
const PAGE = 60;

export function ManufacturersEditor({ brands, initialQuery = "" }: { brands: BrandManufacturerRow[]; initialQuery?: string }) {
  const [rows, setRows] = useState(brands);
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>(initialQuery ? "all" : "missing");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  // Brands saved just now stay on screen (with their confirmation) until the search or filter changes.
  const [keep, setKeep] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("bg");
    return rows.filter(
      (b) => keep.has(b.slug) || ((!t || b.name.toLocaleLowerCase("bg").includes(t) || (b.data?.name ?? "").toLocaleLowerCase("bg").includes(t)) && (filter === "all" || (filter === "done") === filled(b.data))),
    );
  }, [rows, q, filter, keep]);
  const done = rows.filter((b) => filled(b.data));
  const covered = done.reduce((n, b) => n + b.count, 0);
  const total = rows.reduce((n, b) => n + b.count, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-black">
            Попълнени: {done.length.toLocaleString("bg-BG")} от {rows.length.toLocaleString("bg-BG")} марки
          </p>
          <p className="text-sm font-bold text-muted">
            покриват {covered.toLocaleString("bg-BG")} от {total.toLocaleString("bg-BG")} продукта в сайта
          </p>
        </div>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-label="Продукти с попълнен производител"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={total ? Math.round((covered / total) * 100) : 0}
        >
          <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${total ? (covered / total) * 100 : 0}%` }} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Започнете от марките с най-много продукти — те са най-отгоре. Данните са на етикета („Произведено от…“, „Вносител:…“) или на сайта на производителя.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 basis-64 items-center rounded-[0.875rem] border-2 border-line bg-white px-3 focus-within:border-sky">
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setKeep(new Set());
              setLimit(PAGE);
            }}
            placeholder="Търсете марка или производител"
            aria-label="Търсене на марка"
            className="w-full bg-transparent px-2 py-2.5 outline-none focus-visible:outline-none"
          />
        </label>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as Filter);
            setKeep(new Set());
            setLimit(PAGE);
          }}
          className="field w-auto cursor-pointer"
          aria-label="Покажи"
        >
          <option value="missing">Непопълнени</option>
          <option value="done">Попълнени</option>
          <option value="all">Всички марки</option>
        </select>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
        {shown.slice(0, limit).map((b) => (
          <li key={b.slug}>
            <button type="button" onClick={() => setOpen(open === b.slug ? null : b.slug)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas" aria-expanded={open === b.slug}>
              <span className={clsx("grid h-7 w-7 shrink-0 place-items-center rounded-full", filled(b.data) ? "bg-mint text-white" : "bg-canvas text-muted")}>
                {filled(b.data) ? <Check className="h-4 w-4" strokeWidth={3} /> : <CircleAlert className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-black">{b.name}</span>
                <span className="block truncate text-xs font-bold text-muted">
                  {b.count === 1 ? "1 продукт" : `${b.count.toLocaleString("bg-BG")} продукта`}
                  {b.data?.name ? ` · ${b.data.name}` : ""}
                  {b.data?.country ? `, ${b.data.country}` : ""}
                </span>
              </span>
              <ChevronDown className={clsx("h-5 w-5 shrink-0 text-muted transition", open === b.slug && "rotate-180")} />
            </button>
            {open === b.slug ? (
              <BrandForm
                row={b}
                onSaved={(data) => {
                  setKeep((k) => new Set(k).add(b.slug));
                  setRows((all) => all.map((x) => (x.slug === b.slug ? { ...x, data } : x)));
                }}
              />
            ) : null}
          </li>
        ))}
        {!shown.length ? <li className="p-8 text-center text-sm font-bold text-ink-soft">{filter === "missing" && !q ? "Всички марки са попълнени." : "Няма марки."}</li> : null}
      </ul>
      {shown.length > limit ? (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="btn btn-ghost h-11 w-full">
          Покажи още ({(shown.length - limit).toLocaleString("bg-BG")})
        </button>
      ) : null}
    </div>
  );
}

function BrandForm({ row, onSaved }: { row: BrandManufacturerRow; onSaved: (m: ManufacturerInfo | null) => void }) {
  const [m, setM] = useState<ManufacturerInfo>(row.data ?? { ...EMPTY, name: row.name });
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof ManufacturerInfo, v: string) => {
    setM((x) => ({ ...x, [k]: v }));
    setStatus(null);
  };
  const save = () =>
    start(async () => {
      const r = await saveManufacturerAction(row.slug, m);
      if (r.ok) {
        const data = r.data && Object.values(r.data).some(Boolean) ? r.data : null;
        if (data) setM(data);
        setStatus({ ok: true, text: data ? "Запазено! Показва се при всички продукти на марката." : "Данните са изтрити." });
        onSaved(data);
      } else setStatus({ ok: false, text: r.error ?? "Възникна грешка." });
    });
  return (
    <div className="space-y-4 border-t border-line bg-canvas/50 p-4 md:p-5">
      <p className="text-sm font-extrabold">Производител или отговорен оператор на храни</p>
      <p className="-mt-3 text-xs text-muted">Фирмата, под чието име се продава продуктът (или вносителят в ЕС, ако производителят е извън ЕС) — както е на етикета.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Име на фирмата *">
          <TextInput value={m.name} onChange={(e) => set("name", e.target.value)} maxLength={160} placeholder="напр. Olimp Laboratories Sp. z o.o." />
        </Field>
        <Field label="Държава">
          <TextInput value={m.country} onChange={(e) => set("country", e.target.value)} maxLength={80} placeholder="напр. Полша" />
        </Field>
        <Field label="Адрес *" className="md:col-span-2">
          <TextInput value={m.address} onChange={(e) => set("address", e.target.value)} maxLength={300} placeholder="Улица, номер, пощенски код, град" />
        </Field>
        <Field label="Имейл">
          <TextInput type="email" value={m.email} onChange={(e) => set("email", e.target.value)} maxLength={120} placeholder="напр. info@firma.com" />
        </Field>
        <Field label="Сайт">
          <TextInput value={m.website} onChange={(e) => set("website", e.target.value)} maxLength={200} placeholder="https://…" />
        </Field>
        <Field label="Вносител / дистрибутор в България" className="md:col-span-2" hint="По желание: име и адрес на фирмата, която внася продукта в България.">
          <TextInput value={m.importer} onChange={(e) => set("importer", e.target.value)} maxLength={400} placeholder="напр. „Фирма“ ЕООД, гр. София, ул. …" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary h-11 px-6 !shadow-none">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Запази
        </button>
        <Link href={`/admin/produkti?marka=${encodeURIComponent(row.name)}`} className="text-sm font-bold text-sky hover:underline">
          Продуктите на марката →
        </Link>
        {status ? (
          <span className={clsx("text-sm font-bold", status.ok ? "text-mint" : "text-brand")} role={status.ok ? "status" : "alert"}>
            {status.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
