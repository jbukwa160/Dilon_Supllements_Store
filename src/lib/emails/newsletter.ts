import "server-only";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { escapeHtml } from "@/lib/html";
import { localizeHref } from "@/lib/links";
import { sendMail, type MailResult } from "@/lib/mail";
import { absoluteUrl } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

// The newsletter confirmation e-mail (double opt-in, lib/newsletter.ts). The link is absolute (NEXT_PUBLIC_SITE_URL),
// never built from the request's Host header. Owner: S.

const COLORS = { canvas: "#f6f5f0", surface: "#ffffff", ink: "#0f1a17", muted: "#5b6b66", line: "#e3e1d8", primary: "#0a6b5e" };

/** Sends the "confirm your subscription" e-mail with the link to /byuletin?t=…. Never throws. */
export function sendNewsletterConfirmation(email: string, lang: Lang, token: string): Promise<MailResult> {
  const t = getDict(lang).newsletter.mail;
  const store = getSettings().name;
  const href = absoluteUrl(localizeHref(`/byuletin?t=${encodeURIComponent(token)}`, lang));
  const subject = fmt(t.subject, { store });
  const intro = fmt(t.intro, { email, store });
  const signature = fmt(t.signature, { store });
  const text = [t.greeting, intro, `${t.button}: ${href}`, t.ignore, signature].join("\n\n");
  const p = (s: string, style = "") => `<p style="margin:0 0 16px;${style}">${escapeHtml(s).replace(/\n/g, "<br>")}</p>`;
  const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.canvas};color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:16px">
<tr><td style="padding:24px 28px 4px;font-size:18px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${COLORS.primary}">${escapeHtml(store)}</td></tr>
<tr><td style="padding:12px 28px 12px">
${p(t.greeting, "font-weight:700")}
${p(intro)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:999px;background:${COLORS.primary}">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;border-radius:999px;color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(t.button)}</a>
</td></tr></table>
${p(`${t.fallback}\n${href}`, `font-size:13px;color:${COLORS.muted};word-break:break-all`)}
${p(t.ignore, `font-size:14px;color:${COLORS.muted}`)}
${p(signature)}
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
  return sendMail({ to: email, subject, text, html });
}
