"use client";

import { useActionState, useRef } from "react";
import { UserRoundPlus } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import { useSettings } from "@/components/SettingsProvider";
import { registerAction } from "@/app/[lang]/(shop)/vhod/actions";
import { Checkbox, FormAlert, PasswordField, SubmitButton, TextField, useErrorText, useFocusOnError } from "./fields";

/** "{terms}" in a dictionary string -> the given link element. */
function withLink(template: string, token: string, link: React.ReactNode) {
  const [before, after = ""] = template.split(`{${token}}`);
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const lang = useLang();
  const t = useDict().account;
  const store = useSettings().name;
  const err = useErrorText();
  const [state, action, pending] = useActionState(registerAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);
  const f = state?.fields ?? {};
  const v = state?.values ?? {};
  const legal = (href: string, label: string) => (
    <a
      href={localizeHref(href, lang)}
      target="_blank"
      rel="noopener"
      className="font-semibold text-primary underline underline-offset-2 hover:text-primary-700"
    >
      {label}
    </a>
  );

  return (
    <form ref={form} action={action} noValidate className="mt-6 space-y-5">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="firstName" label={t.firstName} autoComplete="given-name" maxLength={80} defaultValue={v.firstName} error={err(f.firstName)} />
        <TextField name="lastName" label={t.lastName} autoComplete="family-name" maxLength={80} defaultValue={v.lastName} error={err(f.lastName)} />
      </div>
      <TextField
        name="email"
        type="email"
        label={t.email}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={200}
        defaultValue={v.email}
        error={err(f.email)}
      />
      <TextField
        name="phone"
        type="tel"
        label={t.phone}
        optional
        autoComplete="tel"
        inputMode="tel"
        maxLength={30}
        defaultValue={v.phone}
        hint={t.signUp.phoneHint}
        error={err(f.phone)}
      />
      <PasswordField name="password" label={t.password} autoComplete="new-password" rules error={err(f.password)} />

      <div className="space-y-4 rounded-md bg-canvas p-4">
        <Checkbox name="terms" required defaultChecked={v.terms === "on"} error={err(f.terms)}>
          {withLink(t.signUp.terms, "terms", legal("/obshti-usloviya", t.signUp.termsLink))}
        </Checkbox>
        <Checkbox name="marketing" defaultChecked={v.marketing === "on"}>
          {fmt(t.marketing, { store })} <span className="text-muted">({t.optional})</span>
        </Checkbox>
        <p className="text-sm text-muted">{withLink(t.signUp.privacy, "privacy", legal("/poveritelnost", t.signUp.privacyLink))}</p>
      </div>

      {state?.error ? <FormAlert>{err(state.error, state.vars)}</FormAlert> : null}
      <SubmitButton pending={pending} className="h-12 w-full text-base" icon={<UserRoundPlus className="h-5 w-5" aria-hidden />}>
        {t.create}
      </SubmitButton>
    </form>
  );
}
