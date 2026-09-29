// Building blocks of the legal / info texts (server-safe: no hooks, no server-only imports).
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, XCircle } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { LegalCtx } from "./legal-context";

/** One section of a legal page: its anchor (language-neutral, so "/obshti-usloviya#podaratsi" works in both languages), heading and body. */
export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** A legal / info text in one language (`before`: content shown above the sections, e.g. price cards). */
export type LegalDoc = { intro: React.ReactNode; before?: React.ReactNode; sections: LegalSection[] };

/** External link: new tab, marked for screen readers. */
export function Ext({ href, lang, children }: { href: string; lang: Lang; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-0.5">
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden />
      <span className="sr-only"> {getDict(lang).info.newTab}</span>
    </a>
  );
}

export function MailLink({ email }: { email: string }) {
  return <a href={`mailto:${email}`}>{email}</a>;
}

export function PhoneLink({ ctx }: { ctx: LegalCtx }) {
  return (
    <a href={ctx.store.phoneHref} className="whitespace-nowrap">
      {ctx.store.phone}
    </a>
  );
}

const CALLOUT = {
  info: { box: "border-info/25 bg-[#eef4fb]", icon: "text-info", Icon: Info },
  warning: { box: "border-warning/30 bg-[#fdf4e7]", icon: "text-warning", Icon: AlertTriangle },
  success: { box: "border-success/25 bg-[#e9f5ee]", icon: "text-success", Icon: CheckCircle2 },
} as const;

/** A highlighted note inside a legal text. */
export function Callout({ tone = "info", title, children, className }: { tone?: keyof typeof CALLOUT; title?: string; children: React.ReactNode; className?: string }) {
  const c = CALLOUT[tone];
  return (
    <div className={clsx("flex gap-3 rounded-md border p-4", c.box, className)}>
      <c.Icon className={clsx("mt-0.5 h-5 w-5 shrink-0", c.icon)} aria-hidden />
      <div className="min-w-0 space-y-1.5 [&_p]:mt-0! [&_p]:text-ink!">
        {title ? <p className="font-bold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * A data table that stays readable on a phone: a real <table> from `md`, stacked cards below it (each card lists
 * "column: value"). Only one of the two is displayed, so assistive technology reads it once.
 */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-4">
      <div className="hidden overflow-hidden rounded-md border border-line md:block">
        <table className="w-full border-collapse text-left text-[0.92rem] leading-relaxed">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-canvas">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="border-b border-line px-3.5 py-2.5 align-bottom font-bold text-ink">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-3.5 py-3 align-top font-semibold text-ink">
                      {cell}
                    </th>
                  ) : (
                    <td key={j} className="px-3.5 py-3 align-top text-ink-soft">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-none! space-y-3 pl-0! md:hidden" aria-label={caption}>
        {rows.map((r, i) => (
          <li key={i} className="list-none! rounded-md border border-line bg-canvas/60 p-4!">
            <p className="font-semibold text-ink">{r[0]}</p>
            <dl className="mt-2 space-y-1.5 text-[0.92rem]">
              {r.slice(1).map((cell, j) => (
                <div key={j}>
                  <dt className="text-xs font-bold uppercase tracking-[0.06em] text-muted">{head[j + 1]}</dt>
                  <dd className="text-ink-soft">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Merchant identification (ЗЕТ чл. 4, ал. 1; legal-content.md C.1): legal name, EIK, VAT no., addresses, contacts,
 * the BFSA distance-selling registration and the supervisory authorities. All values come from Настройки.
 */
export function MerchantBlock({ ctx }: { ctx: LegalCtx }) {
  const t = getDict(ctx.lang).info.merchant;
  const c = ctx.company;
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t.registered, value: c.registeredAddress },
    { label: t.correspondence, value: ctx.store.address },
    { label: t.phone, value: <PhoneLink ctx={ctx} /> },
    { label: t.email, value: <MailLink email={ctx.store.email} /> },
  ];
  if (ctx.store.hours) rows.push({ label: t.hours, value: ctx.store.hours });
  return (
    <div className="rounded-md border border-line bg-canvas/60 p-4 md:p-5">
      <p className="text-base">
        <strong className="text-ink">{c.legalName}</strong>
        {", "}
        {fmt(t.eik, { eik: c.eik })}
        {c.vatNumber ? `, ${fmt(t.vat, { vat: c.vatNumber })}` : null}
      </p>
      {c.representative ? <p className="mt-1! text-sm">{fmt(t.representedBy, { name: c.representative })}</p> : null}
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.95rem] sm:grid-cols-[max-content_minmax(0,1fr)]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="font-semibold text-ink">{r.label}</dt>
            <dd className="text-ink-soft">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3! text-[0.95rem]">
        {c.babhAuthority ? fmt(t.babh, { no: c.babhRegNo, authority: c.babhAuthority }) : fmt(t.babhNoAuthority, { no: c.babhRegNo })}
        {c.foodRegistration ? ` ${fmt(t.foodReg, { value: c.foodRegistration })}` : null}
      </p>
      <p className="mt-2! text-[0.95rem]">
        {t.authorities}:{" "}
        <Ext href="https://bfsa.egov.bg" lang={ctx.lang}>
          {t.bfsa}
        </Ext>
        {" · "}
        <Ext href="https://kzp.bg" lang={ctx.lang}>
          {t.kzp}
        </Ext>
        {" · "}
        <Ext href="https://cpdp.bg" lang={ctx.lang}>
          {t.kzld}
        </Ext>
      </p>
    </div>
  );
}

/** Numbered step cards ("1 Уведомете ни · 2 Върнете продуктите · 3 Получете парите"). */
export function Steps({ items }: { items: { title: string; text: React.ReactNode }[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="card flex flex-col p-5">
          <span className="grid h-10 w-10 place-items-center rounded-pill bg-primary font-display text-lg font-extrabold text-white" aria-hidden>
            {i + 1}
          </span>
          <p className="mt-3 text-base font-bold leading-snug text-ink">
            <span className="sr-only">{i + 1}. </span>
            {s.title}
          </p>
          <div className="mt-1 text-sm leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">{s.text}</div>
        </li>
      ))}
    </ol>
  );
}

/** "Можете да върнете" / "Не можете да върнете" lists with check and cross marks. */
export function YesNo({ yes, no, yesLabel, noLabel }: { yes: React.ReactNode[]; no: React.ReactNode[]; yesLabel: string; noLabel: string }) {
  const col = (items: React.ReactNode[], label: string, ok: boolean) => (
    <div className={clsx("rounded-md border p-4", ok ? "border-success/25 bg-[#e9f5ee]" : "border-sale/20 bg-[#fcecee]")}>
      <p className={clsx("flex items-center gap-2 font-bold", ok ? "text-success" : "text-sale")}>
        {ok ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
        {label}
      </p>
      <ul className="mt-2 list-none! space-y-2 pl-0! text-[0.95rem] text-ink">
        {items.map((it, i) => (
          <li key={i} className="pl-0!">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {col(yes, yesLabel, true)}
      {col(no, noLabel, false)}
    </div>
  );
}
