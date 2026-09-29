import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { isLang, type Lang } from "@/i18n/config";
import { listPublished } from "@/lib/blog";
import { jsonLd } from "@/lib/html";
import { localizeHref } from "@/lib/links";
import { absoluteUrl, alternates, ogLocale } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";
import { BlogCard } from "@/components/blog/BlogCard";

type SP = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function read(lang: Lang, sp: SP) {
  const tema = one(sp.tema).slice(0, 60) || null;
  const page = Math.max(1, Math.min(500, parseInt(one(sp.page), 10) || 1));
  return listPublished(lang, { topic: tema, page });
}

/** Language-neutral address of a blog list page ("/blog?tema=x&page=2"). */
function listHref(topic: string | null, page = 1): string {
  const q = new URLSearchParams();
  if (topic) q.set("tema", topic);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/blog?${s}` : "/blog";
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[lang]/blog">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang).blog;
  const data = read(lang, await searchParams);
  const store = getSettings().name;
  const title = data.topic ? fmt(t.topicMetaTitle, { topic: data.topic.name }) : t.metaTitle;
  const description = data.topic ? fmt(t.topicMetaDescription, { topic: data.topic.name, store }) : t.metaDescription;
  const path = listHref(data.topic?.slug ?? null, data.page);
  // Topics differ per language, so only the blog's first page has a counterpart in the other language.
  const alt = path === "/blog" ? alternates("/blog", lang) : { canonical: absoluteUrl(localizeHref(path, lang)) };
  return {
    title,
    description,
    alternates: alt,
    openGraph: { title, description, type: "website", url: alt.canonical, locale: ogLocale(lang) },
  };
}

export default async function BlogIndex({ params, searchParams }: PageProps<"/[lang]/blog">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = getDict(lang);
  const t = dict.blog;
  const data = read(lang, await searchParams);
  const { items, topic, topics, page, pageCount } = data;
  const store = getSettings().name;
  const featured = page === 1 && !topic ? items[0] : undefined;
  const rest = featured ? items.slice(1) : items;
  const crumbs: Crumb[] = topic ? [{ href: "/blog", label: t.title }, { label: topic.name }] : [{ label: t.title }];
  const href = (topicSlug: string | null, n = 1) => localizeHref(listHref(topicSlug, n), lang);

  const structured = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: fmt(t.blogOf, { store }),
    url: absoluteUrl(localizeHref("/blog", lang)),
    inLanguage: lang,
    blogPost: items.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: absoluteUrl(localizeHref(`/blog/${p.slug}`, lang)),
      ...(p.publishedAt ? { datePublished: p.publishedAt } : {}),
    })),
  };

  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={crumbs} />

      <header className="mb-6 max-w-3xl md:mb-8">
        <h1 className="h-display text-[2rem] md:text-5xl">{topic ? topic.name : t.title}</h1>
        <p className="mt-3 text-lg text-ink-soft">{topic ? fmt(t.topicIntro, { topic: topic.name }) : t.intro}</p>
      </header>

      {topics.length > 1 ? (
        <nav aria-label={t.topics} className="-mx-4 mb-8 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex w-max gap-2 md:w-auto md:flex-wrap">
            <li>
              <Link href={href(null)} className="chip whitespace-nowrap" aria-current={!topic ? "page" : undefined}>
                {t.all}
              </Link>
            </li>
            {topics.map((x) => (
              <li key={x.slug}>
                <Link href={href(x.slug)} className="chip whitespace-nowrap" aria-current={topic?.slug === x.slug ? "page" : undefined}>
                  {x.name} <span className="text-muted">{x.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {items.length ? (
        <>
          {featured ? (
            <div className="mb-6">
              <BlogCard post={featured} lang={lang} featured eager headingLevel={2} />
            </div>
          ) : null}
          {rest.length ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p, i) => (
                <li key={p.id}>
                  <BlogCard post={p} lang={lang} eager={!featured && i < 3} headingLevel={2} />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface p-10 text-center font-semibold text-ink-soft">{topic ? t.emptyTopic : t.empty}</p>
      )}

      {pageCount > 1 ? (
        <nav aria-label={t.pages} className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {page > 1 ? (
            <Link href={href(topic?.slug ?? null, page - 1)} className="btn btn-ghost h-11 px-4" rel="prev">
              <ArrowLeft className="h-4 w-4" aria-hidden /> {t.prev}
            </Link>
          ) : null}
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href(topic?.slug ?? null, n)}
              aria-current={n === page ? "page" : undefined}
              aria-label={fmt(t.pageN, { n })}
              className={clsx(
                "grid h-11 min-w-11 place-items-center rounded-pill px-3 font-semibold transition",
                n === page ? "bg-ink text-white" : "hover:bg-surface",
              )}
            >
              {n}
            </Link>
          ))}
          {page < pageCount ? (
            <Link href={href(topic?.slug ?? null, page + 1)} className="btn btn-ghost h-11 px-4" rel="next">
              {t.next} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </nav>
      ) : null}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
    </div>
  );
}
