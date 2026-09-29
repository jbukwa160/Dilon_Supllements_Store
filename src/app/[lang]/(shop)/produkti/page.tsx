import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getBrands } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Listing } from "@/components/listing/Listing";
import { ListingHeader } from "@/components/listing/ListingHeader";

export async function generateMetadata({ params }: PageProps<"/[lang]/produkti">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).listing;
  return { title: t.titles.all, description: t.meta.all, alternates: alternates("/produkti", lang) };
}

export default async function ProductsPage({ params, searchParams }: PageProps<"/[lang]/produkti">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang).listing;
  const brands = getBrands().filter((b) => b.count > 0).length;
  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ label: t.titles.all }]} />
      <ListingHeader title={t.titles.all} subtitle={fmt(t.intro.all, { brands: formatNumber(brands, lang) })} />
      <Listing lang={lang} scope={{ kind: "all" }} basePath="/produkti" searchParams={await searchParams} />
    </div>
  );
}
