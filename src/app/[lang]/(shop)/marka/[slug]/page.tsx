import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getBrand } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Listing } from "@/components/listing/Listing";
import { ListingHeader } from "@/components/listing/ListingHeader";

export async function generateMetadata({ params }: PageProps<"/[lang]/marka/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const brand = getBrand(slug);
  if (!brand) return {};
  return {
    title: brand.name,
    description: fmt(getDict(lang).listing.meta.brand, { brand: brand.name, n: formatNumber(brand.count, lang) }),
    alternates: alternates(`/marka/${brand.slug}`, lang),
  };
}

export default async function BrandPage({ params, searchParams }: PageProps<"/[lang]/marka/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const brand = getBrand(slug);
  if (!brand) notFound();
  const t = getDict(lang).listing;
  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ href: "/marki", label: t.titles.brands }, { label: brand.name }]} />
      <ListingHeader
        eyebrow={t.titles.brand}
        title={brand.name}
        subtitle={fmt(t.intro.brand, { n: formatNumber(brand.count, lang), inStock: formatNumber(brand.inStock, lang) })}
      />
      <Listing lang={lang} scope={{ kind: "brand", slug: brand.slug }} basePath={`/marka/${brand.slug}`} searchParams={await searchParams} />
    </div>
  );
}
