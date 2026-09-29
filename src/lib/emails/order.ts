import "server-only";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { site } from "@/config/site";
import { deliveryLabel, formatAmount, isDeliveryKey, isPaymentKey, lineName, lineVariant, paymentLabel, type OrderLine } from "@/lib/checkout";
import { formatDateTime, formatPrice } from "@/lib/format";
import { escapeHtml } from "@/lib/html";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import { sendMail, shopNotifyEmail, type MailMessage } from "@/lib/mail";
import type { Order } from "@/lib/orders";
import { DAY, subjectLimited } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import type { StoreSettings } from "@/lib/settings-types";

// Order e-mails: the confirmation to the customer (in the language the order was placed in) and the notification to
// the shop (Bulgarian, like the admin panel). Plain text + a simple HTML version with every value escaped.
// Sent by placeOrder after the response (next/server after()); sendMail never throws. Owner: D.

const url = (path: string, lang: Lang) => `${site.url}${localizeHref(path, lang)}`;

function lineText(l: OrderLine, lang: Lang): string {
  const variant = lineVariant(l, lang);
  return `${lineName(l, lang)}${variant ? ` (${variant})` : ""}`;
}

function deliveryLines(order: Order, lang: Lang): string[] {
  const d = order.delivery;
  const label = isDeliveryKey(d.method) ? deliveryLabel(d.method, lang) : d.label;
  const place = [d.address, [d.postCode, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [label, place].filter(Boolean);
}

function hasBank(s: StoreSettings): boolean {
  return !!s.bank.iban.trim();
}

function bankRows(order: Order, lang: Lang, s: StoreSettings): [string, string][] {
  const t = getDict(lang).order;
  return (
    [
      [t.bankHolder, s.bank.holder || loc(s.company.legalName, lang)],
      [t.bankIban, s.bank.iban],
      [t.bankBic, s.bank.bic],
      [t.bankName, s.bank.bank],
      [t.bankAmount, formatPrice(order.total, lang)],
      [t.bankReason, fmt(t.bankReasonValue, { number: order.number })],
    ] as [string, string][]
  ).filter(([, v]) => v.trim());
}

/** The customer's confirmation e-mail. */
export function customerOrderEmail(order: Order): MailMessage {
  const lang = order.locale;
  const s = getSettings();
  const t = getDict(lang).order;
  const e = t.email;
  const total = formatPrice(order.total, lang);
  const paid = order.items.filter((l) => l.kind !== "gift");
  const gifts = order.items.filter((l) => l.kind === "gift");
  const giftTier = (l: OrderLine) => (l.tierThreshold ? fmt(t.giftTier, { amount: formatAmount(l.tierThreshold, lang) }) : t.gift);
  const payment = isPaymentKey(order.payment) ? paymentLabel(order.payment, lang) : order.payment;
  const bank = order.payment === "bank";
  const days = Math.max(14, s.returnDays);
  const shippingText = order.shipping > 0 ? formatPrice(order.shipping, lang) : t.free;
  // The withdrawal function with this order pre-selected.
  const withdrawal = url(`/otkaz-ot-dogovor?order=${order.number}`, lang);

  const text = [
    fmt(e.greeting, { name: order.customer.firstName }),
    "",
    fmt(e.intro, { shop: s.name }),
    "",
    fmt(e.orderNo, { number: order.number }),
    fmt(e.placed, { date: formatDateTime(order.createdAt, lang) }),
    "",
    `${e.itemsTitle}:`,
    ...paid.map((l) => `- ${lineText(l, lang)} × ${l.qty} — ${formatPrice(l.total, lang)}`),
    ...(gifts.length ? ["", `${e.giftsTitle}:`, ...gifts.map((l) => `- ${fmt(e.giftLine, { name: lineText(l, lang), tier: giftTier(l) })} — ${formatPrice(0, lang)}`)] : []),
    "",
    `${t.subtotal}: ${formatPrice(order.subtotal, lang)}`,
    `${t.shipping}: ${shippingText}`,
    `${t.total} (${t.inclVat}): ${total}`,
    "",
    `${e.deliveryTitle}:`,
    ...deliveryLines(order, lang),
    "",
    `${e.paymentTitle}: ${payment}`,
    ...(bank
      ? hasBank(s)
        ? [fmt(e.bankIntro, { total }), ...bankRows(order, lang, s).map(([k, v]) => `${k}: ${v}`), e.bankNote]
        : [t.bankMissing]
      : [fmt(e.codNote, { total })]),
    "",
    `${e.withdrawalTitle}:`,
    fmt(e.withdrawal, { days }),
    fmt(e.withdrawalOnline, { url: withdrawal }),
    e.sealed,
    fmt(e.terms, { url: url("/obshti-usloviya", lang) }),
    fmt(e.view, { url: url(`/porachka/${order.id}`, lang) }),
    "",
    fmt(e.questions, { email: s.email, phone: s.phone }),
    fmt(e.signature, { shop: s.name }),
  ].join("\n");

  const h = escapeHtml;
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;color:#5b6b66">${h(label)}</td><td style="padding:4px 0;text-align:right;${strong ? "font-weight:700;font-size:17px" : ""}">${h(value)}</td></tr>`;
  const itemRow = (l: OrderLine, price: string, note = "") =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #e3e1d8">${h(lineText(l, lang))}${note ? `<br><span style="color:#18803f;font-size:13px">${h(note)}</span>` : ""}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #e3e1d8;text-align:center;white-space:nowrap">× ${l.qty}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #e3e1d8;text-align:right;white-space:nowrap">${h(price)}</td></tr>`;
  const link = (href: string, label: string) => `<a href="${h(href)}" style="color:#0a6b5e">${h(label)}</a>`;
  const bankHtml = bank
    ? hasBank(s)
      ? `<p>${h(fmt(e.bankIntro, { total }))}</p><table style="border-collapse:collapse">${bankRows(order, lang, s)
          .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#5b6b66">${h(k)}</td><td style="padding:2px 0;font-weight:700">${h(v)}</td></tr>`)
          .join("")}</table><p>${h(e.bankNote)}</p>`
      : `<p>${h(t.bankMissing)}</p>`
    : `<p>${h(fmt(e.codNote, { total }))}</p>`;

  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f6f5f0;font-family:Arial,Helvetica,sans-serif;color:#0f1a17">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border:1px solid #e3e1d8;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0a6b5e;font-weight:700">${h(s.name)}</p>
<h1 style="margin:0 0 12px;font-size:22px">${h(fmt(t.accepted, { number: order.number }))}</h1>
<p>${h(fmt(e.greeting, { name: order.customer.firstName }))}</p>
<p>${h(fmt(e.intro, { shop: s.name }))}</p>
<p style="color:#5b6b66;font-size:14px">${h(fmt(e.placed, { date: formatDateTime(order.createdAt, lang) }))}</p>
<table style="width:100%;border-collapse:collapse;margin-top:12px">
${paid.map((l) => itemRow(l, formatPrice(l.total, lang))).join("\n")}
${gifts.map((l) => itemRow(l, formatPrice(0, lang), `${t.gift} · ${giftTier(l)}`)).join("\n")}
</table>
<table style="width:100%;border-collapse:collapse;margin-top:12px">
${row(t.subtotal, formatPrice(order.subtotal, lang))}
${row(t.shipping, shippingText)}
${row(`${t.total} (${t.inclVat})`, total, true)}
</table>
<h2 style="font-size:16px;margin:20px 0 6px">${h(e.deliveryTitle)}</h2>
<p style="margin:0">${deliveryLines(order, lang).map(h).join("<br>")}</p>
<h2 style="font-size:16px;margin:20px 0 6px">${h(e.paymentTitle)}: ${h(payment)}</h2>
${bankHtml}
<p style="margin-top:20px">${link(url(`/porachka/${order.id}`, lang), e.viewLink)}</p>
</div>
<div style="padding:16px 8px;font-size:13px;color:#5b6b66;line-height:1.5">
<p><strong>${h(e.withdrawalTitle)}.</strong> ${h(fmt(e.withdrawal, { days }))} ${link(withdrawal, e.withdrawalLink)}</p>
<p>${h(e.sealed)}</p>
<p>${link(url("/obshti-usloviya", lang), e.termsLink)}</p>
<p>${h(fmt(e.questions, { email: s.email, phone: s.phone }))}<br>${h(fmt(e.signature, { shop: s.name }))}</p>
</div></div></body></html>`;

  return { to: order.email, subject: fmt(e.subject, { number: order.number, shop: s.name }), text, html, replyTo: s.email };
}

/** The shop's notification (Bulgarian). */
export function shopOrderEmail(order: Order): MailMessage {
  const lang: Lang = "bg";
  const t = getDict(lang).order;
  const e = t.email;
  const c = order.customer;
  const d = order.delivery;
  const payment = isPaymentKey(order.payment) ? paymentLabel(order.payment, lang) : order.payment;
  const lines = [
    e.shopIntro,
    "",
    fmt(e.orderNo, { number: order.number }),
    fmt(e.placed, { date: formatDateTime(order.createdAt, lang) }),
    "",
    `${e.shopCustomer}: ${c.firstName} ${c.lastName} (${order.customerId ? fmt(e.shopRegistered, { id: order.customerId }) : e.shopGuest})`,
    `${getDict(lang).checkout.phone}: ${c.phone}`,
    `${getDict(lang).checkout.email}: ${order.email}`,
    "",
    `${e.itemsTitle}:`,
    ...order.items.map((l) =>
      l.kind === "gift"
        ? `- [${t.gift} ${l.tierThreshold ? fmt(t.giftTier, { amount: formatAmount(l.tierThreshold, lang) }) : ""}] ${lineText(l, lang)} · ${l.sku} × 1 — ${formatPrice(0, lang)}`
        : `- ${lineText(l, lang)} · ${l.sku} × ${l.qty} — ${formatPrice(l.total, lang)}`,
    ),
    "",
    `${t.subtotal}: ${formatPrice(order.subtotal, lang)}`,
    `${t.shipping}: ${order.shipping > 0 ? formatPrice(order.shipping, lang) : t.free}`,
    `${t.total}: ${formatPrice(order.total, lang)}`,
    "",
    `${e.deliveryTitle}: ${d.label}`,
    ...deliveryLines(order, lang).slice(1),
    ...(d.officeId ? [fmt(e.office, { code: d.officeId })] : []),
    `${e.paymentTitle}: ${payment}`,
    ...(order.note ? ["", `${t.note}: ${order.note}`] : []),
    "",
    fmt(e.shopOpen, { url: `${site.url}/admin/poruchki/${order.id}` }),
  ];
  return {
    to: shopNotifyEmail(),
    subject: fmt(e.shopSubject, { number: order.number, total: formatPrice(order.total, lang) }),
    text: lines.join("\n"),
    replyTo: order.email,
  };
}

/** Order confirmations one address may receive per day: guest checkout accepts any e-mail address, so this stops a
 * stranger from flooding someone's mailbox with orders placed in their name (the shop is still notified of each). */
const CONFIRMATIONS_PER_ADDRESS_PER_DAY = 10;

/** Sends both e-mails; failures are logged by sendMail and never thrown. */
export async function sendOrderEmails(order: Order): Promise<void> {
  const toCustomer = !subjectLimited("order-mail", order.email, CONFIRMATIONS_PER_ADDRESS_PER_DAY, DAY);
  if (!toCustomer) console.warn(`[mail] order №${order.number}: no confirmation to the customer (daily limit for that address reached)`);
  await Promise.all([toCustomer ? sendMail(customerOrderEmail(order)) : null, sendMail(shopOrderEmail(order))]);
}
