import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, UserRoundPlus } from "lucide-react";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getCustomer } from "@/lib/customer-auth";
import { localizeHref, safeNextPath, stripLang } from "@/lib/links";
import { alternates } from "@/lib/seo";
import { AccountSync } from "@/components/account/AccountSync";
import { FormAlert } from "@/components/account/fields";
import { AUTH_PATHS } from "@/components/account/form-state";
import { LoginForm } from "@/components/account/LoginForm";

// Sign-in. Dynamic (reads the session cookie and ?next=). Signed-in visitors go straight on to `next` / the account.

export async function generateMetadata({ params }: PageProps<"/[lang]/vhod">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).account;
  return { title: t.login, description: t.signIn.intro, alternates: alternates("/vhod", lang), robots: { index: false, follow: false } };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function LoginPage({ params, searchParams }: PageProps<"/[lang]/vhod">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const t = getDict(lang).account;
  const raw = safeNextPath(first(sp.next), "");
  const next = raw && !AUTH_PATHS.includes(stripLang(raw.split(/[?#]/)[0]).path) ? raw : "";

  if (await getCustomer()) redirect(localizeHref(next || "/profil", lang));

  const notices: Record<string, string> = {
    signedout: t.signIn.signedOut,
    deleted: t.signIn.deleted,
    reset: t.signIn.passwordChanged,
    everywhere: t.signIn.sessionsEnded,
  };
  const notice = notices[first(sp.msg)];
  const registerHref = localizeHref(next ? `/registratsia?next=${encodeURIComponent(next)}` : "/registratsia", lang);

  return (
    <div className="container-shop py-8 md:py-12">
      <AccountSync customer={null} />
      <div className="mx-auto grid max-w-5xl items-start gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-8">
        <section className="card p-5 sm:p-8" aria-labelledby="login-title">
          <h1 id="login-title" className="h-display text-[1.75rem] md:text-4xl">
            {t.login}
          </h1>
          <p className="mt-2 text-muted">{t.signIn.intro}</p>
          {notice ? (
            <FormAlert tone="success" className="mt-5">
              {notice}
            </FormAlert>
          ) : null}
          <LoginForm next={next} />
        </section>

        <aside className="on-dark rounded-xl bg-ink p-6 text-canvas sm:p-8" aria-labelledby="new-customer">
          <h2 id="new-customer" className="h-display text-xl md:text-2xl">
            {t.signIn.newCustomer}
          </h2>
          <p className="mt-2 text-canvas/80">{t.signIn.newCustomerText}</p>
          <ul className="mt-6 space-y-3">
            {[t.signIn.benefit1, t.signIn.benefit2, t.signIn.benefit3].map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-pill bg-accent text-ink" aria-hidden>
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Link href={registerHref} className="btn btn-energy mt-7 h-12 w-full text-base">
            <UserRoundPlus className="h-5 w-5" aria-hidden />
            {t.create}
          </Link>
        </aside>
      </div>
    </div>
  );
}
