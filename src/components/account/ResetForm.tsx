"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import { resetPasswordAction } from "@/app/[lang]/(shop)/vhod/actions";
import { FormAlert, PasswordField, SubmitButton, useErrorText, useFocusOnError } from "./fields";

export function ResetForm({ token }: { token: string }) {
  const lang = useLang();
  const t = useDict().account;
  const err = useErrorText();
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);
  const f = state?.fields ?? {};
  const linkProblem = state?.error === "invalid_link" || state?.error === "expired";

  return (
    <form ref={form} action={action} noValidate className="mt-6 space-y-5">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="token" value={token} />
      <PasswordField name="password" label={t.newPassword} autoComplete="new-password" rules error={err(f.password)} />
      <PasswordField name="repeat" label={t.reset.repeat} autoComplete="new-password" error={err(f.repeat)} />
      {state?.error ? (
        <FormAlert>
          {err(state.error, state.vars)}
          {linkProblem ? (
            <>
              {" "}
              <Link href={localizeHref("/zabravena-parola", lang)} className="underline underline-offset-2">
                {t.reset.requestNew}
              </Link>
            </>
          ) : null}
        </FormAlert>
      ) : null}
      <SubmitButton pending={pending} className="h-12 w-full text-base" icon={<KeyRound className="h-5 w-5" aria-hidden />}>
        {t.reset.submit}
      </SubmitButton>
    </form>
  );
}
