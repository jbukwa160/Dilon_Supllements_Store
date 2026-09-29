"use client";

import { useActionState, useId, useRef, useState } from "react";
import clsx from "clsx";
import { MapPinPlus, Pencil, Star, Trash2 } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { DELIVERY_KEYS, DELIVERY_METHODS, type DeliveryKey } from "@/lib/checkout";
import type { SavedAddress } from "@/lib/customer-addresses";
import { Dialog } from "@/components/ui/Dialog";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/app/[lang]/(shop)/profil/actions";
import { AddressSummary } from "./AddressSummary";
import { Checkbox, FormAlert, SubmitButton, TextField, useErrorText, useFocusOnError } from "./fields";
import type { FormState } from "./form-state";

// Address book (/profil/adresi): list, add / edit in a dialog (bottom sheet on phones), delete with confirmation,
// "make default". Courier offices picked in the checkout are saved there by the checkout itself.

type Editing = { mode: "new" } | { mode: "edit"; address: SavedAddress } | null;

export function AddressBook({ addresses }: { addresses: SavedAddress[] }) {
  const lang = useLang();
  const t = useDict().account.addressBook;
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<SavedAddress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const openNew = () => {
    setNotice(null);
    setFormKey((k) => k + 1);
    setEditing({ mode: "new" });
  };
  const openEdit = (a: SavedAddress) => {
    setNotice(null);
    setFormKey((k) => k + 1);
    setEditing({ mode: "edit", address: a });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">{t.intro}</p>
        <button type="button" onClick={openNew} className="btn btn-primary">
          <MapPinPlus className="h-5 w-5" aria-hidden />
          {t.add}
        </button>
      </div>

      <div aria-live="polite">{notice ? <FormAlert tone="success">{notice}</FormAlert> : null}</div>

      {addresses.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => {
            const label = a.label || t.untitled;
            return (
              <li key={a.id} className={clsx("card flex flex-col p-5", a.isDefault && "border-primary ring-1 ring-primary")}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold">{label}</h2>
                  {a.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">
                      <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                      {t.isDefaultBadge}
                    </span>
                  ) : null}
                </div>
                <AddressSummary address={a} lang={lang} hideLabel className="mt-2 flex-1" />
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  {a.office ? null : (
                    <button type="button" onClick={() => openEdit(a)} className="btn btn-ghost min-h-10 px-4 text-sm" aria-label={fmt(t.editLabel, { label })}>
                      <Pencil className="h-4 w-4" aria-hidden />
                      {t.edit}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setRemoving(a);
                    }}
                    className="btn btn-ghost min-h-10 px-4 text-sm"
                    aria-label={fmt(t.deleteLabel, { label })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {t.delete}
                  </button>
                  {a.isDefault ? null : <MakeDefault id={a.id} onDone={() => setNotice(t.defaultSet)} />}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card flex flex-col items-center gap-3 px-5 py-12 text-center">
          <MapPinPlus className="h-10 w-10 text-primary" aria-hidden />
          <p className="text-lg font-semibold">{t.empty}</p>
          <p className="text-muted">{t.emptyHint}</p>
        </div>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.mode === "edit" ? t.editTitle : t.newTitle}>
        {editing ? (
          <AddressForm
            key={formKey}
            address={editing.mode === "edit" ? editing.address : null}
            onSaved={() => {
              setEditing(null);
              setNotice(t.saved);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t.deleteTitle}
        description={removing ? fmt(t.deleteText, { label: removing.label || t.untitled }) : undefined}
        size="sm"
        footer={
          removing ? (
            <DeleteAddress
              id={removing.id}
              onCancel={() => setRemoving(null)}
              onDone={() => {
                setRemoving(null);
                setNotice(t.removed);
              }}
            />
          ) : null
        }
      />
    </div>
  );
}

function MakeDefault({ id, onDone }: { id: number; onDone: () => void }) {
  const lang = useLang();
  const t = useDict().account.addressBook;
  const [, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await setDefaultAddressAction(prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  return (
    <form action={action}>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton pending={pending} variant="outline" className="min-h-10 px-4 text-sm" icon={<Star className="h-4 w-4" aria-hidden />}>
        {t.makeDefault}
      </SubmitButton>
    </form>
  );
}

function DeleteAddress({ id, onCancel, onDone }: { id: number; onCancel: () => void; onDone: () => void }) {
  const lang = useLang();
  const t = useDict().account.addressBook;
  const err = useErrorText();
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await deleteAddressAction(prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="id" value={id} />
      {state?.error ? <FormAlert>{err(state.error)}</FormAlert> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn btn-ghost" data-autofocus>
          {t.cancel}
        </button>
        <SubmitButton pending={pending} variant="danger" icon={<Trash2 className="h-5 w-5" aria-hidden />}>
          {t.deleteConfirm}
        </SubmitButton>
      </div>
    </form>
  );
}

function AddressForm({ address, onSaved, onCancel }: { address: SavedAddress | null; onSaved: () => void; onCancel: () => void }) {
  const lang = useLang();
  const d = useDict();
  const t = d.account.addressBook;
  const err = useErrorText();
  const selectId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await saveAddressAction(prev, fd);
    if (r?.ok) onSaved();
    return r;
  }, null);
  useFocusOnError(form, state);
  const v = state?.values;
  const f = state?.fields ?? {};
  const [method, setMethod] = useState<DeliveryKey>((v?.method as DeliveryKey) || address?.method || "econt-office");
  const office = DELIVERY_METHODS[method]?.kind === "office";

  return (
    <form ref={form} action={action} noValidate className="space-y-4 pb-1">
      <input type="hidden" name="lang" value={lang} />
      {address ? <input type="hidden" name="id" value={address.id} /> : null}
      <TextField
        name="label"
        label={t.label}
        optional
        placeholder={t.labelPlaceholder}
        maxLength={60}
        defaultValue={v?.label ?? address?.label ?? ""}
        error={err(f.label)}
        data-autofocus
      />
      <div>
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-bold">
          {t.method}
        </label>
        <select
          id={selectId}
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as DeliveryKey)}
          className="field"
          aria-invalid={f.method ? true : undefined}
          aria-describedby={f.method ? `${selectId}-error` : undefined}
        >
          {DELIVERY_KEYS.map((k) => (
            <option key={k} value={k}>
              {d.checkout.methods[k].label}
            </option>
          ))}
        </select>
        {f.method ? (
          <p id={`${selectId}-error`} className="mt-1.5 text-sm font-semibold text-sale">
            {err(f.method)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <TextField
          name="city"
          label={t.city}
          autoComplete="address-level2"
          maxLength={80}
          defaultValue={v?.city ?? address?.cityName ?? ""}
          error={err(f.city)}
        />
        <TextField
          name="postCode"
          label={t.postCode}
          optional
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={4}
          defaultValue={v?.postCode ?? address?.postCode ?? ""}
          error={err(f.postCode)}
        />
      </div>
      <TextField
        name="address"
        label={office ? t.officeAddress : t.streetAddress}
        hint={office ? t.officeHint : t.streetHint}
        autoComplete={office ? "off" : "street-address"}
        maxLength={200}
        defaultValue={v?.address ?? address?.address ?? ""}
        error={err(f.address)}
      />
      <TextField
        name="phone"
        type="tel"
        label={t.phone}
        optional
        autoComplete="tel"
        inputMode="tel"
        maxLength={30}
        defaultValue={v?.phone ?? address?.phone ?? ""}
        error={err(f.phone)}
      />
      {address?.isDefault ? null : (
        <Checkbox name="isDefault" defaultChecked={v ? v.isDefault === "on" : false}>
          {t.makeDefaultCheck}
        </Checkbox>
      )}
      {address?.isDefault ? <input type="hidden" name="isDefault" value="on" /> : null}
      {state?.error ? <FormAlert>{err(state.error, state.vars)}</FormAlert> : null}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          {t.cancel}
        </button>
        <SubmitButton pending={pending}>{t.save}</SubmitButton>
      </div>
    </form>
  );
}
