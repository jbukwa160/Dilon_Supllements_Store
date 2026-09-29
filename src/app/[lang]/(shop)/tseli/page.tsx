import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getGoals } from "@/lib/catalog";
import { plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogIcon } from "@/components/listing/CatalogIcon";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { ProductImage } from "@/components/product/ProductImage";

// "Пазарувай по цел": one tile per goal (as ordered / renamed in Admin → Категории).

// Static; refreshed after admin saves and catalogue imports (revalidatePath), at the latest hourly.
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[lang]/tseli">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).listing;
  return { title: t.titles.goals, description: t.meta.goals, alternates: alternates("/tseli", lang) };
}

export default async function GoalsPage({ params }: PageProps<"/[lang]/tseli">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = getDict(lang).listing;
  const goals = getGoals(lang);
  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ label: t.titles.goals }]} />
      <ListingHeader title={t.titles.goals} subtitle={t.intro.goals} />
      <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {goals.map((g, i) => (
          <li key={g.slug}>
            <Link
              href={localizeHref(`/tsel/${g.slug}`, lang)}
              className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition duration-200 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="relative flex h-36 items-center justify-between gap-4 bg-primary-50 px-5">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-pill bg-surface text-primary transition group-hover:bg-accent group-hover:text-ink">
                  <CatalogIcon name={g.icon} className="h-8 w-8" />
                </span>
                {g.image ? (
                  <span className="h-28 w-28 shrink-0 rounded-md bg-surface p-2">
                    <ProductImage src={g.image} alt="" eager={i < 4} />
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-5">
                <h2 className="text-lg font-bold leading-snug">{g.name}</h2>
                {g.description ? <p className="line-clamp-3 text-sm text-muted">{g.description}</p> : null}
                <p className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm font-semibold">
                  <span className="text-muted">{plural(lang, g.count, t.count)}</span>
                  <span className="inline-flex items-center gap-1 text-primary group-hover:underline">
                    {t.goalCta} <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
