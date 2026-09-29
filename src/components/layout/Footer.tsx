import Link from "next/link";
import { Banknote, Clock, Landmark, Mail, MapPin, Phone, Truck } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import { companyInfo, type StoreSettings } from "@/lib/settings-types";
import { GuaranteeNotice } from "@/components/info/GuaranteeNotice";
import { CookieSettingsButton } from "./CookieSettingsButton";
import { Logo } from "./Logo";
import type { NavCategory } from "./nav-types";
import { NewsletterForm } from "./NewsletterForm";

const SOCIAL = [
  { key: "facebook", name: "Facebook", path: "M13.5 21v-7.5h2.5l.5-3h-3V8.6c0-.9.3-1.6 1.6-1.6H16.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.4H8v3h2.5V21h3Z" },
  {
    key: "instagram",
    name: "Instagram",
    path: "M12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2Zm0 7.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm4.8-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM12 3.6c-2.3 0-2.6 0-3.5.1-2.4.1-3.8 1.4-3.9 3.9-.1.9-.1 1.2-.1 3.5v1.8c0 2.3 0 2.6.1 3.5.1 2.4 1.5 3.8 3.9 3.9.9.1 1.2.1 3.5.1s2.6 0 3.5-.1c2.4-.1 3.8-1.5 3.9-3.9.1-.9.1-1.2.1-3.5v-1.8c0-2.3 0-2.6-.1-3.5-.1-2.4-1.5-3.8-3.9-3.9-.9-.1-1.2-.1-3.5-.1Z",
  },
  { key: "tiktok", name: "TikTok", path: "M16.6 3h-3v12.2a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.6a5.7 5.7 0 1 0 4.8 5.6V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-4.3-4.4Z" },
  { key: "youtube", name: "YouTube", path: "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" },
] as const;

/**
 * Footer (ink band): newsletter, link columns (categories, help, legal incl. "Откажете се от договора тук" and the
 * cookie settings), contacts, payment / delivery methods, the merchant block required by law (company, ЕИК, БАБХ
 * registration, supervisory authorities, КЗП conciliation — no EU ODR link, the platform is closed) and the EU
 * legal-guarantee notice.
 */
export function Footer({ lang, settings: s, categories }: { lang: Lang; settings: StoreSettings; categories: NavCategory[] }) {
  const dict = getDict(lang);
  const t = dict.footer;
  const href = (path: string) => localizeHref(path, lang);
  const c = companyInfo(s, lang);
  const year = new Date().getFullYear();
  const socials = SOCIAL.filter((x) => /^https?:\/\//i.test(s.social[x.key]));
  const address = loc(s.address, lang);
  const hours = loc(s.workingHours, lang);

  const help = [
    { href: "/dostavka", label: t.delivery },
    { href: "/vrashtane", label: t.returns },
    { href: "/kontakti", label: t.contacts },
    { href: "/blog", label: t.blog },
    { href: "/tseli", label: t.goals },
    { href: "/marki", label: t.brands },
  ];
  const legal = [
    { href: "/obshti-usloviya", label: t.terms },
    { href: "/poveritelnost", label: t.privacy },
    { href: "/biskvitki", label: t.cookiePolicy },
  ];
  const heading = "font-display text-[0.85rem] font-extrabold uppercase tracking-[0.04em] text-white";
  const link = "inline-flex min-h-8 items-center hover:text-white hover:underline underline-offset-2";

  return (
    <footer aria-label={t.label} className="on-dark mt-16 bg-ink text-[0.95rem] text-canvas/80">
      <div className="container-shop grid grid-cols-1 gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:gap-8 xl:gap-12">
        <div className="space-y-5">
          <Logo name={s.name} href={href("/")} label={`${s.name} — ${dict.common.home}`} variant="dark" />
          <p className="max-w-sm leading-relaxed">{loc(s.tagline, lang)}</p>
          {/* Hidden on the home page when its own (bigger) newsletter band is shown. */}
          <div className="max-w-md [body:has(#home-newsletter)_&]:hidden">
            <h2 className="mb-1 font-semibold text-white">{dict.newsletter.title}</h2>
            <p className="mb-3 text-sm text-canvas/70">{dict.newsletter.text}</p>
            <NewsletterForm tone="dark" />
          </div>
          {socials.length ? (
            <div>
              <h2 className="sr-only">{t.followUs}</h2>
              <ul className="flex gap-2">
                {socials.map((x) => (
                  <li key={x.key}>
                    <a
                      href={s.social[x.key]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid h-11 w-11 place-items-center rounded-pill bg-white/10 text-white transition hover:bg-primary"
                      aria-label={`${fmt(t.socialLink, { network: x.name, name: s.name })} ${dict.common.newWindow}`}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                        <path d={x.path} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <nav aria-labelledby="footer-categories">
          <h2 id="footer-categories" className={heading}>
            {t.categories}
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:block sm:space-y-1">
            {categories.slice(0, 10).map((cat) => (
              <li key={cat.slug}>
                <Link href={href(`/kategoria/${cat.slug}`)} className={link}>
                  {cat.name}
                </Link>
              </li>
            ))}
            <li className="col-span-2">
              <Link href={href("/produkti")} className={`${link} font-semibold text-white`}>
                {t.allCategories} →
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-help">
          <h2 id="footer-help" className={heading}>
            {t.help}
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:block sm:space-y-1">
            {help.map((l) => (
              <li key={l.href}>
                <Link href={href(l.href)} className={link}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <h2 id="footer-legal" className={`${heading} mt-8`}>
            {t.legal}
          </h2>
          <ul className="mt-4 space-y-1" aria-labelledby="footer-legal">
            {legal.map((l) => (
              <li key={l.href}>
                <Link href={href(l.href)} className={link}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <CookieSettingsButton className={`${link} gap-1.5 text-left`} />
            </li>
            <li>
              <Link href={href("/otkaz-ot-dogovor")} className={`${link} font-semibold text-white underline`}>
                {t.withdraw}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className={heading}>{t.contactsTitle}</h2>
          <ul className="mt-4 space-y-3">
            {s.phone ? (
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="sr-only">{t.phone}: </span>
                <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-white hover:underline">
                  {s.phone}
                </a>
              </li>
            ) : null}
            {s.email ? (
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="sr-only">{t.email}: </span>
                <a href={`mailto:${s.email}`} className="break-all hover:text-white hover:underline">
                  {s.email}
                </a>
              </li>
            ) : null}
            {hours ? (
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="sr-only">{t.hours}: </span>
                {hours}
              </li>
            ) : null}
            {address ? (
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="sr-only">{t.address}: </span>
                {address}
              </li>
            ) : null}
          </ul>

          <h2 className={`${heading} mt-8`}>{t.payment}</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white">
            <li className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-white/10 px-2.5 py-1.5">
              <Banknote className="h-4 w-4 text-accent" aria-hidden /> {t.paymentCod}
            </li>
            <li className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-white/10 px-2.5 py-1.5">
              <Landmark className="h-4 w-4 text-accent" aria-hidden /> {t.paymentBank}
            </li>
          </ul>
          <h2 className={`${heading} mt-5`}>{t.shipping}</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-white">
            <li className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-white/10 px-2.5 py-1.5">
              <Truck className="h-4 w-4 text-accent" aria-hidden /> {t.speedy}
            </li>
            <li className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-white/10 px-2.5 py-1.5">
              <Truck className="h-4 w-4 text-accent" aria-hidden /> {t.econt}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-shop grid gap-6 py-8 text-[0.8rem] leading-relaxed text-canvas/65 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="space-y-1.5">
            <h2 className="sr-only">{t.merchant}</h2>
            <p>
              <strong className="font-semibold text-canvas/90">{c.legalName}</strong>
              {c.eik ? `, ${fmt(t.eik, { eik: c.eik })}` : ""}
              {c.vatNumber ? `, ${fmt(t.vat, { vat: c.vatNumber })}` : ""}
              {c.registeredAddress ? ` · ${fmt(t.registeredAddress, { address: c.registeredAddress })}` : ""}
            </p>
            {address ? <p>{fmt(t.correspondence, { address })}</p> : null}
            {c.babhRegNo ? (
              <p>
                {fmt(t.babhRegistration, { no: c.babhRegNo })}
                {c.babhAuthority ? fmt(t.babhIssuedBy, { authority: c.babhAuthority }) : ""}.
              </p>
            ) : null}
            <p>{t.authorities}</p>
            <p>
              {t.adr}{" "}
              <a href="https://kzp.bg/bg/pomiritelna-komisiya/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">
                {t.adrLink}
                <span className="sr-only"> {dict.common.newWindow}</span>
              </a>
            </p>
          </div>
          <div className="lg:w-[28rem]">
            <GuaranteeNotice lang={lang} />
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-shop flex flex-col gap-1 py-5 text-sm text-canvas/70 sm:flex-row sm:items-center sm:justify-between">
          <p>{fmt(t.rights, { year, name: s.name })}</p>
          <p className="font-semibold text-canvas/85">{t.pricesInclVat}</p>
        </div>
      </div>
    </footer>
  );
}
