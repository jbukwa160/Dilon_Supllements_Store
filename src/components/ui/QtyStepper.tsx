"use client";

import { useState } from "react";
import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { useDict } from "@/i18n/client";

/**
 * Pill-shaped quantity control: − / number / +. The number can also be typed; it is clamped to min…max when the
 * field loses focus or Enter is pressed. `onChange` only fires with a different, valid quantity.
 * Touch targets are at least 40 × 40 px in both sizes (F-13): "sm" (cart lines) only trims the frame and the digits.
 */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  disabled = false,
  label,
  className,
}: {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Accessible name, e.g. "Количество: Whey Protein" (default "Количество"). */
  label?: string;
  className?: string;
}) {
  const t = useDict().common.qty;
  // What the visitor is typing; null = show the current value.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const set = (n: number) => {
    const next = clamp(n);
    if (next !== value) onChange(next);
  };
  const commit = (text: string) => {
    setDraft(null);
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) set(n);
  };

  const button =
    "grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)] text-ink transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div
      role="group"
      aria-label={label ?? t.label}
      className={clsx(
        "inline-flex items-center rounded-[var(--radius-md)] border-[1.5px] border-[#cfcfcf] bg-surface focus-within:border-ink",
        size === "sm" ? "p-0" : "p-0.5",
        className,
      )}
    >
      <button type="button" className={button} onClick={() => set(value - 1)} disabled={disabled || value <= min} aria-label={t.dec}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={draft ?? String(value)}
        disabled={disabled}
        aria-label={label ?? t.label}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
        className={clsx("h-10 min-w-0 bg-transparent text-center font-bold tabular-nums outline-none focus-visible:outline-none", size === "sm" ? "w-9 text-sm" : "w-10")}
      />
      <button type="button" className={button} onClick={() => set(value + 1)} disabled={disabled || value >= max} aria-label={t.inc}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
