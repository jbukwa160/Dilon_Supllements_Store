// Общи условия / Terms and Conditions. Texts: components/info/legal/terms-{bg,en}.tsx, data from the settings.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { InfoPage } from "@/components/info/InfoPage";
import { getLegalContext } from "@/components/info/legal-context";
import { termsBg } from "@/components/info/legal/terms-bg";
import { termsEn } from "@/components/info/legal/terms-en";

// Static; refreshed by revalidatePath("/", "layout") after every admin save (and hourly for the gift campaign window).
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/obshti-usloviya">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).info;
  return { title: t.titles.terms, description: t.meta.terms, alternates: alternates("/obshti-usloviya", lang) };
}

export default async function TermsPage({ params }: PageProps<"/[lang]/obshti-usloviya">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const ctx = getLegalContext(lang);
  const doc = lang === "en" ? termsEn(ctx) : termsBg(ctx);
  return <InfoPage lang={lang} title={getDict(lang).info.titles.terms} intro={doc.intro} updated={ctx.updated} before={doc.before} sections={doc.sections} />;
}
