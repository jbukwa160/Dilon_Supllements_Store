"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { OrderStatus } from "@/lib/checkout";
import { updateOrderAction } from "@/app/admin/_actions/orders";
import { TextArea } from "./ui";

const NOTE_MAX = 2000;

/** Status (radio list) + internal note of an order; the statuses and their pill colours come from lib/orders.ts. */
export function OrderStatusForm({
  id,
  status,
  note,
  statuses,
}: {
  id: string;
  status: OrderStatus;
  note: string;
  statuses: { key: OrderStatus; label: string; color: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<OrderStatus>(status);
  const [text, setText] = useState(note);
  const [saved, setSaved] = useState({ status, note });
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = value !== saved.status || text !== saved.note;
  return (
    <section className="rounded-3xl border border-line bg-white p-6 lg:sticky lg:top-6" aria-labelledby="order-status-title">
      <h2 id="order-status-title" className="text-lg font-black">
        Статус
      </h2>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-labelledby="order-status-title">
        {statuses.map((s) => (
          <label
            key={s.key}
            className={clsx("flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 font-bold transition", value === s.key ? "border-ink" : "border-line hover:border-ink-soft")}
          >
            <input
              type="radio"
              name="status"
              checked={value === s.key}
              onChange={() => {
                setValue(s.key);
                setResult(null);
              }}
              className="h-4 w-4 accent-brand"
            />
            <span className={clsx("rounded-full px-2.5 py-0.5 text-sm", s.color)}>{s.label}</span>
          </label>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-extrabold">Вътрешна бележка</span>
        <TextArea
          rows={4}
          value={text}
          maxLength={NOTE_MAX}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder="Вижда се само тук, напр. номер на товарителница"
        />
        <span className="mt-1 block text-right text-xs text-muted">
          {text.length}/{NOTE_MAX}
        </span>
      </label>
      <button
        type="button"
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            const r = await updateOrderAction(id, value, text);
            setResult(r);
            if (r.ok) {
              setSaved({ status: value, note: text });
              router.refresh();
            }
          })
        }
        className="btn btn-primary mt-3 h-12 w-full"
      >
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={3} />} Запази
      </button>
      <p className="mt-2 min-h-5 text-center text-sm font-bold" aria-live="polite">
        {result?.ok && !dirty ? <span className="text-mint">Запазено</span> : null}
        {result?.error ? (
          <span className="inline-flex items-center gap-1.5 text-brand">
            <CircleAlert className="h-4 w-4" /> {result.error}
          </span>
        ) : null}
      </p>
    </section>
  );
}
