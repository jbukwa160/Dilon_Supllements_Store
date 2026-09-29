// The withdrawal function „Откажете се от договора тук“ (legal-content.md §0.4, §B.1, §C.6.3): available to every
// customer (guest orders: order number + e-mail; the account area links here with ?order=<number>, and the signed-in
// customer's e-mail is filled in). Dynamic page (reads ?order= and the customer session).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getCustomer } from "@/lib/customer-auth";
import { localizeHref } from "@/lib/links";
import { alternates } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { InfoPage } from "@/components/info/InfoPage";
import { fmtNodes } from "@/components/info/fmt-nodes";
import { WithdrawalFlow } from "@/components/info/withdrawal/WithdrawalFlow";
import { confirmWithdrawal, lookupWithdrawalOrder } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[lang]/otkaz-ot-dogovor">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).info;
  return { title: t.titles.withdrawPage, description: t.meta.withdraw, alternates: alternates("/otkaz-ot-dogovor", lang) };
}

export default async function WithdrawalPage({ params, searchParams }: PageProps<"/[lang]/otkaz-ot-dogovor">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const orderParam = typeof sp.order === "string" ? sp.order.replace(/\D/g, "").slice(0, 12) : "";
  const customer = await getCustomer();
  const s = getSettings();
  const t = getDict(lang).info;
  const days = Math.max(14, s.returnDays);

  return (
    <InfoPage lang={lang} title={t.titles.withdrawPage} intro={<p>{fmt(t.withdraw.intro, { days })}</p>} toc={false} wide>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <div className="min-w-0 max-w-3xl">
          <WithdrawalFlow
            lookupAction={lookupWithdrawalOrder}
            confirmAction={confirmWithdrawal}
            initialOrder={orderParam}
            initialEmail={customer?.email ?? ""}
            shopEmail={s.email}
          />
        </div>
        <aside className="card p-5 md:p-6 lg:sticky lg:top-40" aria-labelledby="wd-how">
          <h2 id="wd-how" className="text-lg font-bold text-ink">
            {t.withdraw.aside.title}
          </h2>
          <ol className="mt-3 space-y-3">
            {t.withdraw.aside.items.map((item, i) => (
              <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed text-ink-soft">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-muted">
            {fmtNodes(t.withdraw.aside.other, {
              email: (
                <a href={`mailto:${s.email}`} className="font-semibold text-primary underline underline-offset-2">
                  {s.email}
                </a>
              ),
              link: (
                <Link href={localizeHref("/vrashtane#formular", lang)} className="font-semibold text-primary underline underline-offset-2">
                  {t.titles.returns}
                </Link>
              ),
            })}
          </p>
        </aside>
      </div>
    </InfoPage>
  );
}
