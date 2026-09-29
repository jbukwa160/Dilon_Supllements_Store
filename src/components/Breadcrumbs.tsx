"use client";

import Link from "next/link";
import { ChevronRight, House } from "lucide-react";
import { useDict, useLang } from "@/i18n/client";
import { jsonLd } from "@/lib/html";
import { localizeHref } from "@/lib/links";
import { absoluteUrl } from "@/lib/seo";

export type Crumb = { label: string; href?: string };

/**
 * "Начало › Протеини › Суроватъчен протеин" + BreadcrumbList structured data. The home crumb is added here.
 * `href`s are language-neutral paths ("/kategoria/proteini"); they get "/en" on English pages. The last crumb is
 * the current page (not a link). Each link is 40 px tall (tap target); the nav's own padding is small to compensate.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const lang = useLang();
  const dict = useDict();
  const all: Crumb[] = [{ label: dict.common.home, href: "/" }, ...items];
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: absoluteUrl(localizeHref(c.href, lang)) } : {}),
    })),
  };
  return (
    <nav aria-label={dict.common.breadcrumbs} className="py-1 text-sm font-medium text-muted md:py-2">
      <ol className="flex flex-wrap items-center gap-x-1">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              {c.href && !last ? (
                <Link href={localizeHref(c.href, lang)} className="flex min-h-10 items-center gap-1 rounded-sm hover:text-primary hover:underline">
                  {i === 0 ? <House className="h-3.5 w-3.5" aria-hidden /> : null}
                  {c.label}
                </Link>
              ) : (
                <span className="line-clamp-1 text-ink" aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
    </nav>
  );
}
