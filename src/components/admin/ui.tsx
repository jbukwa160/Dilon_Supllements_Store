"use client";

// Building blocks of the admin panel (ported from /web; the admin must look exactly like /web's).
//
// ADMIN LOOK: the admin root layout puts `admin-theme` on <html>. In globals.css that class re-defines /web's colour
// tokens (ink #1d2340, brand #f0503a, sun, sky, mint, grape, canvas, line, muted + -soft / -dark), resets the radius
// scale to Tailwind's defaults and re-skins .btn / .btn-primary / .btn-ghost / .chip / .field as /web had them.
// So admin class strings are copied from /web verbatim (bg-ink, text-brand, rounded-3xl, btn btn-primary …) and look
// the same, while the storefront keeps its own palette under the same names. Rules for admin code:
// - use /web's token names; never the storefront-only ones (primary, accent, sale, surface …);
// - card shadows: shadow-[var(--shadow-card)] / shadow-[var(--shadow-lift)] (they follow .admin-theme);
// - storefront components rendered as live previews (HeroSlideView, PromoCards) go inside
//   <div className="shop-theme pointer-events-none" style={{ zoom: 0.6 }}> (as in /web): `shop-theme` brings back
//   the shop's colours, radii, fonts and buttons (globals.css; the admin layout loads Inter for it).
import { useEffect, useId, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { CalendarClock, Check, CircleAlert, ImageOff, LoaderCircle, Save, Upload, X } from "lucide-react";
import { COLOR_PRESETS, THEMES, THEME_KEYS, hexToRgb, parseColor, type ThemeKey } from "@/lib/settings-types";
import type { L10n } from "@/lib/l10n";
import { uploadImageAction } from "@/app/admin/_actions/uploads";

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-3xl border border-line bg-white p-5 md:p-7", className)}>
      {title || actions ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-xl font-black">{title}</h2> : null}
            {description ? <p className="mt-1 text-[0.95rem] text-ink-soft">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A labelled form row. `group` for composite controls (link picker, image, colours, L10nInput) that hold several inputs. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  group = false,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  group?: boolean;
}) {
  const id = useId();
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper className={clsx("block", className)} {...(group ? { role: "group", "aria-labelledby": id } : {})}>
      <span id={id} className="mb-1.5 block text-sm font-extrabold text-ink">
        {label}
      </span>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold text-brand">
          <CircleAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </Wrapper>
  );
}

export function TextInput({ className, invalid, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={clsx("field", invalid && "!border-brand", className)} />;
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={clsx("field resize-y", className)} />;
}

export function MoneyInput({ value, onChange, invalid, placeholder, ...rest }: { value: string; onChange: (v: string) => void; invalid?: boolean; placeholder?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={clsx("flex items-center rounded-[0.875rem] border-2 bg-white focus-within:border-sky", invalid ? "border-brand" : "border-line")}>
      <input
        {...rest}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-base outline-none focus-visible:outline-none"
      />
      <span className="pr-3.5 font-bold text-muted">€</span>
    </div>
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx("field cursor-pointer", className)}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={clsx("flex cursor-pointer items-start gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-mint" : "bg-line")}
      >
        <span className={clsx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </button>
      <span>
        <span className="block font-bold">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function ThemePicker({ value, onChange }: { value: ThemeKey; onChange: (v: ThemeKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {THEME_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          title={THEMES[k].label}
          className={clsx("flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-sm font-bold transition", value === k ? "border-ink" : "border-line hover:border-ink-soft")}
        >
          <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: THEMES[k].background }}>
            {value === k ? <Check className={clsx("h-4 w-4", THEMES[k].dark ? "text-white" : "text-ink")} strokeWidth={3} /> : null}
          </span>
          {THEMES[k].label}
        </button>
      ))}
    </div>
  );
}

/** Upload a picture from the computer, or paste an address. */
export function ImageField({ value, onChange, recommended, compact = false }: { value: string; onChange: (v: string) => void; recommended?: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [broken, setBroken] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    setError(null);
    // Same limit as the server (POST /admin/upload): no point sending a file that will be refused.
    if (file.size > 10 * 1024 * 1024) {
      setError("Снимката е по-голяма от 10 MB. Намалете я и опитайте пак.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      // Posts to the /admin/upload route handler (see app/admin/_actions/uploads.ts).
      const r = await uploadImageAction(fd);
      if (r.url) {
        setBroken(false);
        onChange(r.url);
      } else setError(r.error ?? "Качването не успя.");
    });
  };

  return (
    <div>
      <div className={clsx("flex gap-4", compact ? "items-center" : "flex-col sm:flex-row sm:items-center")}>
        <div className={clsx("grid shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-canvas", compact ? "h-20 w-20" : "h-32 w-48")}>
          {value && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-contain" onError={() => setBroken(true)} referrerPolicy="no-referrer" />
          ) : (
            <ImageOff className="h-7 w-7 text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={pending} className="btn btn-primary h-10 px-4 text-sm !shadow-none">
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {pending ? "Качване…" : value ? "Смени снимката" : "Качи снимка"}
            </button>
            {value ? (
              <button type="button" onClick={() => onChange("")} className="btn btn-ghost h-10 px-4 text-sm">
                <X className="h-4 w-4" /> Премахни
              </button>
            ) : null}
          </div>
          <button type="button" onClick={() => setShowUrl((v) => !v)} className="w-fit text-sm font-bold text-sky hover:underline">
            {showUrl ? "Скрий" : "или постави линк към снимка"}
          </button>
          {recommended ? <p className="text-xs text-muted">{recommended}</p> : null}
        </div>
      </div>
      {showUrl ? (
        <TextInput
          className="mt-3"
          placeholder="https://…"
          aria-label="Линк към снимка"
          value={value}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value.trim());
          }}
        />
      ) : null}
      {broken && value ? <p className="mt-2 text-sm font-bold text-brand">Снимката не може да се зареди от този адрес.</p> : null}
      {error ? <p className="mt-2 text-sm font-bold text-brand">{error}</p> : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Warn before leaving the page with unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

export type SaveStatus = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

export function SaveBar({
  dirty,
  pending,
  status,
  onSave,
  onReset,
  saveLabel = "Запази промените",
  extra,
}: {
  dirty: boolean;
  pending: boolean;
  status: SaveStatus;
  onSave: () => void;
  onReset?: () => void;
  saveLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSave} disabled={pending || !dirty} className="btn btn-primary h-12 px-7">
          {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          {pending ? "Запазване…" : saveLabel}
        </button>
        {onReset && dirty && !pending ? (
          <button type="button" onClick={onReset} className="btn btn-ghost h-12 px-5">
            Отказ
          </button>
        ) : null}
        <span className="text-sm font-bold" aria-live="polite">
          {status.kind === "error" ? (
            <span className="flex items-center gap-1.5 text-brand">
              <CircleAlert className="h-4 w-4" /> {status.message}
            </span>
          ) : status.kind === "saved" && !dirty ? (
            <span className="flex items-center gap-1.5 text-mint">
              <Check className="h-4 w-4" strokeWidth={3} /> Запазено! Промените вече са в сайта.
            </span>
          ) : dirty ? (
            <span className="text-muted">Имате незапазени промени</span>
          ) : null}
        </span>
        <span className="ml-auto">{extra}</span>
      </div>
    </div>
  );
}

/** State + save helper shared by the editors: tracks "dirty", pending and the last result. */
export function useEditor<T>(initial: T, save: (value: T) => Promise<{ ok?: boolean; error?: string }>) {
  const [value, setValue] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);
  const submit = () =>
    start(async () => {
      const r = await save(value);
      if (r.ok) {
        setSaved(value);
        setStatus({ kind: "saved" });
      } else setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
    });
  const update = (next: T | ((v: T) => T)) => {
    setStatus({ kind: "idle" });
    setValue(next);
  };
  return { value, setValue: update, dirty, pending, status, submit, reset: () => update(saved) };
}

/** Colour picker: the browser's colour wheel, a HEX/RGB text field and quick swatches. */
export function ColorField({ value, onChange, presets = COLOR_PRESETS }: { value: string; onChange: (hex: string) => void; presets?: string[] }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [prev, setPrev] = useState(value);
  // Follow outside changes (colour wheel, swatches, "Отказ") unless the admin is typing.
  if (value !== prev) {
    setPrev(value);
    if (!focused) {
      setText(value);
      setInvalid(false);
    }
  }
  const [r, g, b] = hexToRgb(value);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="relative h-12 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 border-line shadow-inner"
          style={{ background: value }}
          title="Изберете от цветното колело"
        >
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Цветно колело" />
        </label>
        <input
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const c = parseColor(text);
            setText(c ?? value);
            setInvalid(false);
          }}
          onChange={(e) => {
            setText(e.target.value);
            const c = parseColor(e.target.value);
            setInvalid(!c && e.target.value.trim() !== "");
            if (c) onChange(c);
          }}
          placeholder="#0a6b5e или 10, 107, 94"
          aria-label="Цвят като HEX или RGB"
          className={clsx("field w-48 font-mono", invalid && "!border-brand")}
          spellCheck={false}
        />
        <span className="font-mono text-xs text-muted">
          RGB {r}, {g}, {b}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Готови цветове">
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            aria-label={`Цвят ${c}`}
            className={clsx("h-7 w-7 rounded-full border-2 transition hover:scale-110", c === value ? "border-ink ring-2 ring-ink/20" : "border-line")}
            style={{ background: c }}
          />
        ))}
      </div>
      {invalid ? <p className="mt-1.5 text-sm font-bold text-brand">Невалиден цвят. Пример: #0a6b5e, #0a6 или 10, 107, 94</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Added for the bilingual store

const LANG_TABS = [
  { key: "bg", label: "БГ" },
  { key: "en", label: "EN" },
] as const;

/**
 * A text the shop shows in two languages ({ bg, en }): БГ / EN tabs over one input (or textarea with `multiline`).
 * English is optional — empty means "the Bulgarian text is shown". The EN tab gets a dot while the translation is
 * missing. Put it in <Field group …> (it contains buttons, so it must not sit inside a <label>).
 */
export function L10nInput({
  value,
  onChange,
  label,
  multiline = false,
  rows = 3,
  placeholder,
  maxLength,
  invalid,
}: {
  value: L10n;
  onChange: (v: L10n) => void;
  /** Accessible name of the inputs ("Заглавие" → "Заглавие (БГ)" / "Заглавие (EN)"). */
  label: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
}) {
  const [tab, setTab] = useState<"bg" | "en">("bg");
  const id = useId();
  const missing = !!value.bg.trim() && !value.en.trim();
  const common = {
    id: `${id}-${tab}`,
    value: value[tab],
    maxLength,
    "aria-label": `${label} (${tab === "bg" ? "БГ" : "EN"})`,
    // The English field shows the Bulgarian text as a hint of what will appear while it is empty.
    placeholder: tab === "en" ? value.bg || placeholder : placeholder,
    className: clsx("field", multiline && "resize-y", invalid && tab === "bg" && "!border-brand"),
  };
  const set = (text: string) => onChange({ ...value, [tab]: text });

  return (
    <div>
      <div role="tablist" aria-label={`Език: ${label}`} className="mb-1.5 inline-flex gap-1 rounded-full bg-canvas p-1">
        {LANG_TABS.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${id}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${id}-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = LANG_TABS[(i + 1) % LANG_TABS.length].key;
              setTab(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
            className={clsx("relative rounded-full px-3 py-1 text-xs font-black transition", tab === t.key ? "bg-ink text-white" : "text-muted hover:text-ink")}
          >
            {t.label}
            {t.key === "en" && missing ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sun" title="Липсва превод" aria-label="липсва превод" /> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
        {multiline ? <textarea {...common} rows={rows} onChange={(e) => set(e.target.value)} /> : <input {...common} onChange={(e) => set(e.target.value)} />}
      </div>
      {tab === "en" ? <p className="mt-1.5 text-sm text-muted">По желание — празно = като БГ (показва се българският текст).</p> : null}
    </div>
  );
}

/**
 * Date + time in Bulgarian time (promotion start / end). The value is "YYYY-MM-DDTHH:mm" (Europe/Sofia, like
 * <input type="datetime-local">) or "" for "no limit"; convert it on the server. A date without a time gets
 * `defaultTime` ("00:00" for starts, use "23:59" for ends).
 */
export function DateTimeInput({
  value,
  onChange,
  defaultTime = "00:00",
  label,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  defaultTime?: string;
  /** Accessible name ("Начало" → "Начало — дата" / "Начало — час"). */
  label: string;
  invalid?: boolean;
}) {
  const [date = "", time = ""] = value ? value.split("T") : [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={clsx("flex min-w-0 max-w-full items-center rounded-[0.875rem] border-2 bg-white pl-3 focus-within:border-sky", invalid ? "border-brand" : "border-line")}>
        <CalendarClock className="h-5 w-5 shrink-0 text-muted" />
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value ? `${e.target.value}T${time || defaultTime}` : "")}
          aria-label={`${label} — дата`}
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 outline-none focus-visible:outline-none"
        />
        <input
          type="time"
          value={time}
          disabled={!date}
          onChange={(e) => onChange(`${date}T${e.target.value || defaultTime}`)}
          aria-label={`${label} — час`}
          className="min-w-0 flex-1 border-l-2 border-line bg-transparent px-2 py-2.5 outline-none focus-visible:outline-none disabled:opacity-40"
        />
      </div>
      {value ? (
        <button type="button" onClick={() => onChange("")} className="btn btn-ghost h-10 px-3 text-sm">
          <X className="h-4 w-4" /> Без ограничение
        </button>
      ) : null}
    </div>
  );
}
