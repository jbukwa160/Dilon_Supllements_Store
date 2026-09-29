"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck, Send } from "lucide-react";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import { forgotPasswordAction } from "@/app/[lang]/(shop)/vhod/actions";
import { FormAlert, SubmitButton, TextField, useErrorText, useFocusOnError } from "./fields";

export function ForgotForm({ email }: { email?: string }) {
  const lang = useLang();
  const t = useDict().account;
  const err = useErrorText();
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);

  if (state?.ok) {
    return (
      <div className="mt-6 space-y-5">
        <div role="status" className="rounded-lg bg-primary-50 p-5">
          <MailCheck className="h-8 w-8 text-primary" aria-hidden />
          <h2 className="mt-3 text-lg font-bold">{t.forgotPage.sentTitle}</h2>
          <p className="mt-1">{t.resetSent}</p>
          <p className="mt-3 text-sm text-muted">{t.forgotPage.sentHint}</p>
        </div>
        <Link href={localizeHref("/vhod", lang)} className="btn btn-ghost w-full">
          <ArrowLeft className="h-5 w-5" aria-hidden />
          {t.forgotPage.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form ref={form} action={action} noValidate className="mt-6 space-y-5">
      <input type="hidden" name="lang" value={lang} />
      <TextField
        name="email"
        type="email"
        label={t.email}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={200}
        defaultValue={state?.values?.email ?? email}
        error={err(state?.fields?.email)}
      />
      {state?.error ? <FormAlert>{err(state.error, state.vars)}</FormAlert> : null}
      <SubmitButton pending={pending} className="h-12 w-full text-base" icon={<Send className="h-5 w-5" aria-hidden />}>
        {t.forgotPage.submit}
      </SubmitButton>
      <p className="text-center">
        <Link href={localizeHref("/vhod", lang)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.forgotPage.backToLogin}
        </Link>
      </p>
    </form>
  );
}
