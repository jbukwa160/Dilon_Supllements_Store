"use client";

import { useActionState, useRef, useState } from "react";
import { Cookie, LogOut, MonitorSmartphone, Save, Trash2 } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { useSettings } from "@/components/SettingsProvider";
import { useConsent } from "@/components/consent/ConsentProvider";
import { Dialog } from "@/components/ui/Dialog";
import { logoutAction } from "@/app/[lang]/(shop)/vhod/actions";
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  logoutEverywhereAction,
  marketingAction,
  updateProfileAction,
} from "@/app/[lang]/(shop)/profil/actions";
import { setAccount } from "./account-store";
import { Checkbox, FormAlert, PasswordField, SubmitButton, TextField, useErrorText, useFocusOnError } from "./fields";
import type { FormState } from "./form-state";

// Forms of /profil/danni. Each one is a small useActionState form posting to its Server Action; success and
// error messages are announced (role="status" / role="alert") next to the form's button.

export function ProfileForm({ firstName, lastName, phone }: { firstName: string; lastName: string; phone: string }) {
  const lang = useLang();
  const t = useDict().account;
  const err = useErrorText();
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);
  const f = state?.fields ?? {};
  const v = state?.values;
  return (
    <form ref={form} action={action} noValidate className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="firstName"
          label={t.firstName}
          autoComplete="given-name"
          maxLength={80}
          defaultValue={v?.firstName ?? firstName}
          error={err(f.firstName)}
        />
        <TextField
          name="lastName"
          label={t.lastName}
          autoComplete="family-name"
          maxLength={80}
          defaultValue={v?.lastName ?? lastName}
          error={err(f.lastName)}
        />
      </div>
      <TextField
        name="phone"
        type="tel"
        label={t.phone}
        optional
        autoComplete="tel"
        inputMode="tel"
        maxLength={30}
        defaultValue={v?.phone ?? phone}
        hint={t.signUp.phoneHint}
        error={err(f.phone)}
        className="sm:max-w-[calc(50%-0.5rem)]"
      />
      <Outcome state={state} success={t.data.saved} />
      <SubmitButton pending={pending} icon={<Save className="h-5 w-5" aria-hidden />}>
        {t.data.save}
      </SubmitButton>
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const lang = useLang();
  const t = useDict().account;
  const err = useErrorText();
  const [state, action, pending] = useActionState(changeEmailAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);
  const f = state?.fields ?? {};
  return (
    <form ref={form} action={action} noValidate className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      <p className="text-muted">{fmt(t.data.currentEmail, { email })}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="email"
          type="email"
          label={t.data.newEmail}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          defaultValue={state?.ok ? "" : state?.values?.email}
          error={err(f.email)}
        />
        <PasswordField name="password" label={t.data.currentPassword} autoComplete="current-password" error={err(f.password)} />
      </div>
      <p className="text-sm text-muted">{t.data.emailNote}</p>
      <Outcome state={state} success={fmt(t.data.emailChanged, { email: state?.values?.email ?? "" })} />
      <SubmitButton pending={pending} variant="outline">
        {t.data.emailSubmit}
      </SubmitButton>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const lang = useLang();
  const t = useDict().account;
  const err = useErrorText();
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);
  const f = state?.fields ?? {};
  return (
    <form ref={form} action={action} noValidate className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <PasswordField
        name="current"
        label={t.data.currentPassword}
        autoComplete="current-password"
        error={err(f.current)}
        className="sm:max-w-[calc(50%-0.5rem)]"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField name="password" label={t.newPassword} autoComplete="new-password" rules error={err(f.password)} />
        <PasswordField name="repeat" label={t.data.repeatPassword} autoComplete="new-password" error={err(f.repeat)} />
      </div>
      <Outcome state={state} success={t.data.passwordChanged} />
      <SubmitButton pending={pending} variant="outline">
        {t.data.passwordSubmit}
      </SubmitButton>
    </form>
  );
}

export function MarketingForm({ on, status, since }: { on: boolean; status: "none" | "pending" | "confirmed"; since: string | null }) {
  const lang = useLang();
  const t = useDict().account;
  const store = useSettings().name;
  const err = useErrorText();
  const [state, action, pending] = useActionState(marketingAction, null);
  const checked = state?.values ? state.values.marketing === "on" : on;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      <Checkbox key={String(checked)} name="marketing" defaultChecked={checked}>
        {fmt(t.marketing, { store })}
      </Checkbox>
      <p className="text-sm text-muted">
        {!on
          ? t.data.consentNone
          : status === "confirmed"
            ? since
              ? fmt(t.data.consentSince, { date: since })
              : t.data.consentNone
            : status === "pending"
              ? t.data.consentPending
              : t.data.consentExpired}
      </p>
      <div aria-live="polite">
        {state?.ok ? <FormAlert tone="success">{checked ? t.data.consentOn : t.data.consentOff}</FormAlert> : null}
        {state?.error ? <FormAlert>{err(state.error)}</FormAlert> : null}
      </div>
      <SubmitButton pending={pending} variant="outline">
        {t.data.consentSave}
      </SubmitButton>
    </form>
  );
}

export function CookieSettingsButton() {
  const t = useDict().account;
  const { openSettings } = useConsent();
  return (
    <button type="button" onClick={openSettings} className="btn btn-ghost">
      <Cookie className="h-5 w-5" aria-hidden />
      {t.data.cookieSettings}
    </button>
  );
}

export function SessionsForms({ count }: { count: number }) {
  const lang = useLang();
  const d = useDict();
  const t = d.account.data;
  const [pendingAll, setPendingAll] = useState(false);
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2.5">
        <MonitorSmartphone className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        {fmt(count === 1 ? t.sessions.one : t.sessions.other, { n: count })}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <form action={logoutAction} onSubmit={() => setAccount(null)}>
          <input type="hidden" name="lang" value={lang} />
          <button type="submit" className="btn btn-ghost w-full sm:w-auto">
            <LogOut className="h-5 w-5" aria-hidden />
            {t.logoutHere}
          </button>
        </form>
        <form
          action={logoutEverywhereAction}
          onSubmit={() => {
            setPendingAll(true);
            setAccount(null);
          }}
        >
          <input type="hidden" name="lang" value={lang} />
          <SubmitButton pending={pendingAll} variant="outline" className="w-full sm:w-auto" icon={<LogOut className="h-5 w-5" aria-hidden />}>
            {t.logoutEverywhere}
          </SubmitButton>
        </form>
      </div>
      <p className="text-sm text-muted">{t.logoutEverywhereHint}</p>
    </div>
  );
}

export function DeleteAccount() {
  const lang = useLang();
  const t = useDict().account;
  const err = useErrorText();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteAccountAction, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(form, state);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn border-sale bg-surface text-sale hover:bg-sale hover:text-white">
        <Trash2 className="h-5 w-5" aria-hidden />
        {t.data.deleteButton}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t.data.deleteDialogTitle} description={t.data.deleteDialogText} size="sm">
        <form ref={form} action={action} noValidate className="space-y-4 pb-1">
          <input type="hidden" name="lang" value={lang} />
          <PasswordField name="password" label={t.data.deletePassword} autoComplete="current-password" error={err(state?.fields?.password)} data-autofocus />
          {state?.error ? <FormAlert>{err(state.error, state.vars)}</FormAlert> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              {t.data.cancel}
            </button>
            <SubmitButton pending={pending} variant="danger" icon={<Trash2 className="h-5 w-5" aria-hidden />}>
              {t.data.deleteConfirm}
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Success / error line of a form. */
function Outcome({ state, success }: { state: FormState; success: string }) {
  const err = useErrorText();
  return (
    <div aria-live="polite">
      {state?.ok ? <FormAlert tone="success">{success}</FormAlert> : null}
      {state?.error ? <FormAlert>{err(state.error, state.vars)}</FormAlert> : null}
    </div>
  );
}
