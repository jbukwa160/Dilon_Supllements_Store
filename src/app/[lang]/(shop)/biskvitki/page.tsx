// Политика за бисквитки / Cookie Policy. Texts: components/info/legal/cookies-{bg,en}.tsx (real cookie names from
// legal/cookie-names.ts; the settings button opens the consent dialog of ConsentProvider).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { InfoPage } from "@/components/info/InfoPage";
import { getLegalContext } from "@/components/info/legal-context";
import { cookiesBg } from "@/components/info/legal/cookies-bg";
import { cookiesEn } from "@/components/info/legal/cookies-en";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/biskvitki">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).info;
  return { title: t.titles.cookies, description: t.meta.cookies, alternates: alternates("/biskvitki", lang) };
}

export default async function CookiesPage({ params }: PageProps<"/[lang]/biskvitki">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const ctx = getLegalContext(lang);
  const doc = lang === "en" ? cookiesEn(ctx) : cookiesBg(ctx);
  return <InfoPage lang={lang} title={getDict(lang).info.titles.cookies} intro={doc.intro} updated={ctx.updated} before={doc.before} sections={doc.sections} />;
}
