// /lyubimi — the wishlist (kept in this browser). The page shell is static; WishlistView reads the list. Owner: D.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { WishlistView } from "@/components/cart/WishlistView";

export async function generateMetadata({ params }: PageProps<"/[lang]/lyubimi">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: getDict(lang).wishlist.title, alternates: alternates("/lyubimi", lang), robots: { index: false, follow: true } };
}

export default async function WishlistPage({ params }: PageProps<"/[lang]/lyubimi">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = getDict(lang);
  return (
    <div className="container-shop py-6 md:py-10">
      <Breadcrumbs items={[{ label: dict.wishlist.title }]} />
      <h1 className="h-display mb-6 mt-3 text-3xl md:mb-8 md:text-4xl">{dict.wishlist.title}</h1>
      <WishlistView />
    </div>
  );
}
