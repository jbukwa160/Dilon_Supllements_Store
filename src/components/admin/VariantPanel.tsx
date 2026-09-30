"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Layers, LoaderCircle, RotateCcw, Split, Undo2, Users } from "lucide-react";
import type { FamilyMember } from "@/lib/admin/products";
import { formatPrice } from "@/lib/format";
import { productFamilyAction } from "@/app/admin/_actions/products";
import { Field, L10nInput, TextInput } from "./ui";
import { ProductSearch } from "./ProductSearch";

export type VariantValue = { flavour: string; flavourEn: string; size: string; groupKey: string | null; familyName: string };

const MODE_TEXT = {
  auto: "Разпознато автоматично по името на продукта.",
  manual: "Присъединен ръчно към това семейство.",
  single: "Отделен ръчно — показва се като самостоятелен продукт.",
} as const;

/**
 * Flavour / pack size of this product and its family: the variants shown as one card in the listings ("5 вкуса")
 * and as flavour / size choices on the product page. Changes apply with the editor's "Запази промените".
 */
export function VariantPanel({
  productId,
  family,
  familyMode,
  savedGroupKey,
  familyCardName,
  value,
  onChange,
  errors,
}: {
  /** Unset while the product is being created. */
  productId?: number;
  family: FamilyMember[];
  familyMode: "auto" | "manual" | "single";
  /** The family setting as saved (null = automatic, "" = standalone, key). */
  savedGroupKey: string | null;
  /** The name the family card shows now. */
  familyCardName?: string;
  value: VariantValue;
  onChange: (patch: Partial<VariantValue>) => void;
  errors: Record<string, string>;
}) {
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<{ key: string; name: string; count: number } | null>(null);
  const [pending, start] = useTransition();
  const changed = value.groupKey !== savedGroupKey;
  const inFamily = family.length > 1;

  const join = (id: number) =>
    start(async () => {
      const f = await productFamilyAction(id);
      if (!f) return;
      setTarget({ key: f.key, name: f.name, count: Math.max(1, f.members.length) });
      onChange({ groupKey: f.key });
      setSearching(false);
    });

  let pendingText: string | null = null;
  if (changed) {
    if (value.groupKey === "") pendingText = "След „Запази промените“ продуктът ще се показва самостоятелно — извън семейството.";
    else if (value.groupKey === null) pendingText = "След „Запази промените“ групирането ще се върне на автоматично (по името).";
    else if (target && target.key === value.groupKey)
      pendingText = `След „Запази промените“ продуктът ще се присъедини към семейството на „${target.name}“${target.count > 1 ? ` (${target.count} продукта)` : ""}.`;
    else pendingText = "След „Запази промените“ продуктът ще смени семейството си.";
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <Field label="Вкус" group hint="Напр. „Шоколад“. Празно, ако продуктът няма вкусове." error={errors.flavour}>
          <L10nInput label="Вкус" value={{ bg: value.flavour, en: value.flavourEn }} onChange={(v) => onChange({ flavour: v.bg, flavourEn: v.en })} maxLength={80} />
        </Field>
        <Field label="Разфасовка" hint="Напр. „1 кг“, „90 капсули“. На английски се превежда автоматично." error={errors.size}>
          <TextInput value={value.size} onChange={(e) => onChange({ size: e.target.value })} maxLength={60} className="sm:max-w-xs" />
        </Field>
      </div>

      <div>
        <p className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-extrabold">
          <Users className="h-4 w-4" /> Семейство
          {productId ? <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-muted">{MODE_TEXT[familyMode]}</span> : null}
        </p>
        {inFamily ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {family.map((m) => {
              const current = m.id === productId;
              const label = [m.flavour, m.size].filter(Boolean).join(" · ") || m.name;
              const body = (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.image ?? "/placeholder.svg"} alt="" referrerPolicy="no-referrer" className={clsx("h-10 w-10 shrink-0 rounded-lg border border-line bg-white object-contain p-0.5", m.hidden && "opacity-40")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{label}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                      {m.sku} · {formatPrice(m.price, "bg")} · {m.stock > 0 ? `${m.stock} бр.` : "изчерпан"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {current ? <span className="rounded-full bg-sky-soft px-2 py-0.5 text-[0.7rem] font-bold text-sky">Този продукт</span> : null}
                    {m.isPrimary ? <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[0.7rem] font-bold text-mint">Карта в списъците</span> : null}
                    {m.hidden ? <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-bold text-white">Скрит</span> : null}
                  </span>
                </>
              );
              return (
                <li key={m.id}>
                  {current ? (
                    <div className="flex items-center gap-3 bg-sky-soft/30 px-3 py-2">{body}</div>
                  ) : (
                    <Link href={`/admin/produkti/${m.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-canvas">
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl bg-canvas p-4 text-sm text-ink-soft">Самостоятелен продукт — няма други вкусове или разфасовки в същото семейство.</p>
        )}
        <div className="mt-4">
          <Field
            label="Име на семейството (картата в списъците)"
            hint={
              value.familyName.trim()
                ? "Зададено ръчно — важи за всички вкусове и разфасовки в семейството. Изтрийте текста, за да се върне автоматичното име."
                : `Автоматично: името на продуктите без вкуса и разфасовката${familyCardName ? ` — сега „${familyCardName}“` : ""}. Попълнете само ако искате друго име.`
            }
            error={errors.familyName}
          >
            <TextInput
              value={value.familyName}
              onChange={(e) => onChange({ familyName: e.target.value })}
              maxLength={200}
              placeholder={familyCardName ?? "Напр. „Gold Standard 100% Whey“"}
            />
          </Field>
        </div>
        <p className="mt-2 text-sm text-muted">
          Продуктите от едно семейство се показват като една карта в списъците (напр. „5 вкуса“), а на страницата на продукта клиентът избира вкус и разфасовка. Всеки
          вариант има собствена цена и наличност.
        </p>
      </div>

      {pendingText ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-sky bg-sky-soft/40 p-4">
          <Layers className="h-5 w-5 shrink-0 text-sky" />
          <p className="flex-1 text-sm font-bold">{pendingText}</p>
          <button
            type="button"
            onClick={() => {
              onChange({ groupKey: savedGroupKey });
              setTarget(null);
            }}
            className="btn btn-ghost h-9 px-3 text-sm"
          >
            <Undo2 className="h-4 w-4" /> Отмени
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {value.groupKey !== "" && (inFamily || familyMode === "manual") ? (
          <button type="button" onClick={() => onChange({ groupKey: "" })} className="btn btn-ghost min-h-10 max-w-full whitespace-normal px-4 py-2 text-left text-sm">
            <Split className="h-4 w-4" /> Отдели като самостоятелен продукт
          </button>
        ) : null}
        <button type="button" onClick={() => setSearching((v) => !v)} className={clsx("btn min-h-10 max-w-full whitespace-normal px-4 py-2 text-left text-sm", searching ? "bg-ink text-white" : "btn-ghost")} aria-expanded={searching}>
          <Users className="h-4 w-4" /> Присъедини към друго семейство
        </button>
        {value.groupKey !== null && (savedGroupKey !== null || changed) ? (
          <button type="button" onClick={() => onChange({ groupKey: null })} className="btn btn-ghost min-h-10 max-w-full whitespace-normal px-4 py-2 text-left text-sm">
            <RotateCcw className="h-4 w-4" /> Автоматично групиране
          </button>
        ) : null}
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin self-center text-muted" /> : null}
      </div>
      {searching ? (
        <div className="rounded-2xl bg-canvas p-3">
          <p className="mb-2 text-sm font-bold text-ink-soft">Намерете продукт от семейството, към което да се присъедини този (напр. същия протеин с друг вкус):</p>
          <ProductSearch includeHidden addLabel="Избери" isAdded={(sku) => family.some((m) => m.sku === sku)} onAdd={(p) => (p.id === productId ? undefined : join(p.id))} />
        </div>
      ) : null}
      {errors.groupKey ? <p className="text-sm font-bold text-brand">{errors.groupKey}</p> : null}
    </div>
  );
}
