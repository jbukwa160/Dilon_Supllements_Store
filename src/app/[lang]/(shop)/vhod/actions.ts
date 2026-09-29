"use server";

// Sign-in, registration, forgotten password, new password and sign-out (Server Actions of /vhod, /registratsia,
// /zabravena-parola, /nova-parola and the header account menu). Every form sends its page language in a hidden
// "lang" field (next/root-params does not work in actions). Next checks the Origin of every action (CSRF).
import { after } from "next/server";
import { redirect } from "next/navigation";
import { DEFAULT_LANG, isLang, type Lang } from "@/i18n/config";
import {
  EMAIL_RE,
  createPasswordResetToken,
  customerPasswordProblem,
  getCustomer,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  resetPasswordWithToken,
} from "@/lib/customer-auth";
import { checkEmail, checkName, checkPhone, normEmail, resetRecentlyRequested, setCustomerMarketing } from "@/lib/customer-account";
import { sendPasswordChangedEmail, sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/emails/account";
import { localizeHref, safeNextPath, stripLang } from "@/lib/links";
import { rateLimited } from "@/lib/rate-limit";
import { ACCOUNT_PATH, AUTH_PATHS, type AccountError, type FormState } from "@/components/account/form-state";

const PASSWORD_MAX = 200;

function langOf(fd: FormData): Lang {
  const v = fd.get("lang");
  return isLang(v) ? v : DEFAULT_LANG;
}

/** Where to go after signing in: a local path from the form, never back to a sign-in page. */
function nextOf(fd: FormData, fallback: string): string {
  const next = safeNextPath(String(fd.get("next") ?? ""), "");
  if (!next) return fallback;
  const path = stripLang(next.split(/[?#]/)[0]).path;
  return AUTH_PATHS.includes(path) ? fallback : next;
}

const str = (fd: FormData, name: string, max = 200) =>
  String(fd.get(name) ?? "")
    .trim()
    .slice(0, max);

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "").slice(0, PASSWORD_MAX);
  const remember = fd.get("remember") === "on";
  const values = { email, remember: remember ? "on" : "" };

  const fields: Partial<Record<string, AccountError>> = {};
  if (!email) fields.email = "required";
  else if (!EMAIL_RE.test(normEmail(email))) fields.email = "email_invalid";
  if (!password) fields.password = "required";
  if (Object.keys(fields).length) return { fields, values };

  // Lockout per e-mail is in loginCustomer(); this caps one IP trying many different e-mails.
  if (await rateLimited("login", 30, 10 * 60 * 1000)) return { error: "rate_limited", values };
  const r = await loginCustomer(email, password, remember);
  if (!r.ok) {
    if (r.code === "locked") return r.minutes ? { error: "locked", vars: { minutes: r.minutes }, values } : { error: "blocked", values };
    return { error: "invalid", values };
  }
  redirect(localizeHref(nextOf(fd, "/profil"), lang));
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const values = {
    firstName: str(fd, "firstName", 80),
    lastName: str(fd, "lastName", 80),
    email: str(fd, "email"),
    phone: str(fd, "phone", 30),
    marketing: fd.get("marketing") === "on" ? "on" : "",
    terms: fd.get("terms") === "on" ? "on" : "",
  };
  const password = String(fd.get("password") ?? "");

  const fields: Partial<Record<string, AccountError>> = {};
  const first = checkName(fd.get("firstName"));
  const last = checkName(fd.get("lastName"));
  const email = checkEmail(fd.get("email"));
  const phone = checkPhone(fd.get("phone"));
  if ("error" in first) fields.firstName = first.error;
  if ("error" in last) fields.lastName = last.error;
  if ("error" in email) fields.email = email.error;
  if ("error" in phone) fields.phone = phone.error;
  if (!password) fields.password = "required";
  else if (password.length > PASSWORD_MAX) fields.password = "too_long";
  else {
    const problem = customerPasswordProblem(password);
    if (problem) fields.password = problem;
  }
  if (!values.terms) fields.terms = "terms_required";
  if (Object.keys(fields).length || "error" in first || "error" in last || "error" in email || "error" in phone) return { fields, values };

  const r = await registerCustomer({
    email: email.value,
    password,
    firstName: first.value,
    lastName: last.value,
    phone: phone.value,
    locale: lang,
    marketing: values.marketing === "on",
  });
  if (!r.ok) {
    if (r.code === "email_taken") return { fields: { email: "email_taken" }, values };
    if (r.code === "weak_password") return { fields: { password: "weak_password" }, values };
    if (r.code === "rate_limited") return { error: "rate_limited", values };
    return { error: "generic", values };
  }
  // Also put the address on the newsletter list (the consent time is already on the customer).
  if (r.customer.marketing) setCustomerMarketing(r.customer.id, true, lang);
  const c = r.customer;
  after(() => sendWelcomeEmail({ email: c.email, firstName: c.firstName, marketing: c.marketing }, lang));
  redirect(localizeHref(nextOf(fd, "/profil?welcome=1"), lang));
}

/** Always answers the same way whether or not the e-mail has an account (no account enumeration). */
export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const values = { email: str(fd, "email") };
  const email = checkEmail(fd.get("email"));
  if ("error" in email) return { fields: { email: email.error }, values };
  if (await rateLimited("reset", 5, 60 * 60 * 1000)) return { error: "rate_limited", values };
  // One e-mail per account every 2 minutes, whoever asks (stops mailbox flooding from many IPs).
  if (!resetRecentlyRequested(email.value)) {
    const r = createPasswordResetToken(email.value);
    if (r) {
      const to = { email: r.customer.email, firstName: r.customer.firstName };
      // After the response: the answer takes the same time whether or not a message is sent.
      after(() => sendPasswordResetEmail(to, r.token, lang));
    }
  }
  return { ok: true, values };
}

/** Sets the new password from the e-mailed link, signs out every device and signs this browser in. */
export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const token = String(fd.get("token") ?? "").slice(0, 120);
  const password = String(fd.get("password") ?? "");
  const repeat = String(fd.get("repeat") ?? "");

  const fields: Partial<Record<string, AccountError>> = {};
  if (!password) fields.password = "required";
  else if (password.length > PASSWORD_MAX) fields.password = "too_long";
  else {
    const problem = customerPasswordProblem(password);
    if (problem) fields.password = problem;
  }
  if (!fields.password && password !== repeat) fields.repeat = repeat ? "password_mismatch" : "required";
  if (Object.keys(fields).length) return { fields };
  if (await rateLimited("reset-set", 10, 10 * 60 * 1000)) return { error: "rate_limited" };

  const r = resetPasswordWithToken(token, password);
  if (!r.ok) {
    if (r.code === "too_short" || r.code === "needs_letter_digit") return { fields: { password: r.code } };
    return { error: r.code === "expired" ? "expired" : "invalid_link" };
  }
  const to = { email: r.customer.email, firstName: r.customer.firstName };
  after(() => sendPasswordChangedEmail(to, lang));
  const signedIn = await loginCustomer(r.customer.email, password, false);
  redirect(localizeHref(signedIn.ok ? "/profil?reset=1" : "/vhod?msg=reset", lang));
}

/**
 * Sign out (a form POST, never a GET link). Stays on the current page (`next`) unless it is an account page,
 * which would only send the visitor to the sign-in form.
 */
export async function logoutAction(fd: FormData): Promise<void> {
  const lang = langOf(fd);
  const wasSignedIn = !!(await getCustomer());
  await logoutCustomer();
  const next = safeNextPath(String(fd.get("next") ?? ""), "");
  const path = next ? stripLang(next.split(/[?#]/)[0]).path : "";
  if (!next || ACCOUNT_PATH.test(path) || AUTH_PATHS.includes(path)) redirect(localizeHref(wasSignedIn ? "/vhod?msg=signedout" : "/vhod", lang));
  redirect(localizeHref(next, lang));
}
