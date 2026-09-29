// schema.org Product + Offer for a product page (Google merchant listings). Only facts we have: no ratings until
// there are real reviews. The barcode goes into gtin8 / gtin12 / gtin13 / gtin14 by its digit count. No hooks.
import type { Lang } from "@/i18n/config";
import type { ProductDetail } from "@/lib/catalog-types";
import { jsonLd } from "@/lib/html";
import { localizeHref } from "@/lib/links";
import { absoluteUrl } from "@/lib/seo";

const GTIN_KEYS: Record<number, string> = { 8: "gtin8", 12: "gtin12", 13: "gtin13", 14: "gtin14" };

export function gtinProperty(ean: string | null): Record<string, string> {
  const digits = (ean ?? "").trim();
  if (!/^\d+$/.test(digits)) return {};
  const key = GTIN_KEYS[digits.length];
  return key ? { [key]: digits } : {};
}

export function ProductJsonLd({
  product: p,
  lang,
  canBuy,
  returnDays,
  shopName,
}: {
  product: ProductDetail;
  lang: Lang;
  canBuy: boolean;
  returnDays: number;
  shopName: string;
}) {
  const url = absoluteUrl(localizeHref(`/produkt/${p.slug}`, lang));
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: [p.name, p.variantLabel].filter(Boolean).join(" · "),
    sku: p.sku,
    ...gtinProperty(p.ean),
    ...(p.images.length ? { image: p.images.map((src) => absoluteUrl(src)) } : {}),
    ...(p.description ? { description: p.description.slice(0, 5000) } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(p.manufacturer?.name ? { manufacturer: { "@type": "Organization", name: p.manufacturer.name } } : {}),
    ...(p.category ? { category: [p.parentCategory?.name, p.category.name].filter(Boolean).join(" > ") } : {}),
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "EUR",
      price: p.price.toFixed(2),
      itemCondition: "https://schema.org/NewCondition",
      availability: p.stock > 0 ? "https://schema.org/InStock" : canBuy ? "https://schema.org/BackOrder" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: shopName },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "BG",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: returnDays,
        returnMethod: "https://schema.org/ReturnByMail",
      },
    },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
