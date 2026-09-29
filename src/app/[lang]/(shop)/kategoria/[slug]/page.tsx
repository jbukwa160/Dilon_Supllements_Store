import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getCategory, getCategoryEntries } from "@/lib/catalog";
import { formatNumber, plural } from "@/lib/format";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import { alternates } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogIcon } from "@/components/listing/CatalogIcon";
import { Listing } from "@/components/listing/Listing";
import { ListingHeader } from "@/components/listing/ListingHeader";

// A top category or a subcategory (/kategoria/surovatachen-protein): coloured header with the subcategory chips,
// then the listing. Hidden categories keep their page (links from old banners keep working).

export async function generateMetadata({ params }: PageProps<"/[lang]/kategoria/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const found = getCategory(lang, slug);
  if (!found) return {};
  const { node, parent } = found;
  const tagline = node.tagline || parent?.tagline || "";
  const lead = tagline ? `${node.name} — ${tagline}` : node.name;
  return {
    title: parent ? `${node.name} · ${parent.name}` : node.name,
    description: fmt(getDict(lang).listing.meta.category, { lead, n: formatNumber(node.count, lang), days: loc(getSettings().deliveryDays, lang) }),
    alternates: alternates(`/kategoria/${slug}`, lang),
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[lang]/kategoria/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const found = getCategory(lang, slug);
  if (!found) notFound();
  const { node, parent } = found;
  const top = parent ?? node;
  const accent = getCategoryEntries().find((c) => c.slug === top.slug)?.accent;
  const t = getDict(lang).listing;

  const chips = top.children.length
    ? [
        { href: `/kategoria/${top.slug}`, label: fmt(t.categoryAll, { name: top.name }), count: top.count, active: !parent },
        ...top.children.map((s) => ({ href: `/kategoria/${s.slug}`, label: s.name, count: s.count, active: s.slug === node.slug })),
      ]
    : [];

  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={parent ? [{ href: `/kategoria/${parent.slug}`, label: parent.name }, { label: node.name }] : [{ label: node.name }]} />
      <ListingHeader
        tone="tint"
        color={top.color}
        accent={accent}
        icon={<CatalogIcon name={top.icon} />}
        eyebrow={parent?.name}
        title={node.name}
        subtitle={[parent ? node.tagline : top.tagline, plural(lang, node.count, t.count)].filter(Boolean).join(" · ")}
      >
        {chips.length ? (
          <nav aria-label={t.filters.subcategories} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <ul className="flex w-max gap-2 pb-1 md:w-auto md:flex-wrap">
              {chips.map((c) => (
                <li key={c.href}>
                  <Link
                    href={localizeHref(c.href, lang)}
                    aria-current={c.active ? "page" : undefined}
                    className={clsx(
                      "inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border-[1.5px] px-3.5 text-[0.8rem] font-extrabold uppercase tracking-[0.02em] transition",
                      c.active ? "border-ink bg-ink text-white" : "border-transparent bg-[#e9e9e9] text-ink hover:border-ink",
                    )}
                  >
                    {c.label}
                    <span className={clsx("text-xs font-semibold tabular-nums", c.active ? "text-white/80" : "text-ink-soft")}>{formatNumber(c.count, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </ListingHeader>
      <Listing lang={lang} scope={{ kind: "category", slug }} basePath={`/kategoria/${slug}`} searchParams={await searchParams} />
    </div>
  );
}
