// /kolichka — the cart page: lines, milestone bar, gift picker, summary with the delivery estimate, and a shelf of
// bestsellers. The cart itself lives in the browser (CartView); the page shell is static. Owner: D.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getShelf } from "@/lib/catalog";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CartView } from "@/components/cart/CartView";
import { ProductShelf } from "@/components/product/ProductGrid";

export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/kolichka">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: getDict(lang).cart.title, alternates: alternates("/kolichka", lang), robots: { index: false, follow: true } };
}

export default async function CartPage({ params }: PageProps<"/[lang]/kolichka">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = getDict(lang);
  return (
    <>
      <div className="container-shop py-6 md:py-10">
        <Breadcrumbs items={[{ label: dict.cart.title }]} />
        <h1 className="h-display mb-6 mt-3 text-3xl md:mb-8 md:text-4xl">{dict.cart.title}</h1>
        <CartView />
      </div>
      <ProductShelf title={dict.cart.upsell} products={getShelf(lang, "bestsellers", 12)} lang={lang} href="/produkti" />
    </>
  );
}
