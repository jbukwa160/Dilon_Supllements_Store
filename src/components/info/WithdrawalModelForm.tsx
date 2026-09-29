// The model withdrawal form (ЗЗП Приложение № 6 / Directive 2011/83/EU Annex I(B)), pre-addressed to the merchant
// from the settings, printable on its own (the print styles hide everything else on the page). Server component.
// [ЮРИСТ] Check the annex numbering after ДВ бр. 87/2026 (legal-content.md §A.4, §D item 1).
import type { Lang } from "@/i18n/config";
import type { LegalCtx } from "./legal-context";

// On paper only the form is left: everything that is not the form, inside it or containing it is hidden.
const PRINT_CSS =
  "@media print{@page{margin:14mm}" +
  "body *:not(#formular):not(#formular *):not(:has(#formular)){display:none!important}" +
  "html,body,*:has(#formular){background:#fff!important;padding:0!important;margin:0!important;max-width:none!important;border:0!important;box-shadow:none!important}" +
  "#formular{border:0!important;box-shadow:none!important;padding:0!important;margin:0!important;font-size:11pt;line-height:1.45}" +
  "#formular .h-7,#formular .min-h-7{height:1.5rem;min-height:1.5rem}}";

const TEXT = {
  bg: {
    annex: "Приложение № 6 към чл. 47, ал. 1, т. 8 и чл. 52, ал. 2 и 4 от Закона за защита на потребителите",
    title: "Стандартен формуляр за упражняване правото на отказ",
    sub: "(попълнете и изпратете настоящия формуляр единствено ако желаете да се откажете от договора)",
    to: "До:",
    email: "имейл",
    eik: "ЕИК",
    body: "С настоящото уведомявам/уведомяваме (*), че се отказвам/отказваме (*) от сключения от мен/нас (*) договор за покупка на следните стоки (*)/за предоставяне на следната услуга (*)",
    ordered: "Поръчано на (*)/получено на (*)",
    name: "Име на потребителя/ите",
    address: "Адрес на потребителя/ите",
    signature: "Подпис на потребителя/ите (само в случай, че настоящият формуляр е на хартия)",
    date: "Дата",
    strike: "(*) Ненужното се зачертава.",
    optional: "По желание (не е част от стандартния формуляр — помага ни да обработим отказа по-бързо):",
    orderNo: "Номер на поръчката",
    contact: "Телефон или имейл за връзка",
    iban: "IBAN за възстановяване на сумата (при плащане с наложен платеж)",
  },
  en: {
    annex: "Model withdrawal form (Annex I(B) to Directive 2011/83/EU; Annex 6 to the Bulgarian Consumer Protection Act)",
    title: "Model withdrawal form",
    sub: "(complete and return this form only if you wish to withdraw from the contract)",
    to: "To:",
    email: "e-mail",
    eik: "UIC",
    body: "I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract of sale of the following goods (*)/for the provision of the following service (*)",
    ordered: "Ordered on (*)/received on (*)",
    name: "Name of consumer(s)",
    address: "Address of consumer(s)",
    signature: "Signature of consumer(s) (only if this form is notified on paper)",
    date: "Date",
    strike: "(*) Delete as appropriate.",
    optional: "Optional (not part of the model form — helps us process your withdrawal faster):",
    orderNo: "Order number",
    contact: "Phone or e-mail",
    iban: "IBAN for the refund (if you paid cash on delivery)",
  },
} satisfies Record<Lang, Record<string, string>>;

function Blank({ label, value, lines = 1 }: { label: string; value?: string; lines?: number }) {
  // A pre-filled line (the merchant) is plain text; an empty one is a dotted line to write on.
  if (value)
    return (
      <p className="text-ink">
        — {label} <span className="font-semibold">{value}</span>
      </p>
    );
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="text-ink">— {label}</span>
        <span className="min-h-7 min-w-48 flex-1 border-b border-dotted border-ink-soft" />
      </div>
      {Array.from({ length: lines - 1 }, (_, i) => (
        <div key={i} className="mt-1 h-7 border-b border-dotted border-ink-soft" />
      ))}
    </div>
  );
}

export function WithdrawalModelForm({ ctx }: { ctx: LegalCtx }) {
  const t = TEXT[ctx.lang];
  const c = ctx.company;
  const trader = `${c.legalName}, ${t.eik} ${c.eik}, ${c.registeredAddress}, ${t.email}: ${ctx.store.email}`;
  return (
    <section id="formular" aria-labelledby="formular-title" className="card scroll-mt-20 border-2 border-dashed p-5 text-[0.95rem] leading-relaxed sm:p-6 md:p-8">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <p className="text-center text-xs font-semibold text-muted">{t.annex}</p>
      <h2 id="formular-title" className="mt-2 text-center text-lg font-bold text-ink md:text-xl">
        {t.title}
      </h2>
      <p className="text-center text-sm text-ink-soft">{t.sub}</p>
      <div className="mt-6 space-y-4">
        <Blank label={t.to} value={trader} />
        <div>
          <p className="text-ink">— {t.body}</p>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="mt-1 h-7 border-b border-dotted border-ink-soft" />
          ))}
        </div>
        <Blank label={t.ordered} />
        <Blank label={t.name} />
        <Blank label={t.address} lines={2} />
        <Blank label={t.signature} />
        <Blank label={t.date} />
        <p className="text-sm text-ink-soft">{t.strike}</p>
      </div>
      <div className="mt-8 space-y-4 border-t border-line pt-5">
        <p className="text-sm font-semibold text-ink">{t.optional}</p>
        <Blank label={t.orderNo} />
        <Blank label={t.contact} />
        <Blank label={t.iban} />
      </div>
    </section>
  );
}
