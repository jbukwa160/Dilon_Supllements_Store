import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { requireCustomer } from "@/lib/customer-auth";
import { countActiveSessions, marketingConsentAt } from "@/lib/customer-account";
import { formatDate } from "@/lib/format";
import { subscriptionState } from "@/lib/newsletter";
import { alternates } from "@/lib/seo";
import { CookieSettingsButton, DeleteAccount, EmailForm, MarketingForm, PasswordForm, ProfileForm, SessionsForms } from "@/components/account/DetailsForms";

// Personal details: names / phone, sign-in e-mail, password, marketing consent + cookie settings, devices,
// "download my data" (JSON) and account deletion.

export async function generateMetadata({ params }: PageProps<"/[lang]/profil/danni">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: getDict(lang).account.details, alternates: alternates("/profil/danni", lang), robots: { index: false, follow: false } };
}

function Section({ id, title, children, tone }: { id: string; title: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section aria-labelledby={id} className={tone === "danger" ? "card border-sale/40 p-5 sm:p-6" : "card p-5 sm:p-6"}>
      <h2 id={id} className={tone === "danger" ? "mb-4 text-lg font-bold text-sale" : "mb-4 text-lg font-bold"}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AccountDetailsPage({ params }: PageProps<"/[lang]/profil/danni">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const c = await requireCustomer(lang, "/profil/danni");
  const t = getDict(lang).account;
  const consentAt = marketingConsentAt(c.id);
  // The consent tick alone is not a subscription: it counts once the e-mailed link was used (double opt-in).
  const sub = subscriptionState(c.email);
  const since = sub.state === "confirmed" ? sub.since : consentAt;

  return (
    <div className="space-y-5">
      <h1 className="h-display text-[1.6rem] md:text-4xl">{t.details}</h1>

      <Section id="profile" title={t.data.profileTitle}>
        <ProfileForm firstName={c.firstName} lastName={c.lastName} phone={c.phone} />
      </Section>

      <Section id="email" title={t.data.emailTitle}>
        <EmailForm email={c.email} />
      </Section>

      <Section id="password" title={t.data.passwordTitle}>
        <PasswordForm email={c.email} />
      </Section>

      <Section id="consents" title={t.data.consentTitle}>
        <MarketingForm on={c.marketing} status={sub.state} since={since ? formatDate(since, lang) : null} />
        <div className="mt-5 border-t border-line pt-5">
          <CookieSettingsButton />
        </div>
      </Section>

      <Section id="devices" title={t.data.sessionsTitle}>
        <SessionsForms count={Math.max(1, countActiveSessions(c.id))} />
      </Section>

      <Section id="export" title={t.data.exportTitle}>
        <p className="text-muted">{t.data.exportText}</p>
        {/* A plain download link: the route answers with Content-Disposition: attachment. */}
        <a href="/api/account/export" download className="btn btn-ghost mt-4">
          <Download className="h-5 w-5" aria-hidden />
          {t.data.exportButton}
        </a>
      </Section>

      <Section id="delete" title={t.data.deleteTitle} tone="danger">
        <p className="mb-4 text-muted">{t.data.deleteText}</p>
        <DeleteAccount />
      </Section>
    </div>
  );
}
