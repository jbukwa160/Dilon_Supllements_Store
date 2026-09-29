"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleAlert, LoaderCircle, LogOut, MailX, ShieldCheck, Trash2, X } from "lucide-react";
import { deleteCustomerAction, setCustomerBlockedAction, signOutCustomerAction, unsubscribeAction } from "@/app/admin/_actions/customers";

type Result = { ok?: boolean; error?: string };

/** Account actions on the admin customer page: sign out everywhere, block / unblock, GDPR delete (confirmed by typing the e-mail). */
export function CustomerActions({ id, email, blocked, sessions }: { id: number; email: string; blocked: boolean; sessions: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");

  const run = (fn: () => Promise<Result>, done: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMessage({ ok: true, text: done });
        if (after) after();
        else router.refresh();
      } else setMessage({ ok: false, text: r.error ?? "Възникна грешка." });
    });

  return (
    <section className="rounded-3xl border border-line bg-white p-5 md:p-6" aria-labelledby="customer-actions">
      <h2 id="customer-actions" className="text-lg font-black">
        Действия с профила
      </h2>
      <p className="mt-1 text-sm text-muted">
        Активни сесии (устройства): <b className="text-ink">{sessions}</b>
      </p>
      <div className="mt-4 space-y-3">
        <button
          type="button"
          disabled={pending || sessions === 0}
          onClick={() => {
            if (confirm("Да излезе ли клиентът от профила си на всички устройства?")) run(() => signOutCustomerAction(id), "Клиентът е изведен от всички устройства.");
          }}
          className="btn btn-ghost h-11 w-full justify-start px-4"
        >
          <LogOut className="h-4 w-4" /> Изход от всички устройства
        </button>
        {blocked ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setCustomerBlockedAction(id, false), "Профилът е отблокиран.")}
            className="btn btn-ghost h-11 w-full justify-start px-4"
          >
            <ShieldCheck className="h-4 w-4 text-mint" /> Отблокирай профила
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Да блокирам ли профила? Клиентът ще бъде изведен и няма да може да влиза, докато не го отблокирате. Поръчките остават."))
                run(() => setCustomerBlockedAction(id, true), "Профилът е блокиран.");
            }}
            className="btn btn-ghost h-11 w-full justify-start px-4"
          >
            <Ban className="h-4 w-4 text-brand" /> Блокирай профила
          </button>
        )}

        {!confirmDelete ? (
          <button type="button" disabled={pending} onClick={() => setConfirmDelete(true)} className="btn btn-ghost h-11 w-full justify-start px-4 text-brand">
            <Trash2 className="h-4 w-4" /> Изтрий профила (GDPR)
          </button>
        ) : (
          <div className="rounded-2xl border-2 border-brand bg-brand-soft/40 p-4" role="group" aria-labelledby="delete-customer-title">
            <div className="flex items-start justify-between gap-2">
              <p id="delete-customer-title" className="font-black text-brand">
                Изтриване на профила
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  setTyped("");
                }}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-white"
                aria-label="Отказ"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Изтриват се профилът, адресите, сесиите и абонаментът за бюлетина. <b>Поръчките остават</b> (законов срок за съхранение), но вече не са свързани с
              профил. Действието не може да се върне.
            </p>
            <label className="mt-3 block text-sm font-extrabold">
              За потвърждение въведете имейла на клиента
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} autoComplete="off" className="field mt-1.5" />
            </label>
            <button
              type="button"
              disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
              onClick={() =>
                run(
                  () => deleteCustomerAction(id, typed),
                  "Профилът е изтрит.",
                  () => router.push("/admin/poruchki/klienti?deleted=1"),
                )
              }
              className="btn mt-3 h-11 w-full bg-brand px-4 text-white hover:bg-brand-dark"
            >
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Изтрий окончателно
            </button>
          </div>
        )}
      </div>
      <p className="mt-3 min-h-5 text-sm font-bold" aria-live="polite">
        {message ? (
          <span className={message.ok ? "text-mint" : "inline-flex items-center gap-1.5 text-brand"}>
            {!message.ok ? <CircleAlert className="h-4 w-4" /> : null}
            {message.text}
          </span>
        ) : null}
      </p>
    </section>
  );
}

/** "Отпиши" on the subscribers list. */
export function UnsubscribeButton({ email }: { email: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-xs font-bold text-brand">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Да отпиша ли ${email} от маркетинговите имейли?`)) return;
          start(async () => {
            const r = await unsubscribeAction(email);
            if (r.ok) router.refresh();
            else setError(r.error ?? "Грешка");
          });
        }}
        className="btn btn-ghost h-9 px-3 text-sm"
        aria-label={`Отпиши ${email}`}
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MailX className="h-4 w-4" />} Отпиши
      </button>
    </span>
  );
}
