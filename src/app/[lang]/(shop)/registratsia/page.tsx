import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getCustomer } from "@/lib/customer-auth";
import { localizeHref, safeNextPath, stripLang } from "@/lib/links";
import { alternates } from "@/lib/seo";
import { AccountSync } from "@/components/account/AccountSync";
import { AUTH_PATHS } from "@/components/account/form-state";
import { RegisterForm } from "@/components/account/RegisterForm";

// Registration: names, e-mail, optional phone, password, the required 18+ / Terms checkbox, the optional (unticked)
// newsletter checkbox. Signs the new customer in and continues to ?next= (or the account).

export async function generateMetadata({ params }: PageProps<"/[lang]/registratsia">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).account;
  return { title: t.registerTitle, description: t.signUp.intro, alternates: alternates("/registratsia", lang), robots: { index: false, follow: false } };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RegisterPage({ params, searchParams }: PageProps<"/[lang]/registratsia">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const t = getDict(lang).account;
  const raw = safeNextPath(first(sp.next), "");
  const next = raw && !AUTH_PATHS.includes(stripLang(raw.split(/[?#]/)[0]).path) ? raw : "";

  if (await getCustomer()) redirect(localizeHref(next || "/profil", lang));
  const loginHref = localizeHref(next ? `/vhod?next=${encodeURIComponent(next)}` : "/vhod", lang);

  return (
    <div className="container-shop py-8 md:py-12">
      <AccountSync customer={null} />
      <section className="card mx-auto max-w-2xl p-5 sm:p-8" aria-labelledby="register-title">
        <h1 id="register-title" className="h-display text-[1.75rem] md:text-4xl">
          {t.registerTitle}
        </h1>
        <p className="mt-2 text-muted">
          {t.signUp.intro} {t.signUp.haveAccount}{" "}
          <Link href={loginHref} className="font-semibold text-primary hover:underline">
            {t.signIn.submit}
          </Link>
        </p>
        <RegisterForm next={next} />
      </section>
    </div>
  );
}
