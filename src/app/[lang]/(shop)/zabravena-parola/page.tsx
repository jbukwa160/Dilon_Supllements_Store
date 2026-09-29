import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { ForgotForm } from "@/components/account/ForgotForm";

// Forgotten password: always the same answer (no account enumeration); the action is rate-limited and e-mails a
// one-hour, single-use link to /nova-parola.

export async function generateMetadata({ params }: PageProps<"/[lang]/zabravena-parola">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).account;
  return { title: t.forgotTitle, description: t.forgotText, alternates: alternates("/zabravena-parola", lang), robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[lang]/zabravena-parola">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang).account;
  return (
    <div className="container-shop py-8 md:py-12">
      <section className="card mx-auto max-w-lg p-5 sm:p-8" aria-labelledby="forgot-title">
        <h1 id="forgot-title" className="h-display text-[1.6rem] md:text-3xl">
          {t.forgotTitle}
        </h1>
        <p className="mt-2 text-muted">{t.forgotText}</p>
        <ForgotForm />
      </section>
    </div>
  );
}
