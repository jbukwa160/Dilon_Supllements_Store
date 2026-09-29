"use client";

// Contact form of /kontakti: name, e-mail, optional phone and order number, message → Server Action (passed in by
// the page) that e-mails the shop. Honeypot "website" field, privacy note (information, not consent).
import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import type { ContactField, ContactState } from "./contact-types";
import { fmtNodes } from "./fmt-nodes";

type Fields = { name: string; email: string; phone: string; order: string; message: string };
const EMPTY: Fields = { name: "", email: "", phone: "", order: "", message: "" };

export function ContactForm({ action, shopEmail }: { action: (prev: ContactState | null, fd: FormData) => Promise<ContactState>; shopEmail: string }) {
  const lang = useLang();
  const t = useDict().info.contact.form;
  const [state, formAction, pending] = useActionState(action, null);
  const [f, setF] = useState<Fields>(EMPTY);
  // "Send another message" hides the success panel of this result.
  const [closed, setClosed] = useState<ContactState | null>(null);

  const fieldErrors = state && !state.ok && state.error === "fields" ? state.fields : {};
  const err = (k: ContactField) => {
    const code = fieldErrors[k];
    return code ? t.errors[code] : null;
  };
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  if (state?.ok && state !== closed) {
    return (
      <div role="status" className="rounded-md border border-success/25 bg-[#e9f5ee] p-5">
        <p className="flex items-start gap-2.5 font-semibold text-ink">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          {fmt(t.success, { email: state.email || f.email })}
        </p>
        <button
          type="button"
          className="btn btn-ghost mt-4"
          onClick={() => {
            setClosed(state);
            setF(EMPTY);
          }}
        >
          {t.another}
        </button>
      </div>
    );
  }

  const input = (k: "name" | "email" | "phone" | "order", label: string, opts: { type?: string; auto?: string; optional?: boolean; max: number }) => {
    const error = k === "name" || k === "email" ? err(k) : null;
    return (
      <div>
        <label htmlFor={`cf-${k}`} className="mb-1.5 block text-sm font-semibold text-ink">
          {label}
          {opts.optional ? <span className="font-normal text-muted"> ({t.optional})</span> : null}
        </label>
        <input
          id={`cf-${k}`}
          name={k}
          type={opts.type ?? "text"}
          className="field"
          autoComplete={opts.auto}
          maxLength={opts.max}
          required={!opts.optional}
          value={f[k]}
          onChange={set(k)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `cf-${k}-error` : undefined}
        />
        {error ? (
          <p id={`cf-${k}-error`} className="mt-1 text-sm font-semibold text-sale">
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  const messageError = err("message");
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="lang" value={lang} />
      {/* Honeypot: invisible to people, filled in by bots. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor="cf-website">{t.honeypot}</label>
        <input id="cf-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {input("name", t.name, { auto: "name", max: 100 })}
        {input("email", t.email, { type: "email", auto: "email", max: 200 })}
        {input("phone", t.phone, { type: "tel", auto: "tel", optional: true, max: 40 })}
        {input("order", t.order, { optional: true, max: 30 })}
      </div>
      <div>
        <label htmlFor="cf-message" className="mb-1.5 block text-sm font-semibold text-ink">
          {t.message}
        </label>
        <textarea
          id="cf-message"
          name="message"
          className="field min-h-36"
          rows={6}
          maxLength={5000}
          required
          placeholder={t.messageHint}
          value={f.message}
          onChange={set("message")}
          aria-invalid={messageError ? true : undefined}
          aria-describedby={`cf-note${messageError ? " cf-message-error" : ""}`}
        />
        {messageError ? (
          <p id="cf-message-error" className="mt-1 text-sm font-semibold text-sale">
            {messageError}
          </p>
        ) : null}
      </div>
      <div id="cf-note" className="space-y-1 text-sm leading-relaxed text-muted">
        <p>
          {fmtNodes(t.privacy, {
            link: (
              <Link href={localizeHref("/poveritelnost", lang)} className="font-semibold text-primary underline underline-offset-2">
                {t.privacyLink}
              </Link>
            ),
          })}
        </p>
        <p>{t.health}</p>
      </div>
      {state && !state.ok && state.error !== "fields" ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-sale/25 bg-[#fcecee] p-3 text-sm text-ink">
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-sale" aria-hidden />
          {state.error === "rateLimited" ? t.errors.rateLimited : fmt(t.errors.failed, { email: shopEmail })}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary h-12 w-full px-7 sm:w-auto" disabled={pending}>
        {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-4.5 w-4.5" aria-hidden />}
        {pending ? t.sending : t.submit}
      </button>
    </form>
  );
}
