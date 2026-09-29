// Доставка и плащане / Delivery and payment. Texts: components/info/legal/delivery-{bg,en}.tsx; couriers, prices,
// the free-delivery threshold and delivery time come from Настройки.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { InfoPage } from "@/components/info/InfoPage";
import { getLegalContext } from "@/components/info/legal-context";
import { deliveryBg } from "@/components/info/legal/delivery-bg";
import { deliveryEn } from "@/components/info/legal/delivery-en";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/dostavka">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).info;
  return { title: t.titles.delivery, description: t.meta.delivery, alternates: alternates("/dostavka", lang) };
}

export default async function DeliveryPage({ params }: PageProps<"/[lang]/dostavka">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const ctx = getLegalContext(lang);
  const doc = lang === "en" ? deliveryEn(ctx) : deliveryBg(ctx);
  return <InfoPage lang={lang} title={getDict(lang).info.titles.delivery} intro={doc.intro} before={doc.before} sections={doc.sections} />;
}
