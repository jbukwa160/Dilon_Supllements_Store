import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Listing } from "@/components/listing/Listing";
import { ListingHeader } from "@/components/listing/ListingHeader";

export async function generateMetadata({ params }: PageProps<"/[lang]/novi">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).listing;
  return { title: t.titles.new, description: t.meta.new, alternates: alternates("/novi", lang) };
}

export default async function NewPage({ params, searchParams }: PageProps<"/[lang]/novi">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang).listing;
  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ label: t.titles.new }]} />
      <ListingHeader title={t.titles.new} subtitle={t.intro.new} />
      <Listing lang={lang} scope={{ kind: "new" }} basePath="/novi" searchParams={await searchParams} defaultSort="new" />
    </div>
  );
}
