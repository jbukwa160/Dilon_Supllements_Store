"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { CalendarClock, Check, CircleAlert, Copy, EyeOff, Info, LoaderCircle, Pencil, Plus, Save, Square, Tag, Trash2, X } from "lucide-react";
import {
  deletePromotionAction,
  duplicatePromotionAction,
  previewPromotionAction,
  savePromotionAction,
  stopPromotionAction,
} from "@/app/admin/_actions/promotions";
import type { PromoProduct, PromotionInput, PromotionPreview, PromotionRow, PromotionScope, PromotionScopeOptions, PromotionStatus } from "@/lib/admin/promotions";
import { formatPrice } from "@/lib/format";
import { Card, DateTimeInput, Field, L10nInput, TextInput, Toggle, useUnsavedWarning } from "./ui";
import { BrandPicker, CategorySelect, PercentInput, percentValue } from "./PriceTools";
import { ProductSearch } from "./ProductSearch";

type Draft = Omit<PromotionInput, "percent"> & { percent: string; products: PromoProduct[] };

const SCOPES: { key: PromotionScope; label: string }[] = [
  { key: "all", label: "Всички продукти" },
  { key: "category", label: "Категории" },
  { key: "brand", label: "Марки" },
  { key: "goal", label: "Цели" },
  { key: "skus", label: "Избрани продукти" },
];

const STATUS: Record<PromotionStatus, { label: string; className: string }> = {
  active: { label: "Активна", className: "bg-mint-soft text-mint" },
  scheduled: { label: "Предстои", className: "bg-sky-soft text-sky" },
  ended: { label: "Приключила", className: "bg-line text-muted" },
  off: { label: "Изключена", className: "bg-line text-muted" },
};

const money = (n: number) => formatPrice(n, "bg");
/** 18.8 → "18,8 %" */
const pctText = (n: number) => `${String(n).replace(".", ",")} %`;
/** "2026-11-27T09:00" (Bulgarian time) → "27.11.2026, 09:00". */
const when = (v: string) => (v ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}, ${v.slice(11, 16)}` : "");

const emptyDraft = (): Draft => ({
  id: null,
  name: "",
  percent: "20",
  scope: "category",
  values: [],
  round99: false,
  startsAt: "",
  endsAt: "",
  badge: { bg: "", en: "" },
  enabled: true,
  products: [],
});

function toDraft(p: PromotionRow): Draft {
  return {
    id: p.id,
    name: p.name,
    percent: String(p.percent).replace(".", ","),
    scope: p.scope,
    values: p.values,
    round99: p.round99,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    badge: p.badge,
    enabled: p.enabled,
    products: p.products,
  };
}

function toInput(d: Draft): PromotionInput {
  const { products, ...rest } = d;
  void products;
  return { ...rest, percent: percentValue(d.percent), values: d.scope === "all" ? [] : d.values };
}

/** Slug → readable name for the scope chips and summaries. */
function scopeNamer(options: PromotionScopeOptions) {
  const cat = new Map(options.categories.flatMap((c) => [[c.slug, c.name] as const, ...c.subs.map((s) => [s.slug, `${c.name} › ${s.name}`] as const)]));
  const brand = new Map(options.brands.map((b) => [b.slug, b.name]));
  const goal = new Map(options.goals.map((g) => [g.slug, g.name]));
  return (scope: PromotionScope, slug: string) => (scope === "category" ? cat.get(slug) : scope === "brand" ? brand.get(slug) : scope === "goal" ? goal.get(slug) : slug) ?? slug;
}

function scopeSummary(p: { scope: PromotionScope; values: string[] }, name: (s: PromotionScope, v: string) => string): string {
  if (p.scope === "all") return "Всички продукти";
  if (p.scope === "skus") return `${p.values.length} избрани продукта`;
  const label = p.scope === "category" ? "Категории" : p.scope === "brand" ? "Марки" : "Цели";
  const names = p.values.slice(0, 4).map((v) => name(p.scope, v));
  return `${label}: ${names.join(", ")}${p.values.length > 4 ? ` и още ${p.values.length - 4}` : ""}`;
}

function period(p: { startsAt: string; endsAt: string }): string {
  if (p.startsAt && p.endsAt) return `от ${when(p.startsAt)} до ${when(p.endsAt)}`;
  if (p.startsAt) return `от ${when(p.startsAt)}, без край`;
  if (p.endsAt) return `до ${when(p.endsAt)}`;
  return "без срок — от включването до спирането";
}

// ---------------------------------------------------------------------------

function ScopeValues({ draft, set, options, name }: { draft: Draft; set: (p: Partial<Draft>) => void; options: PromotionScopeOptions; name: (s: PromotionScope, v: string) => string }) {
  const add = (v: string) => {
    if (v && !draft.values.includes(v)) set({ values: [...draft.values, v] });
  };
  const remove = (v: string) => set({ values: draft.values.filter((x) => x !== v) });

  if (draft.scope === "all") return <p className="text-sm text-ink-soft">Промоцията важи за всеки продукт в магазина.</p>;

  if (draft.scope === "goal") {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label="Цели">
        {options.goals.map((g) => {
          const on = draft.values.includes(g.slug);
          return (
            <button key={g.slug} type="button" aria-pressed={on} onClick={() => (on ? remove(g.slug) : add(g.slug))} className={clsx("chip", on && "!border-ink !bg-ink !text-white")}>
              {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null} {g.name}
            </button>
          );
        })}
      </div>
    );
  }

  if (draft.scope === "skus") {
    return (
      <div className="space-y-3">
        <ProductSearch
          onAdd={(p) => {
            if (draft.values.includes(p.sku)) return;
            set({
              values: [...draft.values, p.sku],
              products: [...draft.products, { sku: p.sku, name: p.name, variant: p.variant, image: p.image, price: p.price, hidden: p.hidden }],
            });
          }}
          isAdded={(sku) => draft.values.includes(sku)}
        />
        {draft.values.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {draft.values.map((sku) => {
              const p = draft.products.find((x) => x.sku === sku);
              return (
                <li key={sku} className="flex items-center gap-3 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p?.image ?? "/placeholder.svg"} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg border border-line object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-bold">{p?.name ?? sku}</span>
                    <span className="text-xs text-muted">
                      {[p?.variant, sku, p ? money(p.price) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => set({ values: draft.values.filter((x) => x !== sku), products: draft.products.filter((x) => x.sku !== sku) })}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-brand hover:bg-brand-soft"
                    aria-label={`Премахни ${p?.name ?? sku}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {draft.values.length ? (
        <div className="flex flex-wrap gap-2">
          {draft.values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-ink py-1 pl-3 pr-1 text-sm font-bold text-white">
              {name(draft.scope, v)}
              <button type="button" onClick={() => remove(v)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/20" aria-label={`Премахни ${name(draft.scope, v)}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="max-w-md">
        {draft.scope === "category" ? (
          <CategorySelect value="" onChange={add} categories={options.categories} allLabel="+ Добави категория…" ariaLabel="Добави категория" />
        ) : (
          <BrandPicker brands={options.brands} onPick={(b) => add(b.slug)} placeholder="+ Добави марка — напишете името" />
        )}
      </div>
    </div>
  );
}

function PreviewBox({ preview, draft }: { preview: PromotionPreview; draft: Draft }) {
  const pct = percentValue(draft.percent);
  const range = preview.percentRange;
  const spread = !!range && range.min !== range.max;
  const badgeMismatch = preview.badgePercent !== null && !!range && (Math.abs(range.min - preview.badgePercent) > 0.5 || Math.abs(range.max - preview.badgePercent) > 0.5);
  return (
    <div className="rounded-2xl border-2 border-sky bg-sky-soft/40 p-5" aria-live="polite">
      {preview.timing === "off" ? (
        <p className="font-black">Промоцията е изключена — цените няма да се променят, докато не я включите.</p>
      ) : preview.timing === "ended" ? (
        <p className="font-black">Краят на промоцията е минал — тя няма да промени цени.</p>
      ) : (
        <p className="text-lg font-black">
          {preview.timing === "later" ? `От ${when(draft.startsAt)} ` : "Веднага след запазване "}
          ще поевтинеят {preview.willChange} от {preview.inScope} продукта в обхвата.
        </p>
      )}
      {preview.samples.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-canvas text-xs font-extrabold uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Продукт</th>
                <th className="px-3 py-2">Цена без промоцията</th>
                <th className="px-3 py-2">С промоцията</th>
                <th className="px-3 py-2">Отстъпка от редовната</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.samples.map((s) => (
                <tr key={s.sku}>
                  <td className="px-3 py-2">
                    <span className="line-clamp-1 font-bold">{s.name}</span>
                    <span className="text-xs text-muted">{s.sku}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{money(s.before)}</td>
                  <td className="px-3 py-2 font-bold">{money(s.after)}</td>
                  <td className={clsx("px-3 py-2 font-bold", Math.abs(s.percent - pct) > 2 && "text-brand-dark")}>−{pctText(s.percent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.willChange > preview.samples.length ? <p className="px-3 py-2 text-xs text-muted">…и още {preview.willChange - preview.samples.length}</p> : null}
        </div>
      ) : null}
      {range ? (
        <p className="mt-3 text-sm font-bold">
          Реална отстъпка от редовната цена: {spread ? `от ${pctText(range.min)} до ${pctText(range.max)}` : pctText(range.min)}
          {draft.round99 ? <span className="font-normal text-ink-soft"> (заради закръглянето до ,99)</span> : null}
        </p>
      ) : null}
      {preview.drifting ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-sun-soft p-3 text-sm font-bold text-ink" role="status">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            При {preview.drifting} продукта закръглянето до ,99 отдалечава отстъпката с повече от 2 пункта от −{pctText(pct)}. Ако искате точно −{pctText(pct)} за
            всички, изключете закръглянето.
          </span>
        </p>
      ) : null}
      {badgeMismatch && range ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-sun-soft p-3 text-sm font-bold text-ink" role="status">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Етикетът обещава −{pctText(preview.badgePercent!)}, а реалната отстъпка е {spread ? `от ${pctText(range.min)} до ${pctText(range.max)}` : pctText(range.min)}.
            Махнете процента от етикета (напр. само „Black Friday“) или изключете закръглянето до ,99.
          </span>
        </p>
      ) : null}
      {preview.alreadyCheaper ? (
        <div className="mt-3 text-sm">
          <p className="font-bold">
            {preview.alreadyCheaper} продукта вече са на същата или по-ниска цена (собствена промо цена или друга промоция) и остават без промяна:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
            {preview.cheaperSamples.map((s) => (
              <li key={s.sku}>
                {s.name}: сега {money(s.current)}, с −{pct}% би бил {money(s.promo)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-ink-soft">
        Зачертаната цена в сайта ще е най-ниската цена от последните 30 дни (правило „Омнибус“), затова процентът върху картата може да е малко по-малък от −{pct}%.
      </p>
    </div>
  );
}

function PromotionForm({
  initial,
  options,
  name,
  onClose,
  onSaved,
}: {
  initial: Draft;
  options: PromotionScopeOptions;
  name: (s: PromotionScope, v: string) => string;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useUnsavedWarning(dirty);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setPreview(null);
    setError(null);
  };
  const pct = percentValue(draft.percent);
  const check = () =>
    start(async () => {
      const r = await previewPromotionAction(toInput(draft));
      if ("error" in r) setError({ text: r.error, field: r.field });
      else setPreview(r);
    });
  const save = () =>
    start(async () => {
      const r = await savePromotionAction(toInput(draft));
      if (r.ok) onSaved(`Промоцията „${draft.name.trim()}“ е запазена. Цените в сайта са обновени (${r.changed ?? 0} продукта с нова цена).`);
      else setError({ text: r.error ?? "Възникна грешка.", field: r.field });
    });
  const err = (field: string) => (error?.field === field ? error.text : undefined);

  return (
    <Card
      title={draft.id ? `Промяна на „${initial.name}“` : "Нова промоция"}
      description="Процент отстъпка за група продукти. Цените се сменят автоматично в началото и се връщат в края."
      className="border-2 !border-ink"
      actions={
        <button type="button" onClick={() => (!dirty || confirm("Да затворя ли без запазване?")) && onClose()} className="btn btn-ghost h-10 px-4 text-sm">
          <X className="h-4 w-4" /> Затвори
        </button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <Field label="Име на промоцията" hint="Вижда се само в админ панела, напр. „Black Friday 2026“ или „-15% на протеините“." error={err("name")}>
            <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} invalid={!!err("name")} placeholder="напр. Black Friday 2026" />
          </Field>
          <Field label="Отстъпка" hint="От 1 до 90 %." error={err("percent")}>
            <PercentInput value={draft.percent} onChange={(percent) => set({ percent })} invalid={!!err("percent") || !(pct >= 1 && pct <= 90)} />
          </Field>
        </div>

        <Field group label="За кои продукти важи?" error={err("values") ?? err("scope")}>
          <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Обхват">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={draft.scope === s.key}
                onClick={() => draft.scope !== s.key && set({ scope: s.key, values: [], products: [] })}
                className={clsx("chip", draft.scope === s.key && "!border-ink !bg-ink !text-white")}
              >
                {s.label}
              </button>
            ))}
          </div>
          <ScopeValues draft={draft} set={set} options={options} name={name} />
        </Field>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field group label="Начало" hint="Празно = веднага след запазване. Часът е българско време." error={err("startsAt")}>
            <DateTimeInput value={draft.startsAt} onChange={(startsAt) => set({ startsAt })} label="Начало" invalid={!!err("startsAt")} />
          </Field>
          <Field group label="Край" hint="Празно = без край (спирате я ръчно с „Спри сега“)." error={err("endsAt")}>
            <DateTimeInput value={draft.endsAt} onChange={(endsAt) => set({ endsAt })} defaultTime="23:59" label="Край" invalid={!!err("endsAt")} />
          </Field>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field group label="Етикет върху продуктите (по желание)" hint="Кратък надпис на картите на продуктите, напр. „Black Friday“. Празно = само процентът.">
            <L10nInput value={draft.badge} onChange={(badge) => set({ badge })} label="Етикет" maxLength={30} placeholder="напр. Black Friday" />
          </Field>
          <div className="space-y-4 lg:pt-7">
            <label className="flex items-start gap-2.5 font-bold">
              <input type="checkbox" checked={draft.round99} onChange={(e) => set({ round99: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
              <span>
                Закръгли промо цените до най-близкото ,99 (напр. 20,79 € → 20,99 €; 12,39 € → 11,99 €)
                <span className="block text-sm font-normal text-ink-soft">Тогава отстъпката за отделните продукти леко се различава от процента — прегледът я показва.</span>
              </span>
            </label>
            <Toggle checked={draft.enabled} onChange={(enabled) => set({ enabled })} label="Промоцията е включена" description="Изключена промоция остава в списъка, но не променя цените." />
          </div>
        </div>

        {preview ? <PreviewBox preview={preview} draft={draft} /> : null}
        {error && !error.field ? (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-soft p-4 font-bold text-brand-dark" role="alert">
            <CircleAlert className="h-5 w-5 shrink-0" /> {error.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-line pt-5">
          <button type="button" onClick={check} disabled={pending} className="btn btn-ghost h-12 px-6">
            {pending && !preview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Провери какво ще се промени
          </button>
          <button type="button" onClick={save} disabled={pending} className="btn btn-primary h-12 px-7">
            {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} {draft.id ? "Запази промените" : "Запази промоцията"}
          </button>
          <button type="button" onClick={() => (!dirty || confirm("Да затворя ли без запазване?")) && onClose()} className="btn btn-ghost h-12 px-5">
            Отказ
          </button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PromotionItem({
  p,
  name,
  busy,
  onEdit,
  onAction,
}: {
  p: PromotionRow;
  name: (s: PromotionScope, v: string) => string;
  busy: boolean;
  onEdit: () => void;
  onAction: (kind: "stop" | "copy" | "delete") => void;
}) {
  const btn = "grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:border-ink disabled:opacity-30";
  const running = p.status === "active" || p.status === "scheduled";
  return (
    <li className="rounded-2xl border-2 border-line p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-14 w-16 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg font-black text-brand-dark">−{String(p.percent).replace(".", ",")}%</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black">{p.name}</span>
            <span className={clsx("rounded-full px-3 py-1 text-xs font-extrabold", STATUS[p.status].className)}>{STATUS[p.status].label}</span>
            {p.badge.bg ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-2 py-0.5 text-[0.7rem] font-bold text-ink">
                <Tag className="h-3 w-3" /> {p.badge.bg}
              </span>
            ) : null}
            {p.round99 ? <span className="rounded-full bg-canvas px-2 py-0.5 text-[0.7rem] font-bold text-muted">,99</span> : null}
          </div>
          <p className="mt-0.5 text-sm text-ink-soft">{scopeSummary(p, name)}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CalendarClock className="h-4 w-4 shrink-0" /> {period(p)}
          </p>
          <p className="mt-1 text-sm font-bold">
            {p.inScope} продукта в обхвата
            {p.status === "active" ? <span className="text-mint"> · {p.applied} са с цена от тази промоция</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={onEdit} disabled={busy} className="btn btn-ghost h-9 px-3 text-sm">
            <Pencil className="h-4 w-4" /> Промени
          </button>
          {running ? (
            <button type="button" onClick={() => onAction("stop")} disabled={busy} className="btn h-9 bg-sun-soft px-3 text-sm text-ink hover:bg-sun">
              {p.status === "active" ? <Square className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {p.status === "active" ? "Спри сега" : "Отмени"}
            </button>
          ) : null}
          <button type="button" className={btn} onClick={() => onAction("copy")} disabled={busy} title="Направи копие" aria-label={`Копие на ${p.name}`}>
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" className={clsx(btn, "text-brand hover:border-brand")} onClick={() => onAction("delete")} disabled={busy} title="Изтрий" aria-label={`Изтрий ${p.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

const GROUPS: { title: string; statuses: PromotionStatus[] }[] = [
  { title: "Активни сега", statuses: ["active"] },
  { title: "Предстоящи", statuses: ["scheduled"] },
  { title: "Приключили и изключени", statuses: ["ended", "off"] },
];

export function PromotionsEditor({ promotions, options }: { promotions: PromotionRow[]; options: PromotionScopeOptions }) {
  const [form, setForm] = useState<{ key: number; draft: Draft } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const name = useMemo(() => scopeNamer(options), [options]);

  const open = (draft: Draft) => {
    setMessage(null);
    setForm({ key: Date.now(), draft });
    requestAnimationFrame(() => document.getElementById("promotion-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const act = (p: PromotionRow, kind: "stop" | "copy" | "delete") => {
    const question =
      kind === "stop"
        ? p.status === "active"
          ? `Да спра ли „${p.name}“ сега? Цените се връщат веднага.`
          : `Да отменя ли насрочената промоция „${p.name}“? Тя ще бъде изключена.`
        : kind === "delete"
          ? `Да изтрия ли промоцията „${p.name}“?${p.status === "active" ? " Цените се връщат веднага." : ""}`
          : null;
    if (question && !confirm(question)) return;
    setMessage(null);
    start(async () => {
      const r = kind === "stop" ? await stopPromotionAction(p.id) : kind === "copy" ? await duplicatePromotionAction(p.id) : await deletePromotionAction(p.id);
      if (!r.ok) return setMessage({ ok: false, text: r.error ?? "Възникна грешка." });
      setMessage({
        ok: true,
        text:
          kind === "stop"
            ? `„${p.name}“ е спряна. Цените в сайта са обновени.`
            : kind === "copy"
              ? `Направено е изключено копие на „${p.name}“ — променете го и го включете.`
              : `„${p.name}“ е изтрита. Цените в сайта са обновени.`,
      });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border-2 border-sky bg-sky-soft/40 p-4 text-[0.95rem]">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky" />
        <div className="space-y-1">
          <p>
            <b>Как работи:</b> промоцията намалява <b>редовната</b> цена с процента за избраните продукти — от началото до края, автоматично. Ако за един продукт важат
            няколко намаления (промоция или собствена промо цена от „Продукти“), клиентът получава <b>най-ниската</b> цена.
          </p>
          <p className="text-ink-soft">
            <b>Зачертаната цена</b>, която клиентите виждат, е най-ниската цена на продукта през последните 30 дни преди намалението (правило на ЕС „Омнибус“) — така
            процентът е честен и законен. Затова, ако продуктът е бил по-евтин наскоро, отстъпката на картата може да е по-малка.
          </p>
        </div>
      </div>

      {message ? (
        <p className={clsx("flex items-center gap-2 rounded-2xl p-4 font-bold", message.ok ? "bg-mint-soft text-mint" : "bg-brand-soft text-brand-dark")} role="status">
          {message.ok ? <Check className="h-5 w-5 shrink-0" strokeWidth={3} /> : <CircleAlert className="h-5 w-5 shrink-0" />} {message.text}
        </p>
      ) : null}

      <div id="promotion-form" className="scroll-mt-20">
        {form ? (
          <PromotionForm
            key={form.key}
            initial={form.draft}
            options={options}
            name={name}
            onClose={() => setForm(null)}
            onSaved={(text) => {
              setForm(null);
              setMessage({ ok: true, text });
            }}
          />
        ) : null}
      </div>

      <Card
        title="Промоции"
        description="Всички промоции с процент — текущи, насрочени и минали. Минала промоция можете да копирате и да пуснете отново."
        actions={
          <button type="button" onClick={() => open(emptyDraft())} className="btn btn-primary h-11 px-5 !shadow-none">
            <Plus className="h-4 w-4" /> Нова промоция
          </button>
        }
      >
        {promotions.length ? (
          <div className="space-y-6">
            {GROUPS.map((g) => {
              const list = promotions.filter((p) => g.statuses.includes(p.status));
              if (!list.length) return null;
              return (
                <section key={g.title}>
                  <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-muted">
                    {g.title} ({list.length})
                  </h3>
                  <ul className="space-y-3">
                    {list.map((p) => (
                      <PromotionItem key={p.id} p={p} name={name} busy={pending} onEdit={() => open(toDraft(p))} onAction={(kind) => act(p, kind)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-line bg-white p-10 text-center font-bold text-ink-soft">
            Още няма промоции. Натиснете „Нова промоция“ — напр. −15% на всички протеини за една седмица.
          </div>
        )}
        {pending ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-bold text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Обновяване на цените…
          </p>
        ) : null}
      </Card>
    </div>
  );
}
