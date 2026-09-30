// Контакти / Contact: phone, e-mail, opening hours, correspondence address (+ a map link), the merchant block and
// the contact form (Server Action in ./actions.ts). All data from Настройки. Static, refreshed on admin saves.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { ContactForm } from "@/components/info/ContactForm";
import { InfoPage, InfoSection } from "@/components/info/InfoPage";
import { getLegalContext } from "@/components/info/legal-context";
import { MerchantBlock } from "@/components/info/prose";
import { sendContactMessage } from "./actions";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/kontakti">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).info;
  return { title: t.titles.contacts, description: t.meta.contacts, alternates: alternates("/kontakti", lang) };
}

export default async function ContactsPage({ params }: PageProps<"/[lang]/kontakti">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = getDict(lang);
  const t = dict.info;
  const ctx = getLegalContext(lang);
  const { store } = ctx;
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;

  const cards = [
    { icon: Phone, label: t.contact.phone, value: store.phone, href: store.phoneHref },
    { icon: Mail, label: t.contact.email, value: store.email, href: `mailto:${store.email}` },
    ...(store.hours ? [{ icon: Clock, label: t.contact.hours, value: store.hours }] : []),
    { icon: MapPin, label: t.contact.address, value: store.address },
  ];
  const help = [
    { href: "/dostavka", label: t.titles.delivery },
    { href: "/vrashtane", label: t.titles.returns },
    { href: "/otkaz-ot-dogovor", label: t.titles.withdraw },
    { href: "/obshti-usloviya", label: t.titles.terms },
  ];

  return (
    <InfoPage lang={lang} title={t.titles.contacts} intro={<p>{t.contact.intro}</p>} toc={false} wide>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        <div className="space-y-4">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {cards.map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="card flex items-center gap-4 p-4 md:p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-primary-50 text-primary">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-muted">{label}</p>
                  {href ? (
                    <a href={href} className="flex min-h-10 items-center wrap-break-word text-lg font-bold text-ink hover:text-primary">
                      {value}
                    </a>
                  ) : (
                    <p className="text-lg font-bold leading-snug text-ink">{value}</p>
                  )}
                  {Icon === MapPin ? (
                    <a
                      href={mapHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary underline underline-offset-2"
                    >
                      {t.contact.map}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">{t.newTab}</span>
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <nav aria-labelledby="contact-help" className="card p-5">
            <h2 id="contact-help" className="text-base font-bold text-ink">
              {t.contact.helpTitle}
            </h2>
            <ul className="mt-2 divide-y divide-line">
              {help.map((h) => (
                <li key={h.href}>
                  <Link href={ctx.href(h.href)} className="flex min-h-11 items-center justify-between gap-3 py-2 font-semibold text-ink hover:text-primary">
                    {h.label}
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="space-y-4">
          <section aria-labelledby="contact-form-title" className="card p-5 sm:p-6 md:p-8">
            <h2 id="contact-form-title" className="text-xl font-bold text-ink md:text-2xl">
              {t.contact.form.title}
            </h2>
            <p className="mt-1.5 text-ink-soft">{t.contact.form.intro}</p>
            <div className="mt-5">
              <ContactForm action={sendContactMessage} shopEmail={store.email} />
            </div>
          </section>
          <InfoSection id="targovets" title={t.merchant.title}>
            <MerchantBlock ctx={ctx} />
          </InfoSection>
        </div>
      </div>
    </InfoPage>
  );
}
