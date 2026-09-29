import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getBrands } from "@/lib/catalog";
import type { BrandInfo } from "@/lib/catalog-types";
import { formatNumber, plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { alternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ListingHeader } from "@/components/listing/ListingHeader";

// Brands A–Z: the most stocked brands as tiles, a letter jump bar, then every brand grouped by its first letter
// (Latin A–Z, then Cyrillic А–Я, then digits and symbols).

// Static; refreshed after admin saves and catalogue imports (revalidatePath), at the latest hourly.
export const revalidate = 3600;

const DIGITS = "0–9";

function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) || /[А-ЯЁ]/.test(c) ? c : DIGITS;
}

function groupOrder(k: string): number {
  if (/[A-Z]/.test(k)) return 0;
  if (k !== DIGITS) return 1;
  return 2;
}

export async function generateMetadata({ params }: PageProps<"/[lang]/marki">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).listing;
  return { title: t.titles.brands, description: t.meta.brands, alternates: alternates("/marki", lang) };
}

export default async function BrandsPage({ params }: PageProps<"/[lang]/marki">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = getDict(lang);
  const t = dict.listing;
  const brands = getBrands().filter((b) => b.count > 0);
  const groups = new Map<string, BrandInfo[]>();
  for (const b of brands) {
    const k = letterOf(b.name);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const letters = [...groups.keys()].sort((a, b) => groupOrder(a) - groupOrder(b) || a.localeCompare(b, "bg"));
  const top = [...brands].sort((a, b) => b.inStock - a.inStock || b.count - a.count).slice(0, 12);
  const brandHref = (slug: string) => localizeHref(`/marka/${slug}`, lang);

  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={[{ label: t.titles.brands }]} />
      <ListingHeader title={t.titles.brands} subtitle={fmt(t.intro.brands, { n: formatNumber(brands.length, lang) })} />

      {top.length ? (
        <section aria-labelledby="brands-top" className="mb-10">
          <h2 id="brands-top" className="mb-4 text-lg font-bold">
            {t.brandsTop}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {top.map((b) => (
              <li key={b.slug}>
                <Link
                  href={brandHref(b.slug)}
                  className="flex h-full flex-col justify-center gap-1 rounded-lg border border-line bg-surface px-4 py-4 text-center transition hover:-translate-y-0.5 hover:border-ink hover:shadow-lift"
                >
                  <span className="line-clamp-2 font-bold leading-snug">{b.name}</span>
                  <span className="text-sm text-muted">{plural(lang, b.count, t.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label={t.brandsAz} className="mb-8 rounded-lg border border-line bg-surface p-2">
        <ul className="flex flex-wrap gap-1">
          {letters.map((k) => (
            <li key={k}>
              <a
                href={`#brands-${k}`}
                aria-label={fmt(t.brandsJump, { letter: k })}
                className="grid h-10 min-w-10 place-items-center rounded-sm px-2 text-sm font-bold transition hover:bg-ink hover:text-white"
              >
                {k}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-8">
        {letters.map((k) => (
          <section key={k} id={`brands-${k}`} aria-labelledby={`brands-h-${k}`} className="scroll-mt-20">
            <h2 id={`brands-h-${k}`} className="h-display mb-3 border-b border-line pb-2 text-2xl text-primary">
              {k}
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {groups.get(k)!.map((b) => (
                <li key={b.slug} className="min-w-0">
                  <Link href={brandHref(b.slug)} className="flex min-h-10 items-center justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-surface">
                    <span className="truncate font-medium">{b.name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">{formatNumber(b.count, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
