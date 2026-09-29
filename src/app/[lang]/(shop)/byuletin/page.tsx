import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, LinkIcon, MailCheck } from "lucide-react";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { localizeHref } from "@/lib/links";
import { alternates } from "@/lib/seo";

// Newsletter confirmation (double opt-in, lib/newsletter.ts): the e-mailed link opens /byuletin?t=…, the button posts
// the token to /api/newsletter/confirm, which comes back here with ?status=ok|invalid. Opening the link alone never
// confirms (mail scanners open links). No analytics on this page (TrackingScripts) and the token is never sent to
// another site (referrer).

export async function generateMetadata({ params }: PageProps<"/[lang]/byuletin">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return {
    title: getDict(lang).newsletter.confirm.title,
    alternates: alternates("/byuletin", lang),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function NewsletterConfirmPage({ params, searchParams }: PageProps<"/[lang]/byuletin">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang).newsletter.confirm;
  const sp = await searchParams;
  const token = first(sp.t).slice(0, 100);
  const status = first(sp.status);
  const state = status === "ok" ? "done" : status === "invalid" || !/^[A-Za-z0-9_-]{20,100}$/.test(token) ? "invalid" : "ask";

  return (
    <div className="container-shop py-8 md:py-12">
      <section className="card mx-auto max-w-lg p-5 sm:p-8" aria-labelledby="nl-title">
        <span
          className={
            state === "invalid"
              ? "grid h-12 w-12 place-items-center rounded-pill bg-sale/10 text-sale"
              : "grid h-12 w-12 place-items-center rounded-pill bg-primary-50 text-primary"
          }
          aria-hidden
        >
          {state === "done" ? <CheckCircle2 className="h-6 w-6" /> : state === "invalid" ? <LinkIcon className="h-6 w-6" /> : <MailCheck className="h-6 w-6" />}
        </span>
        <h1 id="nl-title" className="mt-4 text-2xl font-bold">
          {state === "done" ? t.doneTitle : state === "invalid" ? t.invalidTitle : t.title}
        </h1>
        <p className="mt-2 text-muted" role={state === "ask" ? undefined : "status"}>
          {state === "done" ? t.doneText : state === "invalid" ? t.invalidText : t.text}
        </p>
        {state === "ask" ? (
          <form method="post" action="/api/newsletter/confirm" className="mt-6">
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="lang" value={lang} />
            <button type="submit" className="btn btn-primary h-12 w-full text-base">
              {t.button}
            </button>
          </form>
        ) : (
          <Link href={localizeHref("/", lang)} className="btn btn-outline mt-6 h-12 w-full text-base">
            {t.home}
          </Link>
        )}
      </section>
    </div>
  );
}
