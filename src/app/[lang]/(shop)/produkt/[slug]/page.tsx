import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageCheck, RotateCcw, Truck, TriangleAlert, Wallet } from "lucide-react";
import clsx from "clsx";
import { fmt, getDict } from "@/i18n";
import { isLang, type Lang } from "@/i18n/config";
import { getMoreFromBrand, getProductBySlug, getRelated, hidesNoImage } from "@/lib/catalog";
import type { CartSnapshot, ProductDetail, SupplementInfo } from "@/lib/catalog-types";
import { discountPercent, formatPrice, pricePerUnit, round2 } from "@/lib/format";
import { freeShippingText } from "@/lib/free-shipping";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import { absoluteUrl, alternates, ogLocale } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { DIETS, FORMS } from "@/lib/taxonomy";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { GiftTierBar } from "@/components/cart/GiftTierBar";
import { SupplementNotice } from "@/components/info/SupplementNotice";
import { BuyBox } from "@/components/product/BuyBox";
import { Gallery } from "@/components/product/Gallery";
import { NutritionTable } from "@/components/product/NutritionTable";
import { ProductJsonLd } from "@/components/product/ProductJsonLd";
import { ProductSections, type ProductSection } from "@/components/product/ProductSections";
import { ProductShelf } from "@/components/product/ProductGrid";
import { StickyBuyBar } from "@/components/product/StickyBuyBar";
import { VariantPicker } from "@/components/product/VariantPicker";

// Product page (one variant of a family, or a standalone product). The page is the product's label for the
// distance sale (Reg. 1169/2011 Art. 14): every label fact we have is shown, sections without data are left out,
// and a factual note says when the label information is still missing.
// Rendered on demand for every request (a dynamic route without generateStaticParams — `next build` lists it as ƒ),
// so price, stock and admin edits are always current; the catalogue reads behind it are indexed (~50 ms). There is
// deliberately no `revalidate` export: it would suggest an hour of caching that does not happen.

const BUY_BOX_ID = "buy-box";

function title(p: ProductDetail): string {
  return [p.name, p.variantLabel].filter(Boolean).join(" · ");
}

export async function generateMetadata({ params }: PageProps<"/[lang]/produkt/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const p = getProductBySlug(lang, slug);
  if (!p) return {};
  const s = getSettings();
  const t = getDict(lang).product;
  const name = title(p);
  const description = fmt(t.meta.description, {
    name,
    brand: p.brand && !name.toLowerCase().startsWith(p.brand.toLowerCase()) ? fmt(t.meta.by, { brand: p.brand }) : "",
    price: formatPrice(p.price, lang),
    category: p.category ? `${p.category.name}. ` : "",
    days: loc(s.deliveryDays, lang),
    returns: s.returnDays,
  });
  return {
    title: name,
    description,
    alternates: alternates(`/produkt/${p.slug}`, lang),
    // "Скрий продукти без снимка": the page stays reachable (carts, orders, old links) but is kept out of search engines,
    // like it is kept out of the listings and the sitemap.
    ...(hidesNoImage() && !p.images.length ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: name,
      description,
      url: absoluteUrl(localizeHref(`/produkt/${p.slug}`, lang)),
      locale: ogLocale(lang),
      images: p.images.slice(0, 4).map((src) => ({ url: absoluteUrl(src), alt: name })),
    },
  };
}

/** Ingredients with the declared allergens in bold (Reg. 1169/2011 Art. 21). */
function Ingredients({ text, allergens }: { text: string; allergens: string }) {
  const words = allergens
    .split(/[,;/]|\s+и\s+|\s+and\s+/iu)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const rx = new RegExp(`(${words.join("|")})`, "giu");
  return (
    <>
      {text.split(rx).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}

/**
 * The recommended daily dose for the supplement notice: the serving size entered in the admin, else the sentence of
 * the directions that states a daily amount ("Приемай по 1 капсула дневно").
 */
function dailyDose(sup: SupplementInfo): string | null {
  if (sup.servingSize.trim()) return sup.servingSize.trim();
  const sentences = sup.directions.split(/(?<=[.!?])\s+|\n+/u).map((x) => x.trim());
  const daily = /дневно|на ден|daily|a day|per day/iu;
  const found = sentences.find((x) => daily.test(x) && /\d/.test(x));
  return found && found.length <= 160 ? found : null;
}

function Specs({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2.5 text-[0.95rem]">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 font-medium wrap-break-word">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function sections(p: ProductDetail, lang: Lang): ProductSection[] {
  const dict = getDict(lang);
  const t = dict.product;
  const s = getSettings();
  const sup = p.supplement;
  const food = sup.kind !== "non-food";
  const text = "max-w-3xl whitespace-pre-line leading-relaxed text-ink-soft";
  const out: ProductSection[] = [];

  if (p.description.trim()) out.push({ id: "opisanie", title: t.description, content: <div className={text}>{p.description}</div> });

  const hasLabel = !!(sup.ingredients.trim() || sup.nutrition.length || sup.directions.trim());
  if (food && !hasLabel) {
    out.push({
      id: "etiket",
      title: t.sections.label,
      content: (
        <p className="flex max-w-3xl gap-3 rounded-md bg-primary-50 p-4 text-[0.95rem] leading-relaxed text-ink">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          {t.labelPending}
        </p>
      ),
    });
  }

  if (sup.nutrition.length) {
    out.push({ id: "hranitelna-informatsia", title: t.sections.nutrition, content: <NutritionTable rows={sup.nutrition} servingSize={sup.servingSize} lang={lang} /> });
  }

  if (sup.ingredients.trim() || sup.allergens.trim()) {
    out.push({
      id: "sastav",
      title: t.sections.ingredients,
      content: (
        <div className={clsx(text, "space-y-3")}>
          {sup.ingredients.trim() ? (
            <p>
              <Ingredients text={sup.ingredients} allergens={sup.allergens} />
            </p>
          ) : null}
          {sup.allergens.trim() ? (
            <p>
              <strong className="text-ink">{t.allergens}:</strong> <strong>{sup.allergens}</strong>
            </p>
          ) : null}
        </div>
      ),
    });
  }

  if (sup.directions.trim() || sup.servingSize.trim()) {
    out.push({
      id: "upotreba",
      title: t.sections.directions,
      content: (
        <div className={clsx(text, "space-y-3")}>
          {sup.servingSize.trim() ? <p className="font-semibold text-ink">{fmt(t.sections.dailyDose, { dose: sup.servingSize })}</p> : null}
          {sup.directions.trim() ? <p>{sup.directions}</p> : null}
        </div>
      ),
    });
  }

  if (sup.isSupplement || sup.kind === "sports-food" || sup.warnings.trim() || sup.adultOnly) {
    out.push({
      id: "preduprezhdenia",
      title: t.sections.warnings,
      content: (
        <div className="max-w-3xl space-y-3 leading-relaxed text-ink-soft">
          <SupplementNotice isSupplement={sup.isSupplement} dose={dailyDose(sup)} regNo={sup.regNo} />
          {sup.kind === "sports-food" && !sup.isSupplement ? <p>{t.sportsFood}</p> : null}
          {sup.warnings.trim() ? <p className="whitespace-pre-line">{sup.warnings}</p> : null}
          {sup.adultOnly ? (
            <p className="flex gap-2 font-semibold text-warning">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              {t.adultOnlyHint} {t.adultNotice}
            </p>
          ) : null}
          {/* A supplement's registration number is part of the notice above. */}
          {sup.regNo.trim() && !sup.isSupplement ? <p>{fmt(t.regNo, { no: sup.regNo })}</p> : null}
        </div>
      ),
    });
  }

  if (sup.storage.trim()) out.push({ id: "sahranenie", title: t.sections.storage, content: <p className={text}>{sup.storage}</p> });

  // Details.
  const sp = t.specs;
  const rows: [string, React.ReactNode][] = [];
  if (p.brand) {
    rows.push([
      sp.brand,
      p.brandSlug ? (
        <Link href={localizeHref(`/marka/${p.brandSlug}`, lang)} className="text-primary hover:underline">
          {p.brand}
        </Link>
      ) : (
        p.brand
      ),
    ]);
  }
  if (p.category) {
    rows.push([
      sp.category,
      <Link key="c" href={localizeHref(`/kategoria/${p.category.slug}`, lang)} className="text-primary hover:underline">
        {p.category.name}
      </Link>,
    ]);
  }
  rows.push([sp.kind, t.kinds[sup.kind]]);
  const form = FORMS.find((f) => f.key === (sup.form ?? p.form));
  if (form && form.key !== "other") rows.push([sp.form, loc(form.name, lang)]);
  if (sup.netQuantity.trim()) rows.push([sp.netQuantity, sup.netQuantity]);
  if (sup.servingSize.trim()) rows.push([sp.servingSize, sup.servingSize]);
  if (sup.servings) rows.push([sp.servings, String(sup.servings)]);
  const flavour = p.variants.find((v) => v.id === p.id)?.flavour;
  if (flavour) rows.push([sp.flavour, flavour]);
  const diets = p.diets.map((d) => DIETS.find((x) => x.key === d)).filter((d) => !!d);
  if (diets.length) rows.push([sp.diets, diets.map((d) => loc(d.name, lang)).join(", ")]);
  if (p.goals.length) {
    rows.push([
      sp.goals,
      <span key="g" className="flex flex-wrap gap-x-3 gap-y-1">
        {p.goals.map((g) => (
          <Link key={g.slug} href={localizeHref(`/tsel/${g.slug}`, lang)} className="text-primary hover:underline">
            {g.name}
          </Link>
        ))}
      </span>,
    ]);
  }
  if (sup.regNo.trim()) rows.push([sp.regNo, sup.regNo]);
  rows.push([sp.sku, p.sku]);
  if (p.ean) rows.push([sp.ean, p.ean]);
  out.push({ id: "harakteristiki", title: sp.title, content: <Specs rows={rows} /> });

  // Food business operator.
  const m = p.manufacturer;
  if (m) {
    const mr: [string, React.ReactNode][] = [[t.maker.name, m.name]];
    if (m.address) mr.push([t.maker.address, m.address]);
    if (m.country) mr.push([t.maker.country, m.country]);
    if (m.email) {
      mr.push([
        t.maker.email,
        <a key="e" href={`mailto:${m.email}`} className="text-primary hover:underline">
          {m.email}
        </a>,
      ]);
    }
    if (m.website) {
      const href = /^https?:\/\//i.test(m.website) ? m.website : `https://${m.website}`;
      mr.push([
        t.maker.website,
        <a key="w" href={href} target="_blank" rel="noopener nofollow" className="text-primary hover:underline">
          {m.website.replace(/^https?:\/\//i, "")}
        </a>,
      ]);
    }
    if (m.importer) mr.push([t.maker.importer, m.importer]);
    out.push({ id: "proizvoditel", title: t.sections.manufacturer, content: <Specs rows={mr} /> });
  } else if (p.brand) {
    out.push({
      id: "proizvoditel",
      title: t.sections.manufacturer,
      content: <p className={text}>{fmt(t.maker.fallback, { brand: p.brand, email: s.email })}</p>,
    });
  }
  return out;
}

export default async function ProductPage({ params }: PageProps<"/[lang]/produkt/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const p = getProductBySlug(lang, slug);
  if (!p) notFound();
  const s = getSettings();
  const dict = getDict(lang);
  const t = dict.product;
  const sup = p.supplement;

  const canBuy = p.stock > 0 || s.allowOutOfStockOrders;
  const off = discountPercent(p.price, p.oldPrice);
  const unitPrice = pricePerUnit(p.price, p.sizeValue, p.sizeUnit, lang);
  const perServing = sup.servings && sup.servings > 1 ? fmt(t.perServing, { price: formatPrice(round2(p.price / sup.servings), lang) }) : null;
  const snapshot: CartSnapshot = {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    groupId: p.groupId,
    name: p.name,
    variant: p.variantLabel,
    brand: p.brand,
    brandSlug: p.brandSlug,
    image: p.image,
    price: p.price,
    oldPrice: p.oldPrice,
    stock: p.stock,
    hidden: false,
    weightKg: p.weightKg,
    adultOnly: sup.adultOnly,
  };

  const crumbs: Crumb[] = [];
  if (p.parentCategory) crumbs.push({ href: `/kategoria/${p.parentCategory.slug}`, label: p.parentCategory.name });
  if (p.category) crumbs.push({ href: `/kategoria/${p.category.slug}`, label: p.category.name });
  crumbs.push({ label: p.name });

  const related = getRelated(lang, p.id, 12);
  const fromBrand = p.brandSlug ? getMoreFromBrand(lang, p.id, 12).filter((x) => !related.some((r) => r.id === x.id)) : [];

  const badges = (
    <>
      {off ? (
        <Badge tone="sale" className="px-2.5 py-1 text-[0.8rem]">
          <span aria-hidden>−{off}%</span>
          <span className="sr-only">{fmt(t.card.discount, { n: off })}</span>
        </Badge>
      ) : null}
      {p.promoLabel ? <Badge tone="deal">{p.promoLabel}</Badge> : null}
      {p.isNew ? <Badge tone="new">{t.card.new}</Badge> : null}
      {p.isBestseller ? <Badge tone="bestseller">{t.card.bestseller}</Badge> : null}
    </>
  );

  const stockLine =
    p.stock > 5 ? (
      <span className="text-success">{t.inStock}</span>
    ) : p.stock > 0 ? (
      <span className="text-warning">{fmt(t.lowStock, { n: p.stock })}</span>
    ) : canBuy ? (
      <span className="text-info">{t.backorder}</span>
    ) : (
      <span className="text-muted">{t.outOfStock}</span>
    );

  // Same wording and amount format as the top bar ("над 50 €"): the shared helper.
  const freeShipping = freeShippingText(s.shipping, lang);
  const usp = [
    ...(freeShipping !== null ? [{ icon: PackageCheck, text: freeShipping }] : []),
    { icon: RotateCcw, text: fmt(t.usp.returns, { n: s.returnDays }) },
    { icon: Wallet, text: t.usp.payment },
  ];

  const list = sections(p, lang);

  return (
    <>
      <div className="container-shop">
        <Breadcrumbs items={crumbs} />
        <div className="grid gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
          <div className="min-w-0 md:sticky md:top-24 md:self-start lg:top-[9.5rem]">
            <Gallery key={p.id} images={p.images} alt={title(p)} badges={badges} />
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <div>
              {p.brand ? (
                p.brandSlug ? (
                  <Link
                    href={localizeHref(`/marka/${p.brandSlug}`, lang)}
                    className="-my-1.5 inline-block py-1.5 text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted hover:text-primary"
                  >
                    {p.brand}
                  </Link>
                ) : (
                  <p className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">{p.brand}</p>
                )
              ) : null}
              <h1 className="mt-1 text-[1.5rem] font-extrabold leading-tight tracking-[-0.015em] text-balance md:text-[2rem]">{p.name}</h1>
              {p.variantLabel ? <p className="mt-1.5 text-[1.05rem] text-ink-soft">{p.variantLabel}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={sup.isSupplement ? "info" : "outline"}>{t.kinds[sup.kind]}</Badge>
                {sup.adultOnly ? (
                  <Badge tone="outline" title={t.adultOnlyHint}>
                    {t.adultOnly}
                    <span className="sr-only"> — {t.adultOnlyHint}</span>
                  </Badge>
                ) : null}
                <span className="text-muted">{fmt(t.code, { sku: p.sku })}</span>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-4 sm:p-5 md:p-6">
              <Price price={p.price} oldPrice={p.oldPrice} lowest30={p.lowest30} unitPrice={unitPrice} size="lg" />
              <p className="mt-1 text-sm text-muted">{[perServing, t.vatIncluded].filter(Boolean).join(" · ")}</p>
              {off && p.oldPrice ? (
                <p className="mt-2 inline-flex rounded-[var(--radius-sm)] bg-sale/10 px-2.5 py-1 text-sm font-bold text-sale">
                  {fmt(t.save, { amount: formatPrice(round2(p.oldPrice - p.price), lang) })}
                </p>
              ) : null}

              {p.variants.length > 1 ? (
                <div className="mt-5 border-t border-line pt-5">
                  <VariantPicker variants={p.variants} currentId={p.id} lang={lang} />
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-2 border-t border-line pt-5">
                <p className="flex items-center gap-2 font-semibold">
                  <span
                    className={clsx("h-2.5 w-2.5 shrink-0 rounded-pill", p.stock > 5 ? "bg-success" : p.stock > 0 ? "bg-warning" : canBuy ? "bg-info" : "bg-muted")}
                    aria-hidden
                  />
                  {stockLine}
                </p>
                {canBuy ? (
                  <p className="flex items-center gap-2 text-sm text-ink-soft">
                    <Truck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {fmt(t.usp.delivery, { days: loc(s.deliveryDays, lang) })}
                  </p>
                ) : null}
              </div>

              <div className="mt-4">
                <BuyBox key={p.id} id={BUY_BOX_ID} snapshot={snapshot} canBuy={canBuy} />
              </div>
              <div className="mt-4 empty:hidden">
                <GiftTierBar compact />
              </div>
            </div>

            <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
              {usp.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 rounded-md border border-line bg-surface px-3.5 py-3 text-sm font-medium">
                  <Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                  {text}
                </li>
              ))}
              <li className="flex items-center rounded-md px-3.5 text-sm">
                <Link href={localizeHref("/dostavka", lang)} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
                  {t.usp.deliveryLink} →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <ProductSections sections={list} />
        {sup.kind !== "non-food" ? <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted">{dict.info.disclaimer}</p> : null}
      </div>

      <ProductShelf title={t.similar} products={related} href={p.category ? `/kategoria/${p.category.slug}` : undefined} lang={lang} />
      {p.brand && p.brandSlug ? <ProductShelf title={fmt(t.moreFrom, { brand: p.brand })} products={fromBrand} href={`/marka/${p.brandSlug}`} lang={lang} /> : null}

      <StickyBuyBar
        snapshot={snapshot}
        canBuy={canBuy}
        targetId={BUY_BOX_ID}
        price={formatPrice(p.price, lang)}
        oldPrice={off && p.oldPrice ? formatPrice(p.oldPrice, lang) : null}
        sale={!!off}
      />
      <ProductJsonLd product={p} lang={lang} canBuy={canBuy} returnDays={s.returnDays} shopName={s.name} />
    </>
  );
}
