import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { fmt, getDict } from "@/i18n";
import { LANGS } from "@/i18n/config";
import { getCatalogMeta, getGoalEntries, getCategoryEntries, getHeroProducts, imageForHref } from "@/lib/catalog";
import { getHomeContent } from "@/lib/settings";
import { getLinkOptions } from "@/lib/admin/link-options";
import { formatAmount } from "@/components/layout/format-amount";
import { giftFromAmount } from "@/components/layout/nav-data";
import { PageHeader } from "@/components/admin/PageHeader";
import { HomeEditor } from "@/components/admin/HomeEditor";

export const metadata: Metadata = { title: "Начална страница" };

export default async function HomeAdminPage() {
  await requireAdmin();
  const home = getHomeContent();
  const collage = getHeroProducts("bg", 4).map((p) => ({ id: p.id, slug: p.slug, name: p.name, image: p.image }));

  // Promo cards without their own picture show the linked category's / goal's / brand's picture (as on the home page).
  const hrefs = new Set<string>(home.promos.map((p) => p.href));
  for (const c of getCategoryEntries()) {
    hrefs.add(`/kategoria/${c.slug}`);
    for (const s of c.subs) hrefs.add(`/kategoria/${s.slug}`);
  }
  for (const g of getGoalEntries()) hrefs.add(`/tsel/${g.slug}`);
  const autoImages = Object.fromEntries([...hrefs].filter(Boolean).map((h) => [h, imageForHref(h)]));

  // The label the storefront puts under the hero collage ("Подарък над 40 €").
  const heroBadge = Object.fromEntries(
    LANGS.map((lang) => {
      const from = giftFromAmount(lang);
      return [lang, from !== null ? fmt(getDict(lang).home.heroCollageBadge, { amount: formatAmount(from, lang) }) : undefined];
    }),
  );

  return (
    <>
      <PageHeader
        title="Начална страница"
        description="Сменете обявата, банерите, промо картите и секциите на началната страница — на български и английски. Промените се виждат в сайта веднага след „Запази“."
      />
      <HomeEditor
        initial={home}
        linkOptions={getLinkOptions()}
        collage={collage}
        productCount={getCatalogMeta().productCount}
        autoImages={autoImages}
        heroBadge={heroBadge}
      />
    </>
  );
}
