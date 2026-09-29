import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getGoal } from "@/lib/catalog";
import { formatNumber, plural } from "@/lib/format";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogIcon } from "@/components/listing/CatalogIcon";
import { Listing } from "@/components/listing/Listing";
import { ListingHeader } from "@/components/listing/ListingHeader";

export async function generateMetadata({ params }: PageProps<"/[lang]/tsel/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const goal = getGoal(lang, slug);
  if (!goal) return {};
  return {
    title: goal.name,
    description: fmt(getDict(lang).listing.meta.goal, { name: goal.name, description: goal.description, n: formatNumber(goal.count, lang) }),
    alternates: alternates(`/tsel/${goal.slug}`, lang),
  };
}

export default async function GoalPage({ params, searchParams }: PageProps<"/[lang]/tsel/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const goal = getGoal(lang, slug);
  if (!goal) notFound();
  const t = getDict(lang).listing;
  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ href: "/tseli", label: t.titles.goals }, { label: goal.name }]} />
      <ListingHeader
        tone="tint"
        icon={<CatalogIcon name={goal.icon} />}
        eyebrow={t.titles.goal}
        title={goal.name}
        subtitle={[goal.description, plural(lang, goal.count, t.count)].filter(Boolean).join(" · ")}
      />
      <Listing lang={lang} scope={{ kind: "goal", slug: goal.slug }} basePath={`/tsel/${goal.slug}`} searchParams={await searchParams} />
    </div>
  );
}
