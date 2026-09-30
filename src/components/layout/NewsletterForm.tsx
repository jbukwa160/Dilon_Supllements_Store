"use client";

import { useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import { Spinner } from "@/components/ui/Spinner";

type Status = "idle" | "sending" | "done" | "invalid" | "rate_limited" | "failed";

// Loose client-side check; the server validates properly.
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Newsletter sign-up → POST /api/newsletter { email, lang }. `tone="dark"` in the footer, "light" on the home
 * page's band. The consent line (with the privacy policy link) sits under the field; nothing is pre-ticked.
 */
export function NewsletterForm({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const lang = useLang();
  const dict = useDict();
  const t = dict.newsletter;
  const uid = useId();
  const [status, setStatus] = useState<Status>("idle");
  const dark = tone === "dark";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    if (!EMAIL_LIKE.test(email)) {
      setStatus("invalid");
      form.querySelector<HTMLInputElement>("input[name=email]")?.focus();
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang, website: String(data.get("website") ?? "") }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && body?.ok) {
        setStatus("done");
        form.reset();
      } else setStatus(body?.error === "invalid" ? "invalid" : body?.error === "rate_limited" ? "rate_limited" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  const error = status === "invalid" ? t.invalid : status === "rate_limited" ? t.rateLimited : status === "failed" ? t.failed : null;

  if (status === "done") {
    return (
      <p role="status" className={clsx("flex items-start gap-2 rounded-[var(--radius-md)] px-4 py-3 font-semibold", dark ? "bg-white/10 text-white" : "bg-surface text-success", className)}>
        <CheckCircle2 className={clsx("mt-0.5 h-5 w-5 shrink-0", dark ? "text-white" : "text-success")} aria-hidden />
        {t.success}
      </p>
    );
  }

  return (
    // method/action: without JavaScript the browser posts the form to the API, which sends it back to this page.
    <form method="post" action="/api/newsletter" onSubmit={onSubmit} noValidate className={clsx("w-full", className)}>
      <input type="hidden" name="lang" value={lang} />
      <div className={clsx("flex items-center gap-1 rounded-[var(--radius-md)] p-1", dark ? "bg-white/10 ring-1 ring-white/25 focus-within:ring-white" : "bg-surface ring-1 ring-line focus-within:ring-primary")}>
        <label htmlFor={`${uid}-email`} className="sr-only">
          {t.emailLabel}
        </label>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={200}
          placeholder={t.placeholder}
          aria-invalid={status === "invalid" || undefined}
          aria-describedby={`${uid}-consent${error ? ` ${uid}-error` : ""}`}
          className={clsx(
            "h-11 min-w-0 flex-1 bg-transparent px-4 text-base outline-none focus-visible:outline-none",
            dark ? "text-white placeholder:text-white/80" : "text-ink placeholder:text-muted",
          )}
        />
        {/* Honeypot for bots: hidden from people and assistive technology. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-px w-px opacity-0" />
        <button type="submit" disabled={status === "sending"} className={clsx("btn shrink-0 px-5", dark ? "border-white text-white hover:bg-white hover:text-ink" : "btn-primary")}>
          {status === "sending" ? <Spinner className="h-4 w-4" /> : null}
          {t.submit}
        </button>
      </div>
      <p id={`${uid}-error`} role="alert" className={clsx("mt-2 text-sm font-semibold", dark ? "w-fit rounded-[var(--radius-sm)] bg-ink px-3 py-1.5 text-white" : "px-4 text-sale", !error && "hidden")}>
        {error}
      </p>
      <p id={`${uid}-consent`} className={clsx("mt-2 px-4 text-xs leading-relaxed", dark ? "text-white" : "text-muted")}>
        {t.consent}{" "}
        <Link href={localizeHref("/poveritelnost", lang)} className={clsx("underline underline-offset-2", dark ? "hover:text-white" : "hover:text-ink")}>
          {t.privacyLink}
        </Link>
        .
      </p>
    </form>
  );
}
