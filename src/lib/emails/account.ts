import "server-only";
import { site } from "@/config/site";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
import { localizeHref } from "@/lib/links";
import { sendMail, type MailResult } from "@/lib/mail";
import { absoluteUrl } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

// Account e-mails: welcome, password reset link, "your password / e-mail changed" notices, account deleted.
// Texts come from dict.account.mail (BG / EN, informal "ти"); every message has a plain-text and an HTML part and
// every inserted value is escaped. Links are absolute (NEXT_PUBLIC_SITE_URL) — never built from the request's Host
// header, so a forged Host cannot turn a reset e-mail into a phishing link. Owner: E.

type Recipient = { email: string; firstName: string };

type MailBody = {
  subject: string;
  paragraphs: string[];
  button?: { label: string; href: string };
  /** Small print after the button. */
  after?: string[];
};

const COLORS = { canvas: "#f6f5f0", surface: "#ffffff", ink: "#0f1a17", muted: "#5b6b66", line: "#e3e1d8", primary: "#0a6b5e" };

/** Escaped text with http(s) links made clickable and line breaks kept. */
function richText(s: string): string {
  return escapeHtml(s)
    .replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g, (url) => `<a href="${url}" style="color:${COLORS.primary}">${url}</a>`)
    .replace(/\n/g, "<br>");
}

function compose(lang: Lang, to: Recipient, body: MailBody): { subject: string; text: string; html: string } {
  const t = getDict(lang).account.mail;
  const store = getSettings().name;
  const greeting = fmt(t.greeting, { name: to.firstName || to.email });
  const signature = fmt(t.signature, { store });
  const footer = fmt(t.footer, { store, url: site.url });

  const text = [
    greeting,
    ...body.paragraphs,
    ...(body.button ? [`${body.button.label}: ${body.button.href}`] : []),
    ...(body.after ?? []),
    signature,
    `-- \n${footer}`,
  ].join("\n\n");

  const p = (s: string, style = "") => `<p style="margin:0 0 16px;${style}">${richText(s)}</p>`;
  const button = body.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:999px;background:${COLORS.primary}">` +
      `<a href="${escapeHtml(body.button.href)}" style="display:inline-block;padding:13px 26px;border-radius:999px;color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(body.button.label)}</a>` +
      `</td></tr></table>` +
      p(`${t.buttonFallback}\n${body.button.href}`, `font-size:13px;color:${COLORS.muted};word-break:break-all`)
    : "";
  const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(body.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.canvas};color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:16px">
<tr><td style="padding:24px 28px 4px;font-size:18px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${COLORS.primary}">${escapeHtml(store)}</td></tr>
<tr><td style="padding:12px 28px 12px">
${p(greeting, "font-weight:700")}
${body.paragraphs.map((s) => p(s)).join("\n")}
${button}
${(body.after ?? []).map((s) => p(s, `font-size:14px;color:${COLORS.muted}`)).join("\n")}
${p(signature)}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:${COLORS.muted}">${richText(footer)}</p>
</td></tr></table>
</body>
</html>`;
  return { subject: body.subject, text, html };
}

function send(lang: Lang, to: Recipient, body: MailBody): Promise<MailResult> {
  return sendMail({ to: to.email, ...compose(lang, to, body) });
}

const link = (path: string, lang: Lang) => absoluteUrl(localizeHref(path, lang));

/** After registration. */
export function sendWelcomeEmail(to: Recipient & { marketing: boolean }, lang: Lang): Promise<MailResult> {
  const t = getDict(lang).account.mail.welcome;
  const store = getSettings().name;
  return send(lang, to, {
    subject: fmt(t.subject, { store }),
    paragraphs: [fmt(t.intro, { store }), t.body, ...(to.marketing ? [t.marketing] : [])],
    button: { label: t.button, href: link("/profil", lang) },
  });
}

/** The password reset link (valid 1 hour, single use). */
export function sendPasswordResetEmail(to: Recipient, token: string, lang: Lang): Promise<MailResult> {
  const t = getDict(lang).account.mail.reset;
  const store = getSettings().name;
  return send(lang, to, {
    subject: fmt(t.subject, { store }),
    paragraphs: [fmt(t.intro, { email: to.email })],
    button: { label: t.button, href: link(`/nova-parola?token=${encodeURIComponent(token)}`, lang) },
    after: [t.validity, t.ignore],
  });
}

/** Security notice after a password change or reset. */
export function sendPasswordChangedEmail(to: Recipient, lang: Lang): Promise<MailResult> {
  const t = getDict(lang).account.mail.passwordChanged;
  const s = getSettings();
  return send(lang, to, {
    subject: fmt(t.subject, { store: s.name }),
    paragraphs: [fmt(t.body, { date: formatDateTime(new Date(), lang) }), fmt(t.notYou, { link: link("/zabravena-parola", lang), email: s.email })],
  });
}

/** Security notice to the OLD address after the sign-in e-mail was changed. */
export function sendEmailChangedEmail(to: Recipient, newEmail: string, lang: Lang): Promise<MailResult> {
  const t = getDict(lang).account.mail.emailChanged;
  const s = getSettings();
  return send(lang, to, {
    subject: fmt(t.subject, { store: s.name }),
    paragraphs: [fmt(t.body, { old: to.email, new: newEmail, date: formatDateTime(new Date(), lang) }), fmt(t.notYou, { email: s.email })],
  });
}

/** Confirmation that the account was deleted. */
export function sendAccountDeletedEmail(to: Recipient, lang: Lang): Promise<MailResult> {
  const t = getDict(lang).account.mail.deleted;
  const store = getSettings().name;
  return send(lang, to, { subject: fmt(t.subject, { store }), paragraphs: [t.body, t.farewell] });
}
