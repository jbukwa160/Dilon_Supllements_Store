// Политика за поверителност / Privacy Policy. Texts: components/info/legal/privacy-{bg,en}.tsx.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { InfoPage } from "@/components/info/InfoPage";
import { getLegalContext } from "@/components/info/legal-context";
import { privacyBg } from "@/components/info/legal/privacy-bg";
import { privacyEn } from "@/components/info/legal/privacy-en";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/poveritelnost">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).info;
  return { title: t.titles.privacy, description: t.meta.privacy, alternates: alternates("/poveritelnost", lang) };
}

export default async function PrivacyPage({ params }: PageProps<"/[lang]/poveritelnost">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const ctx = getLegalContext(lang);
  const doc = lang === "en" ? privacyEn(ctx) : privacyBg(ctx);
  return <InfoPage lang={lang} title={getDict(lang).info.titles.privacy} intro={doc.intro} updated={ctx.updated} before={doc.before} sections={doc.sections} />;
}
