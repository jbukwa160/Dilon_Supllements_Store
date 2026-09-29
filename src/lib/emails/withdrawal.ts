import "server-only";
import { site } from "@/config/site";
import type { Lang } from "@/i18n/config";
import { formatDate, formatPrice } from "../format";
import { escapeHtml } from "../html";
import { loc } from "../l10n";
import { sendMail, shopNotifyEmail } from "../mail";
import type { Order } from "../orders";
import { getSettings } from "../settings";
import { sofiaDateTime, withdrawalRefund, type Withdrawal, type WithdrawalLine } from "../withdrawals";

// E-mails of the withdrawal function: the acknowledgement on a durable medium that the law requires (content of the
// statement + date and time of receipt, Europe/Sofia) in the customer's language, and a notification to the shop
// (Bulgarian, like the admin panel). Texts: legal-content.md C.6.3. [ЮРИСТ] wording of the acknowledgement.

const T = {
  bg: {
    subject: "Потвърждение за получен отказ от договор — поръчка № {no}",
    hello: "Здравейте, {name},",
    helloAnon: "Здравейте,",
    received: "потвърждаваме, че на {date} в {time} ч. (българско време) получихме вашето изявление за отказ от договор за поръчка № {no} (от {orderDate}).",
    contentTitle: "Съдържание на изявлението:",
    statement: "С настоящото уведомявам, че се отказвам от договора за покупка на следните стоки:",
    whole: "(цялата поръчка)",
    reason: "Посочена причина: {reason}",
    reference: "Номер на изявлението: {id}",
    nextTitle: "Какво следва:",
    ret: "Изпратете продуктите без неоправдано забавяне и не по-късно от 14 дни на адрес: {address}.",
    sealed: "Неразпечатаните продукти в оригиналната опаковка приемаме обратно. Разпечатаните след доставката запечатани продукти не подлежат на връщане.",
    refund: "Ще възстановим {amount} не по-късно от 14 дни от получаването на отказа. Можем да изчакаме, докато получим продуктите или доказателство, че сте ги изпратили.",
    cod: "Платихте с наложен платеж: моля, отговорете на този имейл с IBAN, по който да възстановим сумата.",
    gift: "Ако стойността на запазените продукти падне под прага за подарък, моля, върнете и подаръка неразпечатан.",
    questions: "Ако имате въпроси, просто отговорете на този имейл.",
    regards: "Поздрави,",
    team: "екипът на {store}",
    giftTag: "подарък",
  },
  en: {
    subject: "Acknowledgement of your withdrawal — order no. {no}",
    hello: "Hello {name},",
    helloAnon: "Hello,",
    received: "we confirm that on {date} at {time} (Bulgarian time) we received your statement withdrawing from the contract for order no. {no} of {orderDate}.",
    contentTitle: "Content of the statement:",
    statement: "I hereby give notice that I withdraw from my contract of sale of the following goods:",
    whole: "(the entire order)",
    reason: "Reason given: {reason}",
    reference: "Statement reference: {id}",
    nextTitle: "Next steps:",
    ret: "Send the items back without undue delay and no later than 14 days to: {address}.",
    sealed: "Unopened products in their original packaging can be returned. Sealed products opened after delivery cannot be returned.",
    refund: "We will refund {amount} no later than 14 days after receiving your withdrawal. We may wait until we receive the items or proof that you have sent them.",
    cod: "You paid cash on delivery: please reply to this e-mail with the IBAN for the refund.",
    gift: "If the value of the items you keep falls below a free-gift threshold, please return the gift unopened as well.",
    questions: "If you have any questions, just reply to this e-mail.",
    regards: "Kind regards,",
    team: "the {store} team",
    giftTag: "free gift",
  },
} satisfies Record<Lang, Record<string, string>>;

/** Quotation marks of the statement: „…“ in Bulgarian, “…” in English. */
const QUOTES = { bg: ["„", "“"], en: ["“", "”"] } as const;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

function lineText(l: WithdrawalLine, giftTag: string): string {
  return `${l.qty} × ${l.name}${l.variant ? ` (${l.variant})` : ""}${l.kind === "gift" ? ` — ${giftTag}` : ""}`;
}

/** Where returned goods are sent: Настройки → return address, else the correspondence address. */
export function returnAddress(lang: Lang): string {
  const s = getSettings();
  return loc(s.company.returnAddress, lang) || loc(s.address, lang);
}

/** Sends the acknowledgement (customer) and the notification (shop). Never throws; reports what was sent. */
export async function sendWithdrawalEmails(w: Withdrawal, order: Order): Promise<{ customer: boolean; shop: boolean }> {
  const s = getSettings();
  const lang = w.locale;
  const t = T[lang];
  const { date, time } = sofiaDateTime(w.createdAt, lang);
  const name = `${order.customer.firstName} ${order.customer.lastName}`.trim();
  const amount = formatPrice(withdrawalRefund(w, order), lang);
  const hasGift = order.items.some((l) => l.kind === "gift");
  const address = returnAddress(lang);
  const lines = w.items.map((l) => lineText(l, t.giftTag));
  // "…на следните стоки (цялата поръчка):" when the whole order is withdrawn.
  const [qo, qc] = QUOTES[lang];
  const statement = w.wholeOrder ? `${t.statement.replace(/:$/, "")} ${t.whole}:` : t.statement;
  const vars = { no: order.number, date, time, orderDate: formatDate(order.createdAt, lang), name, id: w.id, address, amount, store: s.name };

  const next = [fill(t.ret, vars), t.sealed, fill(t.refund, vars)];
  if (order.payment === "cod") next.push(t.cod);
  if (hasGift && !w.wholeOrder) next.push(t.gift);

  const text = [
    name ? fill(t.hello, vars) : t.helloAnon,
    "",
    fill(t.received, vars),
    "",
    t.contentTitle,
    `${qo}${statement}`,
    ...lines.map((l, i) => `  – ${l}${i === lines.length - 1 ? qc : ""}`),
    ...(w.reason ? [fill(t.reason, { reason: w.reason })] : []),
    fill(t.reference, vars),
    "",
    t.nextTitle,
    ...next.map((n) => `• ${n}`),
    "",
    t.questions,
    "",
    t.regards,
    fill(t.team, vars),
    `${s.email} · ${s.phone}`,
    site.url,
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f6f5f0;font-family:Arial,Helvetica,sans-serif;color:#0f1a17">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border:1px solid #e3e1d8;border-radius:16px;padding:24px">
<p style="margin:0 0 16px;font-size:13px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:#0a6b5e">${e(s.name)}</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${e(name ? fill(t.hello, vars) : t.helloAnon)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${e(fill(t.received, vars))}</p>
<div style="background:#f6f5f0;border-radius:12px;padding:16px;margin:0 0 16px">
<p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#5b6b66">${e(t.contentTitle)}</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6">${qo}${e(statement)}</p>
<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6">${lines.map((l, i) => `<li>${e(l)}${i === lines.length - 1 ? qc : ""}</li>`).join("")}</ul>
${w.reason ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#33413d">${e(fill(t.reason, { reason: w.reason }))}</p>` : ""}
<p style="margin:8px 0 0;font-size:13px;color:#5b6b66">${e(fill(t.reference, vars))}</p>
</div>
<p style="margin:0 0 8px;font-size:15px;font-weight:bold">${e(t.nextTitle)}</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6">${next.map((n) => `<li style="margin-bottom:6px">${e(n)}</li>`).join("")}</ul>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${e(t.questions)}</p>
<p style="margin:0;font-size:15px;line-height:1.6">${e(t.regards)}<br>${e(fill(t.team, vars))}</p>
</div>
<p style="margin:16px 0 0;text-align:center;font-size:12px;color:#5b6b66">${e(s.email)} · ${e(s.phone)} · <a href="${e(site.url)}" style="color:#0a6b5e">${e(site.url.replace(/^https?:\/\//, ""))}</a></p>
</div></body></html>`;

  const customer = await sendMail({ to: w.email, subject: fill(t.subject, vars), text, html, replyTo: s.email });

  // Shop notification (Bulgarian).
  const bg = T.bg;
  const bgTime = sofiaDateTime(w.createdAt, "bg");
  const shopLines = w.items.map((l) => lineText(l, bg.giftTag));
  const shopText = [
    `Получено изявление за отказ от договор чрез функцията „Откажете се от договора тук“.`,
    "",
    `Поръчка: № ${order.number} от ${formatDate(order.createdAt, "bg")}`,
    `Клиент: ${name || "—"} · ${order.email} · ${order.customer.phone || "—"}`,
    `Получено на: ${bgTime.date} в ${bgTime.time} ч.`,
    `Обхват: ${w.wholeOrder ? "цялата поръчка" : "част от поръчката"}`,
    "Продукти:",
    ...shopLines.map((l) => `  – ${l}`),
    `Причина: ${w.reason ?? "—"}`,
    `Сума за възстановяване (ориентировъчно): ${formatPrice(withdrawalRefund(w, order), "bg")}`,
    `Плащане: ${order.payment === "cod" ? "наложен платеж — клиентът трябва да изпрати IBAN" : "банков превод"}`,
    `Език на клиента: ${lang === "en" ? "английски" : "български"} · IP: ${w.ip ?? "—"} · № на изявлението: ${w.id}`,
    "",
    `Потвърждение до клиента: ${customer.ok ? "изпратено" : `НЕ Е ИЗПРАТЕНО (${customer.error})`}`,
    "",
    `Поръчката в админ панела: ${site.url}/admin/poruchki/${order.id}`,
  ].join("\n");
  const shop = await sendMail({
    to: shopNotifyEmail(),
    subject: `Отказ от договор — поръчка № ${order.number}`,
    text: shopText,
    replyTo: order.email,
  });

  return { customer: customer.ok, shop: shop.ok };
}
