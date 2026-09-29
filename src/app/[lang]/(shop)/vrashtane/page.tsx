// Връщане и отказ от поръчка / Returns and withdrawal: conditions, the call-to-action to the withdrawal function and
// the printable model withdrawal form. Texts: components/info/legal/returns-{bg,en}.tsx.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getSettings } from "@/lib/settings";
import { alternates } from "@/lib/seo";
import { InfoPage } from "@/components/info/InfoPage";
import { WithdrawalModelForm } from "@/components/info/WithdrawalModelForm";
import { getLegalContext } from "@/components/info/legal-context";
import { returnsBg } from "@/components/info/legal/returns-bg";
import { returnsEn } from "@/components/info/legal/returns-en";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/vrashtane">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).info;
  return {
    title: t.titles.returns,
    description: fmt(t.meta.returns, { days: Math.max(14, getSettings().returnDays) }),
    alternates: alternates("/vrashtane", lang),
  };
}

export default async function ReturnsPage({ params }: PageProps<"/[lang]/vrashtane">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const ctx = getLegalContext(lang);
  const doc = lang === "en" ? returnsEn(ctx) : returnsBg(ctx);
  return (
    <InfoPage lang={lang} title={getDict(lang).info.titles.returns} intro={doc.intro} before={doc.before} sections={doc.sections}>
      <WithdrawalModelForm ctx={ctx} />
    </InfoPage>
  );
}
