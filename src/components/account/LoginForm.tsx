"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import { loginAction } from "@/app/[lang]/(shop)/vhod/actions";
import { Checkbox, FormAlert, PasswordField, SubmitButton, TextField, useErrorText, useFocusOnError } from "./fields";

export function LoginForm({ next }: { next: string }) {
  const lang = useLang();
  const t = useDict().account;
  const err = useErrorText();
  const [state, action, pending] = useActionState(loginAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);
  const f = state?.fields ?? {};
  const forgotHref = localizeHref("/zabravena-parola", lang);

  return (
    <form ref={form} action={action} noValidate className="mt-6 space-y-5">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="next" value={next} />
      <TextField
        name="email"
        type="email"
        label={t.email}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={200}
        defaultValue={state?.values?.email}
        error={err(f.email)}
      />
      <PasswordField
        name="password"
        label={t.password}
        autoComplete="current-password"
        error={err(f.password)}
        aside={
          <Link href={forgotHref} className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline">
            {t.forgot}
          </Link>
        }
      />
      <Checkbox name="remember" defaultChecked={state?.values?.remember === "on"}>
        {t.remember}
      </Checkbox>
      {state?.error ? <FormAlert>{err(state.error, state.vars)}</FormAlert> : null}
      <SubmitButton pending={pending} className="h-12 w-full text-base" icon={<LogIn className="h-5 w-5" aria-hidden />}>
        {t.signIn.submit}
      </SubmitButton>
    </form>
  );
}
