// /porachka/[id] — order confirmation. The id in the URL is not enough to see personal data: the full view needs the
// signed "orders placed in this browser" cookie, the owning customer's session or an admin (canViewOrder);
// everyone else sees only "Поръчка №N е приета". Owner: D.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Landmark, PackageCheck, UserPlus } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { isLang, type Lang } from "@/i18n/config";
import { formatPrice } from "@/lib/format";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import { canViewOrder } from "@/lib/order-access";
import { getOrder, type Order } from "@/lib/orders";
import { alternates } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { ClearCartOnOrder } from "@/components/order/ClearCartOnOrder";
import { OrderSummary } from "@/components/order/OrderSummary";

export async function generateMetadata({ params }: PageProps<"/[lang]/porachka/[id]">): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isLang(lang)) return {};
  return {
    title: getDict(lang).order.title,
    alternates: alternates(`/porachka/${encodeURIComponent(id)}`, lang),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

function BankDetails({ order, lang }: { order: Order; lang: Lang }) {
  const t = getDict(lang).order;
  const s = getSettings();
  const rows: [string, string][] = (
    [
      [t.bankHolder, s.bank.holder || loc(s.company.legalName, lang)],
      [t.bankIban, s.bank.iban],
      [t.bankBic, s.bank.bic],
      [t.bankName, s.bank.bank],
      [t.bankAmount, formatPrice(order.total, lang)],
      [t.bankReason, fmt(t.bankReasonValue, { number: order.number })],
    ] as [string, string][]
  ).filter(([, v]) => v.trim());
  return (
    <section className="card p-5 md:p-6" aria-labelledby="bank-title">
      <h2 id="bank-title" className="flex items-center gap-2 text-lg font-bold">
        <Landmark className="h-5 w-5 text-primary" aria-hidden /> {t.bankTitle}
      </h2>
      {s.bank.iban.trim() ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="break-all font-semibold tabular-nums sm:break-normal">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-ink-soft">{t.bankMissing}</p>
      )}
    </section>
  );
}

export default async function OrderPage({ params, searchParams }: PageProps<"/[lang]/porachka/[id]">) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  const order = /^[\w-]{1,64}$/.test(id) ? getOrder(id) : null;
  if (!order) notFound();
  const dict = getDict(lang);
  const t = dict.order;
  const sp = await searchParams;
  const fresh = sp.nova === "1";
  const clear = fresh ? <ClearCartOnOrder href={localizeHref(`/porachka/${order.id}`, lang)} /> : null;

  if (!(await canViewOrder(order.id))) {
    return (
      <div className="container-shop max-w-2xl py-10 md:py-16">
        {clear}
        <div className="card p-6 text-center md:p-10">
          <CircleCheck className="mx-auto h-14 w-14 text-success" aria-hidden />
          <h1 className="h-display mt-4 text-2xl md:text-3xl">{t.restrictedTitle}</h1>
          <p className="mt-3 text-lg">{fmt(t.accepted, { number: order.number })}</p>
          <p className="mt-2 text-muted">{t.restricted}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={localizeHref(`/vhod?next=${encodeURIComponent(`/porachka/${order.id}`)}`, lang)} className="btn btn-primary h-12 px-8">
              {t.signIn}
            </Link>
            <Link href={localizeHref("/", lang)} className="btn btn-ghost h-12 px-8">
              {t.backToShop}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const total = formatPrice(order.total, lang);
  return (
    <div className="container-shop max-w-4xl py-8 md:py-12">
      {clear}
      <div className="card p-6 text-center md:p-10">
        <CircleCheck className="mx-auto h-14 w-14 text-success" aria-hidden />
        <h1 className="h-display mt-4 text-2xl md:text-3xl">{fmt(t.thanks, { name: order.customer.firstName })}</h1>
        <p className="mt-3 text-lg">
          <strong>{fmt(t.accepted, { number: order.number })}</strong>
        </p>
        <p className="mx-auto mt-2 max-w-xl text-muted">{fmt(t.emailSent, { email: order.email })}</p>
      </div>

      <section className="card mt-5 flex items-start gap-4 p-5 md:p-6" aria-labelledby="next-title">
        <PackageCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 id="next-title" className="font-bold">
            {t.whatNext}
          </h2>
          <p className="mt-1 text-ink-soft">{fmt(t.next[order.payment], { total })}</p>
        </div>
      </section>

      {order.payment === "bank" ? (
        <div className="mt-5">
          <BankDetails order={order} lang={lang} />
        </div>
      ) : null}

      <div className="mt-5">
        <OrderSummary order={order} lang={lang} />
      </div>

      {order.customerId === null ? (
        <section className="card mt-5 flex flex-wrap items-center gap-4 p-5 md:p-6">
          <UserPlus className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">{t.accountTitle}</h2>
            <p className="text-sm text-muted">{t.accountText}</p>
          </div>
          <Link href={localizeHref("/registratsia", lang)} className="btn btn-outline h-11 px-6">
            {t.accountCta}
          </Link>
        </section>
      ) : null}

      <div className="mt-8 text-center">
        <Link href={localizeHref("/", lang)} className="btn btn-primary h-12 px-8">
          {t.backToShop}
        </Link>
      </div>
    </div>
  );
}
