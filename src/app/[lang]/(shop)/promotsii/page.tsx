import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgePercent } from "lucide-react";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Listing } from "@/components/listing/Listing";
import { ListingHeader } from "@/components/listing/ListingHeader";

export async function generateMetadata({ params }: PageProps<"/[lang]/promotsii">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).listing;
  return { title: t.titles.sale, description: t.meta.sale, alternates: alternates("/promotsii", lang) };
}

export default async function SalePage({ params, searchParams }: PageProps<"/[lang]/promotsii">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang).listing;
  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ label: t.titles.sale }]} />
      <ListingHeader tone="dark" icon={<BadgePercent strokeWidth={1.75} aria-hidden />} title={t.titles.sale} subtitle={t.intro.sale} />
      <Listing lang={lang} scope={{ kind: "sale" }} basePath="/promotsii" searchParams={await searchParams} defaultSort="discount" />
    </div>
  );
}
