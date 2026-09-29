"use client";

// The withdrawal function „Откажете се от договора тук“ (ЗИД на ЗЗП, ДВ бр. 87/2026; Directive (EU) 2023/2673):
//   1. find the order (number + e-mail, verified on the server),
//   2. choose the whole order or some items (+ quantities) and an optional reason,
//   3. review the statement and press the separate confirmation button „Потвърждавам отказа“,
//   4. the acknowledgement (date and time of receipt, also sent by e-mail).
// The Server Actions are passed in as props by the page.
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { AlertCircle, ArrowLeft, CheckCircle2, Gift, Info, Loader2, PackageCheck } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import type { ConfirmState, LookupState, WithdrawalError, WithdrawalOrderView } from "./types";

type Props = {
  lookupAction: (prev: LookupState | null, fd: FormData) => Promise<LookupState>;
  confirmAction: (prev: ConfirmState | null, fd: FormData) => Promise<ConfirmState>;
  /** From ?order= (links from the account area) — digits only. */
  initialOrder: string;
  /** The signed-in customer's e-mail, if any. */
  initialEmail: string;
  shopEmail: string;
};

const labelCls = "mb-1.5 block text-sm font-semibold text-ink";

/** Quotation marks of the statement: „…“ in Bulgarian, “…” in English. */
const QUOTES = { bg: ["„", "“"], en: ["“", "”"] } as const;

export function WithdrawalFlow({ lookupAction, confirmAction, initialOrder, initialEmail, shopEmail }: Props) {
  const lang = useLang();
  const t = useDict().info.withdraw;
  const [lookup, lookupFormAction, lookupPending] = useActionState(lookupAction, null);
  const [confirm, confirmFormAction, confirmPending] = useActionState(confirmAction, null);

  const [number, setNumber] = useState(initialOrder);
  const [email, setEmail] = useState(initialEmail);
  // "A different order" hides the found order without a new request.
  const [dismissed, setDismissed] = useState<LookupState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [mode, setMode] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [selectError, setSelectError] = useState(false);
  // A confirmation error belongs to the attempt that caused it: hidden again after "Back" or a new look-up.
  const [staleConfirm, setStaleConfirm] = useState<ConfirmState | null>(null);

  // A new look-up result starts a fresh selection (adjusting state during render, not in an effect).
  const [seenLookup, setSeenLookup] = useState<LookupState | null>(null);
  if (lookup !== seenLookup) {
    setSeenLookup(lookup);
    setMode("all");
    setPicked({});
    setReason("");
    setReviewing(false);
    setSelectError(false);
    setStaleConfirm(confirm);
  }

  const order = lookup?.ok && lookup !== dismissed ? lookup.order : null;
  const receipt = confirm?.ok ? confirm.receipt : null;
  const step = receipt ? 4 : !order ? 1 : reviewing ? 3 : 2;

  // Move focus to the new step's heading (not on the first render).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // The lines of the statement, with the chosen quantities.
  const chosen = order
    ? mode === "all"
      ? order.lines
      : order.lines.filter((l) => picked[l.line]).map((l) => ({ ...l, qty: Math.min(l.qty, picked[l.line]) }))
    : [];

  function goReview() {
    if (mode === "some" && chosen.length === 0) {
      setSelectError(true);
      return;
    }
    setSelectError(false);
    setReviewing(true);
  }

  return (
    <div className="space-y-5">
      {step < 4 ? <StepIndicator step={step} /> : null}

      {step === 1 ? (
        <section className="card p-5 sm:p-6 md:p-8" aria-labelledby="wd-step-title">
          <h2 id="wd-step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
            {t.lookup.title}
          </h2>
          <p className="mt-2 text-ink-soft">{t.lookup.text}</p>
          <form action={lookupFormAction} className="mt-5 space-y-4" noValidate>
            <input type="hidden" name="lang" value={lang} />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <div>
                <label htmlFor="wd-order" className={labelCls}>
                  {t.lookup.number}
                </label>
                <input
                  id="wd-order"
                  name="order"
                  className="field"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  maxLength={20}
                  placeholder={t.lookup.numberPlaceholder}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  aria-invalid={lookup && !lookup.ok && lookup.error === "invalid" && !number.trim() ? true : undefined}
                />
              </div>
              <div>
                <label htmlFor="wd-email" className={labelCls}>
                  {t.lookup.email}
                </label>
                <input
                  id="wd-email"
                  name="email"
                  type="email"
                  className="field"
                  autoComplete="email"
                  required
                  maxLength={200}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            {lookup && !lookup.ok && lookup !== dismissed ? <ErrorBox error={lookup.error} shopEmail={shopEmail} /> : null}
            <button type="submit" className="btn btn-primary h-12 w-full px-7 sm:w-auto" disabled={lookupPending}>
              {lookupPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
              {lookupPending ? t.lookup.submitting : t.lookup.submit}
            </button>
          </form>
        </section>
      ) : null}

      {step === 2 && order ? (
        <section className="card p-5 sm:p-6 md:p-8" aria-labelledby="wd-step-title">
          <h2 id="wd-step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
            {t.select.title}
          </h2>
          <p className="mt-1.5 text-ink-soft">
            {fmt(t.select.order, { number: order.number, date: order.date })}
            {order.name ? ` · ${order.name}` : ""}
          </p>

          {order.previous.length ? (
            <p className="mt-4 flex gap-2.5 rounded-md border border-info/25 bg-[#eef4fb] p-3.5 text-sm text-ink">
              <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-info" aria-hidden />
              <span>{fmt(t.select.previous, { date: order.previous[0] })}</span>
            </p>
          ) : null}

          <fieldset className="mt-5">
            <legend className="sr-only">{t.select.title}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["all", "some"] as const).map((m) => (
                <label
                  key={m}
                  className={clsx(
                    "flex cursor-pointer gap-3 rounded-md border-[1.5px] p-4 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary/70",
                    mode === m ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-ink/40",
                  )}
                >
                  <input
                    type="radio"
                    name="wd-mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => {
                      setMode(m);
                      setSelectError(false);
                    }}
                    className="mt-1 h-4.5 w-4.5 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span>
                    <span className="block font-bold text-ink">{m === "all" ? t.select.whole : t.select.some}</span>
                    <span className="block text-sm text-muted">{m === "all" ? t.select.wholeHint : t.select.someHint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <ul className="mt-5 divide-y divide-line rounded-md border border-line" aria-live="polite">
            {order.lines.map((l) => {
              const on = mode === "all" || !!picked[l.line];
              const id = `wd-line-${l.line}`;
              return (
                <li key={l.line} className={clsx("flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap", !on && "bg-canvas/60")}>
                  {mode === "some" ? (
                    <input
                      id={id}
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        setSelectError(false);
                        setPicked((p) => {
                          const next = { ...p };
                          if (e.target.checked) next[l.line] = l.qty;
                          else delete next[l.line];
                          return next;
                        });
                      }}
                      className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                    />
                  ) : (
                    <PackageCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  )}
                  <label htmlFor={mode === "some" ? id : undefined} className={clsx("min-w-0 flex-1", mode === "some" && "cursor-pointer")}>
                    <span className="block font-semibold leading-snug text-ink">{l.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      {l.variant ? <span>{l.variant}</span> : null}
                      {l.kind === "gift" ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">
                          <Gift className="h-3.5 w-3.5" aria-hidden />
                          {t.select.gift}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {mode === "some" && on && l.qty > 1 ? (
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <span className="sr-only">
                        {t.select.qty}: {l.name}
                      </span>
                      <select
                        className="field w-auto py-1.5 pr-8"
                        value={picked[l.line]}
                        onChange={(e) => setPicked((p) => ({ ...p, [l.line]: Number(e.target.value) }))}
                      >
                        {Array.from({ length: l.qty }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span aria-hidden>{fmt(t.select.qtyOf, { n: l.qty })}</span>
                    </label>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{fmt(t.select.pcs, { n: l.qty })}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {selectError ? (
            <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-semibold text-sale">
              <AlertCircle className="h-4 w-4" aria-hidden />
              {t.errors.noItems}
            </p>
          ) : null}

          <div className="mt-5">
            <label htmlFor="wd-reason" className={labelCls}>
              {t.select.reason}
            </label>
            <textarea id="wd-reason" className="field min-h-24" maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <p className="mt-4 text-sm text-muted">{t.select.sealed}</p>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" className="btn btn-ghost" onClick={() => setDismissed(lookup)}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t.select.back}
            </button>
            <button type="button" className="btn btn-primary h-12 px-7" onClick={goReview}>
              {t.select.next}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && order ? (
        <section className="card p-5 sm:p-6 md:p-8" aria-labelledby="wd-step-title">
          <h2 id="wd-step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
            {t.review.title}
          </h2>
          <Statement order={order} lines={chosen} whole={mode === "all"} reason={reason.trim()} />
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">{t.review.note}</p>
          <form action={confirmFormAction} className="mt-5">
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="order" value={number} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="reason" value={reason} />
            {mode === "some" ? chosen.map((l) => <input key={l.line} type="hidden" name="sel" value={`${l.line}:${l.qty}`} />) : null}
            {confirm && !confirm.ok && confirm !== staleConfirm ? (
              <div className="mb-4">
                <ErrorBox error={confirm.error} shopEmail={shopEmail} />
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setReviewing(false);
                  setStaleConfirm(confirm);
                }}
                disabled={confirmPending}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {t.review.edit}
              </button>
              <button type="submit" className="btn btn-primary h-12 px-7 text-base" disabled={confirmPending}>
                {confirmPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                {confirmPending ? t.review.confirming : t.review.confirm}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step === 4 && receipt ? (
        <section className="card overflow-hidden" aria-labelledby="wd-step-title">
          <div className="flex items-start gap-3 bg-[#e9f5ee] p-5 sm:p-6 md:px-8">
            <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-success" aria-hidden />
            <div role="status">
              <h2 id="wd-step-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none md:text-2xl">
                {t.done.title}
              </h2>
              <p className="mt-1.5 text-ink">
                {receipt.mailed
                  ? fmt(t.done.text, { date: receipt.date, time: receipt.time, email: receipt.email })
                  : fmt(t.done.textNoMail, { date: receipt.date, time: receipt.time, shop: shopEmail })}
              </p>
            </div>
          </div>
          <div className="space-y-4 p-5 sm:p-6 md:px-8">
            <ul className="space-y-2 text-ink-soft">
              <li>{fmt(t.done.ret, { address: receipt.returnAddress })}</li>
              <li>{fmt(t.done.refund, { amount: receipt.refund })}</li>
              {receipt.cod ? <li>{t.done.cod}</li> : null}
              {receipt.giftNote ? <li>{t.done.gift}</li> : null}
            </ul>
            <div className="rounded-md border border-line bg-canvas/60 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted">{t.done.statement}</p>
              <p className="mt-2 text-ink">
                {QUOTES[lang][0]}
                {receipt.wholeOrder ? `${t.review.statement.replace(/:$/, "")} (${t.review.wholeOrder}):` : t.review.statement}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
                {receipt.lines.map((l, i) => (
                  <li key={i}>
                    {l}
                    {i === receipt.lines.length - 1 ? QUOTES[lang][1] : ""}
                  </li>
                ))}
              </ul>
              {receipt.reason ? (
                <p className="mt-2 text-sm text-ink-soft">
                  {t.review.reason}: {receipt.reason}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted">{fmt(t.done.reference, { id: receipt.id })}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={localizeHref("/vrashtane", lang)} className="btn btn-outline">
                {t.done.returns}
              </Link>
              <Link href={localizeHref("/", lang)} className="btn btn-ghost">
                {t.done.home}
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const t = useDict().info.withdraw;
  const labels = [t.steps.order, t.steps.items, t.steps.confirm];
  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {fmt(t.stepOf, { n: step, total: labels.length })}: {labels[step - 1]}
      </p>
      <ol className="flex items-center gap-2" aria-hidden>
        {labels.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "next";
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={clsx(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-pill text-sm font-bold",
                  state === "current" && "bg-primary text-white",
                  state === "done" && "bg-primary-50 text-primary",
                  state === "next" && "border-[1.5px] border-line bg-surface text-muted",
                )}
              >
                {state === "done" ? <CheckCircle2 className="h-4.5 w-4.5" /> : n}
              </span>
              <span className={clsx("truncate text-sm font-semibold", state === "current" ? "text-ink" : "hidden text-muted sm:inline")}>{label}</span>
              {n < labels.length ? <span className="hidden h-px flex-1 bg-line sm:block" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Statement({ order, lines, whole, reason }: { order: WithdrawalOrderView; lines: WithdrawalOrderView["lines"]; whole: boolean; reason: string }) {
  const t = useDict().info.withdraw;
  const [qo, qc] = QUOTES[useLang()];
  return (
    <div className="mt-5 rounded-md border border-line bg-canvas/60 p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted">{t.review.statementTitle}</p>
      <dl className="mt-3 grid gap-x-5 gap-y-1.5 text-[0.95rem] sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="font-semibold text-ink">{t.review.to}</dt>
        <dd className="text-ink-soft">{order.trader}</dd>
        {order.name ? (
          <>
            <dt className="font-semibold text-ink">{t.review.name}</dt>
            <dd className="text-ink-soft">{order.name}</dd>
          </>
        ) : null}
        <dt className="font-semibold text-ink">{t.review.order}</dt>
        <dd className="text-ink-soft">{fmt(t.review.orderValue, { number: order.number, date: order.date })}</dd>
        <dt className="font-semibold text-ink">{t.review.ack}</dt>
        <dd className="break-all text-ink-soft">{order.ackEmail}</dd>
      </dl>
      <p className="mt-4 text-ink">
        {qo}
        {whole ? `${t.review.statement.replace(/:$/, "")} (${t.review.wholeOrder}):` : t.review.statement}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
        {lines.map((l, i) => (
          <li key={l.line}>
            {l.qty} × {l.name}
            {l.variant ? ` (${l.variant})` : ""}
            {l.kind === "gift" ? ` — ${t.select.gift.toLowerCase()}` : ""}
            {i === lines.length - 1 ? qc : ""}
          </li>
        ))}
      </ul>
      {reason ? (
        <p className="mt-3 text-sm text-ink-soft">
          <span className="font-semibold text-ink">{t.review.reason}:</span> {reason}
        </p>
      ) : null}
    </div>
  );
}

function ErrorBox({ error, shopEmail }: { error: WithdrawalError; shopEmail: string }) {
  const lang = useLang();
  const t = useDict().info.withdraw.errors;
  const text = error === "failed" ? fmt(t.failed, { email: shopEmail }) : t[error];
  return (
    <div role="alert" className="flex gap-2.5 rounded-md border border-sale/25 bg-[#fcecee] p-3.5 text-sm text-ink">
      <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-sale" aria-hidden />
      <div>
        <p>{text}</p>
        {error === "expired" ? (
          <Link href={localizeHref("/obshti-usloviya#garantsiya", lang)} className="mt-1 inline-block font-semibold text-primary underline underline-offset-2">
            {t.complaint}
          </Link>
        ) : null}
        {error === "cancelled" ? (
          <Link href={localizeHref("/kontakti", lang)} className="mt-1 inline-block font-semibold text-primary underline underline-offset-2">
            {t.contact}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
