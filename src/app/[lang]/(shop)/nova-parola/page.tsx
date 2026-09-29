import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkIcon } from "lucide-react";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { resetTokenStatus } from "@/lib/customer-account";
import { localizeHref } from "@/lib/links";
import { alternates } from "@/lib/seo";
import { ResetForm } from "@/components/account/ResetForm";

// New password from the e-mailed link (/nova-parola?token=…). The link is checked before the form is shown; the
// action checks it again, sets the password, signs out every device and signs this browser in.

export async function generateMetadata({ params }: PageProps<"/[lang]/nova-parola">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return {
    title: getDict(lang).account.resetTitle,
    alternates: alternates("/nova-parola", lang),
    robots: { index: false, follow: false },
    // The token is in the URL: never send it to another site.
    referrer: "no-referrer",
  };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[lang]/nova-parola">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang).account;
  const token = first((await searchParams).token).slice(0, 120);
  const status = token ? resetTokenStatus(token) : "invalid";

  return (
    <div className="container-shop py-8 md:py-12">
      <section className="card mx-auto max-w-lg p-5 sm:p-8" aria-labelledby="reset-title">
        {status === "ok" ? (
          <>
            <h1 id="reset-title" className="h-display text-[1.6rem] md:text-3xl">
              {t.resetTitle}
            </h1>
            <p className="mt-2 text-muted">{t.reset.intro}</p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-pill bg-sale/10 text-sale" aria-hidden>
              <LinkIcon className="h-6 w-6" />
            </span>
            <h1 id="reset-title" className="mt-4 text-2xl font-bold">
              {status === "expired" ? t.reset.expiredTitle : t.reset.invalidTitle}
            </h1>
            <p className="mt-2 text-muted">{status === "expired" ? t.reset.expiredText : t.reset.invalidText}</p>
            <Link href={localizeHref("/zabravena-parola", lang)} className="btn btn-primary mt-6 h-12 w-full text-base">
              {t.reset.requestNew}
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
