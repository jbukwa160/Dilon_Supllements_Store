"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import clsx from "clsx";
import { Check, CircleAlert, CircleCheck, Eye, EyeOff, Info, LoaderCircle } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict } from "@/i18n/client";
import type { AccountError, FormState } from "./form-state";

// Form building blocks of the account pages: labelled inputs with hint + error linked through aria-describedby,
// a password input with show / hide and optional live rules, checkboxes, alerts and the submit button.

/** The message for an error code ("locked" gets its minutes, "too_many" its limit). */
export function useErrorText() {
  const t = useDict().account.errors;
  return (code: AccountError | undefined, vars: Record<string, string | number> = {}) => (code ? fmt(t[code] ?? t.generic, vars) : "");
}

/** After a failed submit: focus the first invalid field, else the form alert (so screen readers land on the problem). */
export function useFocusOnError(form: RefObject<HTMLFormElement | null>, state: FormState) {
  useEffect(() => {
    if (!state || (!state.error && !state.fields)) return;
    const el = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>("[data-form-alert]");
    el?.focus();
  }, [state, form]);
}

function Described({ id, hint, error }: { id: string; hint?: React.ReactNode; error?: string }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-sale">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </>
  );
}

const describedBy = (id: string, hint: unknown, error: unknown) =>
  [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;

function Label({ htmlFor, children, optional, aside }: { htmlFor: string; children: React.ReactNode; optional?: boolean; aside?: React.ReactNode }) {
  const t = useDict().account;
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-bold">
        {children}
        {optional ? <span className="font-normal text-muted"> ({t.optional})</span> : null}
      </label>
      {aside}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & {
  name: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  /** Something next to the label (e.g. the "Forgot your password?" link). */
  aside?: React.ReactNode;
  className?: string;
};

export function TextField({ label, hint, error, optional, aside, className, ...input }: InputProps) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional} aside={aside}>
        {label}
      </Label>
      <input
        id={id}
        className="field"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        required={!optional}
        {...input}
      />
      <Described id={id} hint={hint} error={error} />
    </div>
  );
}

/** Live checklist of the customer password rules (≥ 8 characters, a letter and a digit). */
function PasswordRules({ id, value }: { id: string; value: string }) {
  const t = useDict().account.signUp;
  const rules = [
    { ok: value.length >= 8, label: t.ruleLength },
    { ok: /[a-zA-Zа-яА-Я]/.test(value) && /\d/.test(value), label: t.ruleLetterDigit },
  ];
  return (
    <ul id={`${id}-hint`} className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {rules.map((r) => (
        <li key={r.label} className={clsx("flex items-center gap-1.5", r.ok ? "font-semibold text-success" : "text-muted")}>
          {r.ok ? (
            <CircleCheck className="h-4 w-4" aria-hidden />
          ) : (
            <span className="grid h-4 w-4 place-items-center" aria-hidden>
              <span className="h-1.5 w-1.5 rounded-pill bg-current" />
            </span>
          )}
          {r.label}
          <span className="sr-only">({r.ok ? t.ruleOk : t.ruleTodo})</span>
        </li>
      ))}
    </ul>
  );
}

export function PasswordField({ label, hint, error, aside, className, rules = false, ...input }: Omit<InputProps, "type" | "optional"> & { rules?: boolean }) {
  const id = useId();
  const t = useDict().account;
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  // React resets the form after an action: keep the rule checklist in step with the emptied input.
  useEffect(() => {
    const form = ref.current?.form;
    if (!rules || !form) return;
    const onReset = () => setTimeout(() => setValue(ref.current?.value ?? ""), 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [rules]);

  const hasHint = rules || !!hint;
  return (
    <div className={className}>
      <Label htmlFor={id} aside={aside}>
        {label}
      </Label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={show ? "text" : "password"}
          className="field pr-12"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hasHint, error)}
          required
          maxLength={200}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onInput={rules ? (e) => setValue(e.currentTarget.value) : undefined}
          {...input}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-md text-muted hover:text-ink"
          aria-label={show ? t.hidePassword : t.showPassword}
          aria-pressed={show}
          aria-controls={id}
        >
          {show ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {rules ? <PasswordRules id={id} value={value} /> : null}
      <Described id={id} hint={rules ? undefined : hint} error={error} />
    </div>
  );
}

export function Checkbox({
  name,
  children,
  error,
  defaultChecked,
  required,
  className,
}: {
  name: string;
  children: React.ReactNode;
  error?: string;
  defaultChecked?: boolean;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-primary)]"
        />
        <label htmlFor={id} className="cursor-pointer text-[0.95rem] leading-snug">
          {children}
        </label>
      </div>
      <Described id={id} error={error} />
    </div>
  );
}

export function FormAlert({ tone = "error", children, className }: { tone?: "error" | "success" | "info"; children: React.ReactNode; className?: string }) {
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? Check : Info;
  return (
    <div
      data-form-alert=""
      tabIndex={-1}
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "flex items-start gap-2.5 rounded-md px-4 py-3 text-[0.95rem] font-semibold outline-none",
        tone === "error" && "bg-sale/10 text-sale",
        tone === "success" && "bg-primary-50 text-primary-700",
        tone === "info" && "bg-primary-50 text-ink",
        className,
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  variant = "primary",
  icon,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "outline" | "danger" | "energy";
  icon?: React.ReactNode;
}) {
  const t = useDict().account;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className={clsx(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "outline" && "btn-outline",
        variant === "energy" && "btn-energy",
        variant === "danger" && "bg-sale text-white hover:bg-[#b81f33]",
        className,
      )}
    >
      {pending ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : icon}
      {children}
      {pending ? <span className="sr-only">{t.working}</span> : null}
    </button>
  );
}
