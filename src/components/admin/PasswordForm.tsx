"use client";

import { useActionState } from "react";
import { Check, CircleAlert, KeyRound, LoaderCircle } from "lucide-react";
import { changePasswordAction } from "@/app/admin/_actions/auth";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="rounded-3xl border border-line bg-white p-6 md:p-7">
      <h2 className="flex items-center gap-2 text-xl font-black">
        <KeyRound className="h-5 w-5" /> Смяна на парола
      </h2>
      <div className="mt-5 grid max-w-md grid-cols-[minmax(0,1fr)] gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-extrabold">Сегашна парола</span>
          <input type="password" name="current" autoComplete="current-password" required className="field" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-extrabold">Нова парола</span>
          <input type="password" name="next" autoComplete="new-password" required minLength={10} className="field" />
          <span className="mt-1.5 block text-sm text-muted">Поне 10 символа, с поне една буква и една цифра.</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-extrabold">Повторете новата парола</span>
          <input type="password" name="repeat" autoComplete="new-password" required className="field" />
        </label>
        {state?.error ? (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-soft p-3 text-sm font-bold text-brand-dark" role="alert">
            <CircleAlert className="h-4 w-4 shrink-0" /> {state.error}
          </p>
        ) : null}
        {state?.ok ? (
          <p className="flex items-center gap-2 rounded-2xl bg-mint-soft p-3 text-sm font-bold text-mint" role="status">
            <Check className="h-4 w-4" strokeWidth={3} /> Паролата е сменена. Другите устройства са изписани.
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="btn btn-primary h-12 w-fit px-7">
          {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null} Смени паролата
        </button>
      </div>
    </form>
  );
}
