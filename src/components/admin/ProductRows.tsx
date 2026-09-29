"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, CircleAlert, ExternalLink, LoaderCircle, Pencil, Save, X } from "lucide-react";
import type { AdminProductRow, AdminQuery, CategoryOption, Choice } from "@/lib/admin/products";
import { formatPrice } from "@/lib/format";
import { moneyText } from "@/lib/admin/validate";
import { saveProductRowsAction } from "@/app/admin/_actions/products";
import { BulkBar, products } from "./BulkBar";
import { useUnsavedWarning } from "./ui";

type Draft = { price: string; salePrice: string; stock: string; hidden: boolean };

const draftOf = (p: AdminProductRow): Draft => ({ price: moneyText(p.basePrice), salePrice: moneyText(p.salePrice), stock: String(p.stock), hidden: p.hidden });
const sameDraft = (a: Draft, b: Draft) => a.price === b.price && a.salePrice === b.salePrice && a.stock === b.stock && a.hidden === b.hidden;
const eur = (n: number) => formatPrice(n, "bg");

/** "30.11.2026" from a stored sale end ("2026-11-30" or "2026-11-30T23:59"). */
const shortDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
};

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={clsx("rounded-full px-2 py-0.5 text-[0.7rem] font-bold", className)}>{children}</span>;
}

type RowProps = {
  p: AdminProductRow;
  draft: Draft;
  error?: string;
  onChange: (d: Draft) => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
};

/** What the table row and the card (narrow screens) share: the saved values, the setter, input styling. */
function rowModel({ p, draft, onChange }: RowProps) {
  const saved = draftOf(p);
  const set = (k: keyof Draft, v: string | boolean) => {
    const next = { ...draft, [k]: v };
    // The importer's placeholder sale goes away with the placeholder price (as on the server).
    if (k === "price" && p.demoPrice && saved.salePrice && draft.salePrice === saved.salePrice) next.salePrice = "";
    onChange(next);
  };
  const input = (changed: boolean, error?: string) =>
    clsx(
      "w-full rounded-lg border-2 bg-white px-2 py-1.5 text-right font-bold outline-none focus:border-sky",
      error ? "border-brand" : changed ? "border-sun bg-sun-soft/40" : "border-line",
    );
  return { saved, set, input, reduced: p.price < p.basePrice - 0.001, hidden: draft.hidden };
}

function Thumb({ p, hidden }: { p: AdminProductRow; hidden: boolean }) {
  return (
    <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-white p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.image ?? "/placeholder.svg"} alt="" loading="lazy" referrerPolicy="no-referrer" className={clsx("h-full w-full object-contain", hidden && "opacity-40")} />
    </span>
  );
}

function NameAndTags({ p, hidden }: { p: AdminProductRow; hidden: boolean }) {
  return (
    <>
      <Link href={`/admin/produkti/${p.id}`} className="line-clamp-2 font-bold leading-snug hover:text-brand">
        {p.name}
      </Link>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
        <span>{p.sku}</span>
        {p.ean ? <span>· баркод {p.ean}</span> : null}
        {p.brand ? <span>· {p.brand}</span> : null}
        <span>· {p.categoryLabel}</span>
        {p.variant ? <span className="font-bold text-ink-soft">· {p.variant}</span> : null}
        {p.familySize > 1 ? <span>· семейство от {p.familySize}</span> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {hidden ? <Tag className="bg-ink text-white">Скрит</Tag> : null}
        {p.custom ? <Tag className="bg-sky-soft text-sky">Добавен ръчно</Tag> : null}
        {p.adminEdited && !p.custom ? <Tag className="bg-grape-soft text-grape">Редактиран</Tag> : null}
        {p.demoPrice ? <Tag className="bg-sun-soft text-ink">Демо цена</Tag> : null}
        {p.adultOnly ? <Tag className="bg-brand-soft text-brand-dark">18+</Tag> : null}
        {!p.image ? <Tag className="bg-line text-muted">Без снимка</Tag> : null}
        {p.kind === "non-food" ? <Tag className="bg-canvas text-muted">Аксесоар</Tag> : null}
      </div>
    </>
  );
}

function PriceNow({ p, reduced, className }: { p: AdminProductRow; reduced: boolean; className?: string }) {
  return (
    <span className={className}>
      <span className={clsx("block font-black", reduced && "text-brand")}>{eur(p.price)}</span>
      {p.oldPrice != null ? <span className="block text-xs text-muted line-through">{eur(p.oldPrice)}</span> : null}
      {reduced && p.promoId ? <span className="block text-[0.7rem] font-bold text-brand">промоция</span> : null}
    </span>
  );
}

function VisibleSwitch({ p, hidden, changed, onToggle, className }: { p: AdminProductRow; hidden: boolean; changed: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!hidden}
      onClick={onToggle}
      title={hidden ? "Скрит — натиснете, за да се показва в сайта" : "Показва се — натиснете, за да го скриете"}
      className={clsx("relative h-7 w-12 shrink-0 rounded-full transition", !hidden ? "bg-mint" : "bg-line", changed && "ring-2 ring-sun ring-offset-2", className)}
    >
      <span className={clsx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", !hidden ? "left-6" : "left-1")} />
      <span className="sr-only">Показване на {p.name} в сайта</span>
    </button>
  );
}

function Actions({ p, size }: { p: AdminProductRow; size: "sm" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <div className="flex justify-end gap-1.5">
      <Link href={`/admin/produkti/${p.id}`} className={clsx("btn btn-ghost !px-0", box)} title="Редактирай — снимки, етикет, описание, цели" aria-label={`Редактирай ${p.name}`}>
        <Pencil className="h-4 w-4" />
      </Link>
      {!p.hidden ? (
        <a href={`/produkt/${p.slug}`} target="_blank" rel="noopener" className={clsx("btn btn-ghost !px-0", box)} title="Виж в сайта" aria-label={`Виж ${p.name} в сайта`}>
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}

function RowError({ error, className }: { error?: string; className?: string }) {
  return error ? (
    <p className={clsx("mt-1.5 flex items-start gap-1 text-xs font-bold text-brand", className)} role="alert">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
    </p>
  ) : null;
}

/** Wide screens (xl+): one table row. */
function Row(props: RowProps) {
  const { p, draft, error, selected, onSelect } = props;
  const { saved, set, input, reduced, hidden } = rowModel(props);

  return (
    <tr className={clsx("align-top", hidden && "bg-canvas/70", selected && "!bg-sky-soft/60")}>
      <td className="py-3 pl-4 pr-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="mt-5 h-5 w-5 cursor-pointer accent-[var(--color-sky)]"
          aria-label={`Избери ${p.name}`}
        />
      </td>
      <td className="py-3 pr-2">
        <Thumb p={p} hidden={hidden} />
      </td>
      <td className="min-w-64 py-3 pr-3">
        <NameAndTags p={p} hidden={hidden} />
      </td>
      <td className="w-24 py-3 pr-2">
        <input className={input(draft.price !== saved.price, error)} value={draft.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" aria-label={`Цена на ${p.name}`} />
      </td>
      <td className="w-24 py-3 pr-2">
        <input
          className={input(draft.salePrice !== saved.salePrice, error)}
          value={draft.salePrice}
          onChange={(e) => set("salePrice", e.target.value)}
          inputMode="decimal"
          placeholder="—"
          aria-label={`Промо цена на ${p.name}`}
        />
        {p.salePrice != null && p.saleEndsAt && draft.salePrice === saved.salePrice ? (
          <span className="mt-1 block text-right text-[0.7rem] font-bold text-muted">до {shortDate(p.saleEndsAt)}</span>
        ) : null}
      </td>
      <td className="w-24 py-3 pr-2 text-right">
        <PriceNow p={p} reduced={reduced} className="mt-1.5 block" />
      </td>
      <td className="w-20 py-3 pr-2">
        <input className={input(draft.stock !== saved.stock, error)} value={draft.stock} onChange={(e) => set("stock", e.target.value)} inputMode="numeric" aria-label={`Наличност на ${p.name}`} />
      </td>
      <td className="w-16 py-3 pr-2 text-center">
        <VisibleSwitch p={p} hidden={hidden} changed={hidden !== saved.hidden} onToggle={() => set("hidden", !hidden)} className="mt-1.5" />
      </td>
      <td className="w-24 py-3 pr-4">
        <Actions p={p} size="sm" />
        <RowError error={error} className="justify-end text-right" />
      </td>
    </tr>
  );
}

/**
 * Narrower screens (below xl — phones, tablets and 1024 px laptops next to the sidebar): one card per product with
 * every field visible, no sideways scrolling.
 */
function Card(props: RowProps) {
  const { p, draft, error, selected, onSelect } = props;
  const { saved, set, input, reduced, hidden } = rowModel(props);
  const label = "mb-1 block text-xs font-extrabold uppercase tracking-wide text-muted";

  return (
    <li className={clsx("rounded-3xl border p-4", selected ? "border-sky bg-sky-soft/40" : hidden ? "border-line bg-canvas/70" : "border-line bg-white")}>
      <div className="flex items-start gap-3">
        <label className="-m-2 grid h-11 w-11 shrink-0 cursor-pointer place-items-center" title="Избери">
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} className="h-5 w-5 cursor-pointer accent-[var(--color-sky)]" aria-label={`Избери ${p.name}`} />
        </label>
        <Thumb p={p} hidden={hidden} />
        <div className="min-w-0 flex-1">
          <NameAndTags p={p} hidden={hidden} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className={label}>Цена €</span>
          <input className={input(draft.price !== saved.price, error)} value={draft.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" aria-label={`Цена на ${p.name}`} />
        </label>
        <label className="block">
          <span className={label}>Промо цена €</span>
          <input
            className={input(draft.salePrice !== saved.salePrice, error)}
            value={draft.salePrice}
            onChange={(e) => set("salePrice", e.target.value)}
            inputMode="decimal"
            placeholder="—"
            aria-label={`Промо цена на ${p.name}`}
          />
          {p.salePrice != null && p.saleEndsAt && draft.salePrice === saved.salePrice ? (
            <span className="mt-1 block text-right text-[0.7rem] font-bold text-muted">до {shortDate(p.saleEndsAt)}</span>
          ) : null}
        </label>
        <label className="block">
          <span className={label}>Наличност</span>
          <input className={input(draft.stock !== saved.stock, error)} value={draft.stock} onChange={(e) => set("stock", e.target.value)} inputMode="numeric" aria-label={`Наличност на ${p.name}`} />
        </label>
        <div>
          <span className={label} title="Какво плаща клиентът сега — след промо цената и промоциите от „Цени и промоции“.">
            Цена сега
          </span>
          <PriceNow p={p} reduced={reduced} className="block pt-1.5" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex items-center gap-2.5 text-sm font-bold">
          <VisibleSwitch p={p} hidden={hidden} changed={hidden !== saved.hidden} onToggle={() => set("hidden", !hidden)} />
          <span aria-hidden className={hidden ? "text-muted" : "text-mint"}>
            {hidden ? "Скрит" : "В сайта"}
          </span>
        </div>
        <Actions p={p} size="lg" />
      </div>
      <RowError error={error} />
    </li>
  );
}

/**
 * The product table: price, sale price, stock and visibility are edited in place and saved together
 * ("Запази промените"); ticked rows get the bulk actions bar.
 */
export function ProductRows({
  items,
  total,
  query,
  categories,
  goals,
  diets,
  kinds,
}: {
  items: AdminProductRow[];
  /** Products the current search found (all pages). */
  total: number;
  query: AdminQuery;
  categories: CategoryOption[];
  goals: Choice[];
  diets: Choice[];
  kinds: Choice[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allFound, setAllFound] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byId = new Map(items.map((p) => [p.id, p]));
  const dirtyIds = Object.keys(drafts)
    .map(Number)
    .filter((id) => byId.has(id) && !sameDraft(drafts[id], draftOf(byId.get(id)!)));
  useUnsavedWarning(dirtyIds.length > 0);

  const change = (p: AdminProductRow, d: Draft) => {
    setNotice(null);
    setSaveError(null);
    setRowErrors((e) => {
      if (!(p.id in e)) return e;
      const next = { ...e };
      delete next[p.id];
      return next;
    });
    setDrafts((all) => {
      const next = { ...all };
      if (sameDraft(d, draftOf(p))) delete next[p.id];
      else next[p.id] = d;
      return next;
    });
  };

  const save = () =>
    start(async () => {
      setSaveError(null);
      const rows = dirtyIds.map((id) => ({ id, ...drafts[id] }));
      const r = await saveProductRowsAction(rows);
      if (r.ok) {
        setDrafts({});
        setRowErrors({});
        setNotice(r.saved ? `Запазено! Промените в ${products(r.saved)} вече са в сайта.` : "Няма промени за запазване.");
        router.refresh();
      } else {
        setRowErrors(r.rowErrors ?? {});
        setSaveError(r.error ?? "Промените не бяха запазени.");
      }
    });

  const onSelect = (id: number, on: boolean) => {
    setAllFound(false);
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };
  const allOnPage = items.length > 0 && items.every((p) => selected.has(p.id));

  return (
    <>
      {notice ? (
        <p className="mb-3 flex items-center gap-2 rounded-2xl bg-mint-soft px-4 py-3 font-bold text-mint" role="status">
          <Check className="h-5 w-5 shrink-0" strokeWidth={3} /> <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white" aria-label="Затвори съобщението">
            <X className="h-4 w-4" />
          </button>
        </p>
      ) : null}
      {/* Below xl the admin's content column is too narrow for the 9-column table (~920 px): one card per product. */}
      <div className="xl:hidden">
        <label className="mb-3 inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-full border border-line bg-white px-4 text-sm font-bold">
          <input
            type="checkbox"
            checked={allOnPage}
            onChange={(e) => {
              setAllFound(false);
              setSelected(e.target.checked ? new Set(items.map((p) => p.id)) : new Set());
            }}
            className="h-5 w-5 cursor-pointer accent-[var(--color-sky)]"
          />
          Избери всички на тази страница
        </label>
        <ul className="space-y-3">
          {items.map((p) => (
            <Card
              key={p.id}
              p={p}
              draft={drafts[p.id] ?? draftOf(p)}
              error={rowErrors[p.id]}
              onChange={(d) => change(p, d)}
              selected={selected.has(p.id)}
              onSelect={(on) => onSelect(p.id, on)}
            />
          ))}
        </ul>
      </div>

      <div className="relative hidden overflow-x-auto rounded-3xl border border-line bg-white xl:block">
        <table className="w-full min-w-[920px] text-left text-[0.95rem]">
          <thead className="border-b border-line bg-canvas text-xs font-extrabold uppercase tracking-wide text-muted">
            <tr>
              <th className="py-3 pl-4 pr-1">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={(e) => {
                    setAllFound(false);
                    setSelected(e.target.checked ? new Set(items.map((p) => p.id)) : new Set());
                  }}
                  className="h-5 w-5 cursor-pointer accent-[var(--color-sky)]"
                  aria-label="Избери всички на тази страница"
                />
              </th>
              <th className="py-3 pr-2">
                <span className="sr-only">Снимка</span>
              </th>
              <th className="py-3">Продукт</th>
              <th className="py-3 pr-2 text-right" title="Редовната цена с ДДС.">
                Цена €
              </th>
              <th className="whitespace-nowrap py-3 pr-2 text-right" title="Намалена цена на този продукт. Празно = без промо цена.">
                Промо цена €
              </th>
              <th className="whitespace-nowrap py-3 pr-2 text-right" title="Какво плаща клиентът сега — след промо цената и промоциите от „Цени и промоции“.">
                Цена сега
              </th>
              <th className="py-3 pr-2 text-right">Наличност</th>
              <th className="py-3 pr-2 text-center">В сайта</th>
              <th className="py-3 pr-4">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((p) => (
              <Row
                key={p.id}
                p={p}
                draft={drafts[p.id] ?? draftOf(p)}
                error={rowErrors[p.id]}
                onChange={(d) => change(p, d)}
                selected={selected.has(p.id)}
                onSelect={(on) => onSelect(p.id, on)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Outside the scrolling table, so they stick to the bottom of the screen. */}
      {dirtyIds.length || selected.size ? (
        <div className="sticky bottom-0 z-20 -mx-4 mt-3 md:-mx-8">
          {dirtyIds.length ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:px-8">
              <button type="button" onClick={save} disabled={pending} className="btn btn-primary h-12 px-7">
                {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                {pending ? "Запазване…" : "Запази промените"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrafts({});
                  setRowErrors({});
                  setSaveError(null);
                }}
                disabled={pending}
                className="btn btn-ghost h-12 px-5"
              >
                Отказ
              </button>
              <span className="text-sm font-bold" aria-live="polite">
                {saveError ? (
                  <span className="flex items-center gap-1.5 text-brand">
                    <CircleAlert className="h-4 w-4" /> {saveError}
                  </span>
                ) : (
                  <span className="text-muted">Незапазени промени в {dirtyIds.length === 1 ? "1 ред" : `${dirtyIds.length} реда`}</span>
                )}
              </span>
            </div>
          ) : null}
          {selected.size ? (
            <BulkBar
              count={allFound ? total : selected.size}
              offerAll={allOnPage && total > items.length && !allFound}
              total={total}
              onSelectAll={() => setAllFound(true)}
              onClear={() => {
                setSelected(new Set());
                setAllFound(false);
              }}
              target={allFound ? { all: query } : { ids: [...selected] }}
              categories={categories}
              goals={goals}
              diets={diets}
              kinds={kinds}
              onDone={(text) => {
                setNotice(text);
                setSelected(new Set());
                setAllFound(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
