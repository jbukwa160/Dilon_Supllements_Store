// Home page (static; refreshed after every admin save and scheduled price change via revalidatePath("/", "layout"),
// and every 5 minutes as a safety net — e.g. a gift campaign that starts at midnight).
// Section order follows reference-ux §3.2; every section can be switched off in Admin → Начална страница.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { INTL_LOCALE, isLang, type Lang } from "@/i18n/config";
import { getActiveGiftTiers } from "@/lib/cart-gifts";
import { getBrands, getCatalogMeta, getGoals, getHeroProducts, getShelf, imageForHref } from "@/lib/catalog";
import { jsonLd } from "@/lib/html";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import { absoluteUrl, alternates, ogLocale } from "@/lib/seo";
import { getGiftTiers, getHomeContent, getSettings } from "@/lib/settings";
import type { HeroSlide, StoreSettings } from "@/lib/settings-types";
import { LatestPosts } from "@/components/blog/LatestPosts";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { PromoCards } from "@/components/home/PromoCards";
import { BrandsStrip, CategoryTiles, GiftTiersBlock, GoalTiles, NewsletterBand, TrustStrip } from "@/components/home/sections";
import { formatAmount } from "@/components/layout/format-amount";
import { giftFromAmount, navCategories } from "@/components/layout/nav-data";
import { ProductCard } from "@/components/product/ProductCard";
import { ShelfTabs } from "@/components/home/ShelfTabs";

export const revalidate = 300;

const SHELF_SIZE = 14;

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const s = getSettings();
  const title = `${s.name} — ${loc(s.tagline, lang)}`;
  const description = loc(s.description, lang);
  return {
    title: { absolute: title },
    description,
    alternates: alternates("/", lang),
    openGraph: { title, description, url: absoluteUrl(localizeHref("/", lang)), siteName: s.name, locale: ogLocale(lang), type: "website" },
  };
}

/** A slide is worth showing: a ready-made banner needs its picture, a text slide its title. */
function showable(slide: HeroSlide, lang: Lang): boolean {
  if (!slide.enabled) return false;
  return slide.layout === "image-only" ? !!loc(slide.image, lang) : !!loc(slide.title, lang);
}

/** WebSite (with the search box) + OnlineStore structured data. */
function structuredData(s: StoreSettings, lang: Lang) {
  const home = absoluteUrl(localizeHref("/", lang));
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: s.name,
      url: home,
      inLanguage: INTL_LOCALE[lang],
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl(localizeHref("/tarsene", lang))}?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      name: s.name,
      legalName: loc(s.company.legalName, lang) || undefined,
      description: loc(s.description, lang),
      url: home,
      logo: absoluteUrl("/icon.svg"),
      email: s.email || undefined,
      telephone: s.phone || undefined,
      contactPoint: s.phone || s.email ? { "@type": "ContactPoint", contactType: "customer service", telephone: s.phone || undefined, email: s.email || undefined } : undefined,
      sameAs: Object.values(s.social).filter((u) => /^https?:\/\//i.test(u)),
    },
  ];
}

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = getDict(lang);
  const s = getSettings();
  const home = getHomeContent();
  const on = home.sections;
  const { productCount } = getCatalogMeta();
  const giftFrom = giftFromAmount(lang);

  const slides = home.slides.filter((x) => showable(x, lang));
  const needsCollage = slides.some((x) => x.layout === "text-image" && !loc(x.image, lang));
  const collage = needsCollage ? getHeroProducts(lang, 9).map((p) => ({ id: p.id, slug: p.slug, name: p.name, image: p.image })) : [];
  const promos = home.promos.filter((p) => p.enabled && loc(p.title, lang));
  const autoImage = Object.fromEntries(promos.map((p) => [p.id, p.image ? null : imageForHref(p.href)]));
  const firstIsH1 = slides[0]?.layout === "text-image";

  const goals = on.goals ? getGoals(lang).slice(0, 8) : [];
  const categories = on.categories ? navCategories(lang) : [];
  const tiers = on.giftTiers ? getActiveGiftTiers(lang) : [];
  const sale = on.sale ? getShelf(lang, "sale", SHELF_SIZE) : [];
  const bestsellers = on.bestsellers ? getShelf(lang, "bestsellers", SHELF_SIZE) : [];
  const fresh = on.fresh ? getShelf(lang, "new", SHELF_SIZE) : [];
  const allBrands = on.brands ? getBrands() : [];
  const brands = [...allBrands].sort((a, b) => b.inStock - a.inStock || b.count - a.count).slice(0, 18);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData(s, lang)) }} />
      {firstIsH1 ? null : (
        <h1 className="sr-only">
          {s.name} — {loc(s.tagline, lang)}
        </h1>
      )}

      {slides.length ? (
        // Full-bleed banner band (GymBeam): no side gutters, the slide aligns its text to the page container itself.
        <div>
          <HeroCarousel
            slides={slides}
            productCount={productCount}
            collage={collage}
            autoplaySeconds={home.autoplaySeconds}
            badge={giftFrom !== null ? fmt(dict.home.heroCollageBadge, { amount: formatAmount(giftFrom, lang) }) : undefined}
            firstIsH1={firstIsH1}
          />
        </div>
      ) : null}

      {/* GymBeam-style: the black promise band sits right under the hero band. */}
      {on.trust ? (
        <TrustStrip lang={lang} giftFrom={giftFrom} freeOver={s.shipping.freeOver} freeScope={s.shipping.freeScope} returnDays={s.returnDays} deliveryDays={loc(s.deliveryDays, lang)} />
      ) : null}

      {/* XXL: the category tiles right under the hero band, then the products (GymBeam). */}
      <CategoryTiles lang={lang} categories={categories} />
      {/* One tabbed shelf (XXL / fitness1): bestsellers, hot deals, new in — a tab only when its section is on and has products. */}
      <ShelfTabs
        title={dict.home.shelves}
        tabs={[
          { key: "bestsellers", label: dict.home.bestsellers.title, href: "/produkti", products: bestsellers },
          { key: "sale", label: dict.home.sale.title, href: "/promotsii", products: sale },
          { key: "fresh", label: dict.home.fresh.title, href: "/novi", products: fresh },
        ]
          .filter((t) => t.products.length)
          .map(({ products, ...t }) => ({
            ...t,
            children: products.map((p) => (
              <li key={p.id} className="min-w-0">
                <ProductCard product={p} lang={lang} />
              </li>
            )),
          }))}
      />

      {promos.length ? (
        <div className="container-shop py-2 md:py-4">
          <PromoCards promos={promos} lang={lang} autoImage={autoImage} />
        </div>
      ) : null}

      <GoalTiles lang={lang} goals={goals} />
      <GiftTiersBlock lang={lang} tiers={tiers} single={getGiftTiers().mode === "single"} />

      <BrandsStrip lang={lang} brands={brands} total={allBrands.length} />
      {on.blog ? <LatestPosts lang={lang} /> : null}
      {on.newsletter ? <NewsletterBand lang={lang} /> : null}
    </>
  );
}
