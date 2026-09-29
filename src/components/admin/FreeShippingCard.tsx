"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import Link from "next/link";
import { Truck } from "lucide-react";
import { saveFreeShippingAction } from "@/app/admin/_actions/content";
import type { StoreSettings } from "@/lib/settings-types";
import { fmt, getDict } from "@/i18n";
import { formatPrice } from "@/lib/format";
import { formatAmount } from "@/components/layout/format-amount";
import { freeShippingTemplate } from "@/lib/free-shipping";
import { Card, Field, MoneyInput, SaveBar, Toggle, useUnsavedWarning, type SaveStatus } from "./ui";

type Shipping = StoreSettings["shipping"];
type Draft = { on: boolean; freeOver: string; freeScope: Shipping["freeScope"] };

const toDraft = (s: Shipping): Draft => ({ on: s.freeOver !== null, freeOver: s.freeOver === null ? "50" : String(s.freeOver).replace(".", ","), freeScope: s.freeScope });
const num = (s: string) => {
  const t = s.replace(/[\s€]/g, "").replace(",", ".");
  return t ? Number(t) : NaN;
};

/** The storefront's top-bar line, built exactly like the shop does (TopBar → freeShippingTemplate). */
function StoreLine({ amount, scope, lang }: { amount: number; scope: Shipping["freeScope"]; lang: "bg" | "en" }) {
  const template = freeShippingTemplate({ freeOver: amount, freeScope: scope }, getDict(lang).common.freeShipping) ?? "";
  const [before, after = ""] = template.split("{amount}");
  return (
    <span>
      {before}
      {template.includes("{amount}") ? <strong className="font-bold text-white">{formatAmount(amount, lang)}</strong> : null}
      {after}
    </span>
  );
}

export function FreeShippingCard({ initial }: { initial: Shipping }) {
  const [value, setValue] = useState(() => toDraft(initial));
  const [saved, setSaved] = useState(value);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);
  const set = (patch: Partial<Draft>) => {
    setStatus({ kind: "idle" });
    setValue((v) => ({ ...v, ...patch }));
  };
  const amount = num(value.freeOver);
  const valid = !value.on || (Number.isFinite(amount) && amount >= 0 && amount <= 100000);

  const save = () =>
    start(async () => {
      if (!valid) return setStatus({ kind: "error", message: "Въведете сума от 0 нагоре (напр. 50)." });
      const r = await saveFreeShippingAction({ freeOver: value.on ? amount : null, freeScope: value.freeScope });
      if (!r.ok || !r.value) return setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
      const next = toDraft(r.value);
      setValue(next);
      setSaved(next);
      setStatus({ kind: "saved" });
    });

  return (
    <div className="space-y-6">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-brand" /> Безплатна доставка
          </span>
        }
        description="Над каква сума доставката е безплатна. Същата настройка е и в „Настройки → Доставка и връщане“."
      >
        <div className="space-y-5">
          <Toggle
            checked={value.on}
            onChange={(on) => set({ on })}
            label="Предлагай безплатна доставка"
            description="Изключено = клиентите винаги плащат доставката (лентата „Безплатна доставка над …“ изчезва от сайта)."
          />
          {value.on ? (
            <>
              <Field
                label="Безплатна доставка при поръчка над"
                hint="Сумата на продуктите в количката след намаленията (без подаръците и цената на доставката). 0 = винаги безплатна."
                error={valid ? undefined : "Въведете сума от 0 нагоре (напр. 50)."}
                className="max-w-sm"
              >
                <MoneyInput value={value.freeOver} onChange={(freeOver) => set({ freeOver })} invalid={!valid} placeholder="50" />
              </Field>
              <Field group label="За кои начини на доставка?">
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    { key: "all" as const, title: "За всички", text: "Безплатна до офис, автомат и до адрес." },
                    { key: "office" as const, title: "Само до офис или автомат", text: "Доставката до адрес остава платена. Често срещано при куриерите в България." },
                  ].map((o) => (
                    <label key={o.key} className={clsx("cursor-pointer rounded-2xl border-2 p-4 transition", value.freeScope === o.key ? "border-brand bg-brand-soft/40" : "border-line hover:border-ink-soft")}>
                      <input type="radio" name="free-scope" className="sr-only" checked={value.freeScope === o.key} onChange={() => set({ freeScope: o.key })} />
                      <span className="block font-black">{o.title}</span>
                      <span className="text-sm text-ink-soft">{o.text}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </>
          ) : null}

          <div>
            <div className="mb-2 text-sm font-extrabold text-muted">Така изглежда в горната лента на сайта</div>
            {value.on && valid ? (
              <div className="shop-theme pointer-events-none space-y-2">
                {(["bg", "en"] as const).map((lang) => (
                  <div key={lang} className="flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[0.8rem] font-medium text-canvas/85">
                    <span className="rounded bg-white/15 px-1.5 text-[0.65rem] font-bold text-white">{lang === "bg" ? "БГ" : "EN"}</span>
                    <Truck className="h-4 w-4 shrink-0 text-accent" />
                    <StoreLine amount={amount} scope={value.freeScope} lang={lang} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-canvas p-3 text-sm font-bold text-ink-soft">Няма да се показва съобщение за безплатна доставка.</p>
            )}
            {value.on && valid && amount > 10 ? (
              <p className="mt-2 text-sm text-muted">
                В количката: при поръчка за {formatPrice(amount - 10, "bg")} клиентът вижда „{fmt(getDict("bg").giftTiers.leftShipping, { amount: formatPrice(10, "bg") })}“.
                {value.freeScope === "office" ? " При доставка до адрес цената на доставката се плаща и над прага." : ""}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
      <p className="text-sm text-muted">
        Цените на самата доставка (до офис и до адрес) се променят от{" "}
        <Link href="/admin/nastroyki" className="font-bold text-sky hover:underline">
          Настройки → Доставка и връщане
        </Link>
        .
      </p>
      <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} onReset={() => setValue(saved)} />
    </div>
  );
}
