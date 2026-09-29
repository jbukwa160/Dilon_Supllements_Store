"use server";

// Server Actions of the account area (/profil/…): personal details, e-mail, password, marketing consent, devices,
// account deletion and the address book. Every action starts with requireCustomer() (render-time checks are not a
// security boundary) and only touches the signed-in customer's own rows. The page language comes in a hidden
// "lang" field.
import { after } from "next/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_LANG, isLang, type Lang } from "@/i18n/config";
import { changeCustomerPassword, customerPasswordProblem, logoutCustomer, requireCustomer } from "@/lib/customer-auth";
import {
  changeCustomerEmail,
  checkName,
  checkPhone,
  deleteCustomerAccount,
  endAllCustomerSessions,
  setCustomerMarketing,
  updateCustomerProfile,
  verifyCustomerPassword,
} from "@/lib/customer-account";
import { MAX_ADDRESSES, deleteCustomerAddress, saveCustomerAddress, setDefaultCustomerAddress } from "@/lib/customer-addresses";
import { DELIVERY_METHODS, isDeliveryKey } from "@/lib/checkout";
import { sendAccountDeletedEmail, sendEmailChangedEmail, sendPasswordChangedEmail } from "@/lib/emails/account";
import { localizeHref } from "@/lib/links";
import { rateLimited } from "@/lib/rate-limit";
import type { AccountError, FormState } from "@/components/account/form-state";

const PASSWORD_MAX = 200;

function langOf(fd: FormData): Lang {
  const v = fd.get("lang");
  return isLang(v) ? v : DEFAULT_LANG;
}

const str = (fd: FormData, name: string, max = 200) =>
  String(fd.get(name) ?? "")
    .trim()
    .slice(0, max);

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/danni");
  const values = { firstName: str(fd, "firstName", 80), lastName: str(fd, "lastName", 80), phone: str(fd, "phone", 30) };
  const first = checkName(fd.get("firstName"));
  const last = checkName(fd.get("lastName"));
  const phone = checkPhone(fd.get("phone"));
  if ("error" in first || "error" in last || "error" in phone) {
    return {
      fields: {
        ...("error" in first ? { firstName: first.error } : {}),
        ...("error" in last ? { lastName: last.error } : {}),
        ...("error" in phone ? { phone: phone.error } : {}),
      },
      values,
    };
  }
  updateCustomerProfile(c.id, { firstName: first.value, lastName: last.value, phone: phone.value });
  refresh();
  return { ok: true };
}

export async function changeEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/danni");
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "").slice(0, PASSWORD_MAX);
  const values = { email };
  const fields: Partial<Record<string, AccountError>> = {};
  if (!email) fields.email = "required";
  if (!password) fields.password = "required";
  if (Object.keys(fields).length) return { fields, values };
  if (await rateLimited("account-email", 10, 60 * 60 * 1000)) return { error: "rate_limited", values };
  const r = changeCustomerEmail(c.id, password, email);
  if (!r.ok) {
    if (r.code === "wrong_password") return { fields: { password: "wrong_password" }, values };
    return { fields: { email: r.code }, values };
  }
  const to = { email: r.oldEmail, firstName: c.firstName };
  after(() => sendEmailChangedEmail(to, r.email, lang));
  refresh();
  return { ok: true, values: { email: r.email } };
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/danni");
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const repeat = String(fd.get("repeat") ?? "");
  const fields: Partial<Record<string, AccountError>> = {};
  if (!current) fields.current = "required";
  if (!next) fields.password = "required";
  else if (next.length > PASSWORD_MAX) fields.password = "too_long";
  else {
    const problem = customerPasswordProblem(next);
    if (problem) fields.password = problem;
  }
  if (!fields.password && next !== repeat) fields.repeat = repeat ? "password_mismatch" : "required";
  if (Object.keys(fields).length) return { fields };
  if (await rateLimited("account-password", 10, 60 * 60 * 1000)) return { error: "rate_limited" };
  const r = await changeCustomerPassword(c.id, current, next);
  if (!r.ok) return { fields: r.code === "wrong_password" ? { current: "wrong_password" } : { password: r.code } };
  const to = { email: c.email, firstName: c.firstName };
  after(() => sendPasswordChangedEmail(to, lang));
  refresh();
  return { ok: true };
}

export async function marketingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/danni");
  const on = fd.get("marketing") === "on";
  setCustomerMarketing(c.id, on, lang);
  refresh();
  return { ok: true, values: { marketing: on ? "on" : "" } };
}

/** Signs this customer out on every device, this one included. */
export async function logoutEverywhereAction(fd: FormData): Promise<void> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/danni");
  endAllCustomerSessions(c.id);
  await logoutCustomer();
  redirect(localizeHref("/vhod?msg=everywhere", lang));
}

/** GDPR self-service deletion; the current password is required. */
export async function deleteAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/danni");
  const password = String(fd.get("password") ?? "").slice(0, PASSWORD_MAX);
  if (!password) return { fields: { password: "required" } };
  if (await rateLimited("account-delete", 10, 60 * 60 * 1000)) return { error: "rate_limited" };
  if (!verifyCustomerPassword(c.id, password)) return { fields: { password: "wrong_password" } };
  const deleted = deleteCustomerAccount(c.id);
  await logoutCustomer();
  if (deleted) {
    const to = { email: deleted.email, firstName: deleted.firstName };
    after(() => sendAccountDeletedEmail(to, lang));
  }
  redirect(localizeHref("/vhod?msg=deleted", lang));
}

// ---- Address book --------------------------------------------------------------------------------------------

export async function saveAddressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/adresi");
  const id = Number(fd.get("id")) || undefined;
  const values = {
    label: str(fd, "label", 60),
    method: str(fd, "method", 30),
    city: str(fd, "city", 80),
    postCode: str(fd, "postCode", 12),
    address: str(fd, "address", 200),
    phone: str(fd, "phone", 30),
    isDefault: fd.get("isDefault") === "on" ? "on" : "",
  };
  const fields: Partial<Record<string, AccountError>> = {};
  if (!isDeliveryKey(values.method)) fields.method = "method_invalid";
  if (!values.city) fields.city = "required";
  if (values.postCode && !/^\d{4}$/.test(values.postCode)) fields.postCode = "postcode_invalid";
  if (!values.address) fields.address = "required";
  const phone = checkPhone(fd.get("phone"));
  if ("error" in phone) fields.phone = phone.error;
  if (Object.keys(fields).length || !isDeliveryKey(values.method)) return { fields, values };

  const r = saveCustomerAddress(
    c.id,
    {
      label: values.label,
      method: values.method,
      city: { id: "", courier: DELIVERY_METHODS[values.method].courier, name: values.city, region: "", postCode: values.postCode },
      office: null,
      address: values.address,
      phone: values.phone,
      isDefault: values.isDefault === "on",
    },
    id,
  );
  if (!r.ok) {
    if (r.code === "method_invalid") return { fields: { method: "method_invalid" }, values };
    return { error: r.code === "too_many" ? "too_many" : "not_found", vars: { n: MAX_ADDRESSES }, values };
  }
  refresh();
  return { ok: true };
}

export async function deleteAddressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/adresi");
  const ok = deleteCustomerAddress(c.id, Number(fd.get("id")) || 0);
  refresh();
  return ok ? { ok: true } : { error: "not_found" };
}

export async function setDefaultAddressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const c = await requireCustomer(lang, "/profil/adresi");
  const ok = setDefaultCustomerAddress(c.id, Number(fd.get("id")) || 0);
  refresh();
  return ok ? { ok: true } : { error: "not_found" };
}
