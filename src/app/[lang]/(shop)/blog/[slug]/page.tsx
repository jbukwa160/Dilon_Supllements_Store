import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ArrowRight, Languages, ListOrdered, Target } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { isLang, type Lang } from "@/i18n/config";
import { coverImagesFor, getPublishedPost, publishedTranslations, relatedPosts, renamedPostSlug, topicSlug, translationBySlug, type BlogPost } from "@/lib/blog";
import { faq, headings, parseBody, productSkus, readingMinutes, wordCount } from "@/lib/blog-markup";
import { getCardsBySkus } from "@/lib/catalog";
import type { ProductCard } from "@/lib/catalog-types";
import { jsonLd } from "@/lib/html";
import { localizeHref } from "@/lib/links";
import { absoluteUrl, ogLocale } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";
import { BlogBody } from "@/components/blog/BlogBody";
import { BlogCard, PostMeta } from "@/components/blog/BlogCard";
import { BlogCover } from "@/components/blog/BlogCover";
import { ShareButtons } from "@/components/blog/ShareButtons";

const postPath = (slug: string) => `/blog/${slug}`;
const postUrl = (lang: Lang, slug: string) => absoluteUrl(localizeHref(postPath(slug), lang));

/** canonical + hreflang: this post and its published translations (x-default = the Bulgarian version when there is one). */
function postAlternates(post: BlogPost) {
  const versions: Partial<Record<Lang, string>> = { [post.locale]: postUrl(post.locale, post.slug) };
  for (const tr of publishedTranslations(post)) versions[tr.locale] = postUrl(tr.locale, tr.slug);
  return {
    canonical: postUrl(post.locale, post.slug),
    languages: { ...versions, "x-default": versions.bg ?? postUrl(post.locale, post.slug) },
  };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/blog/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang)) return {};
  const post = getPublishedPost(lang, slug);
  if (!post) return {};
  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.excerpt;
  const image = post.cover ? absoluteUrl(post.cover) : coverImagesFor(post.body)[0];
  const alt = postAlternates(post);
  return {
    title,
    description,
    alternates: alt,
    openGraph: {
      type: "article",
      title,
      description,
      url: alt.canonical,
      locale: ogLocale(lang),
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      section: post.topic || undefined,
      images: image ? [image] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export default async function BlogPostPage({ params }: PageProps<"/[lang]/blog/[slug]">) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const post = getPublishedPost(lang, slug);
  if (!post) {
    // A renamed post keeps its old address; the language switcher may also land here with the other language's slug.
    const moved = renamedPostSlug(lang, slug);
    if (moved) permanentRedirect(localizeHref(postPath(moved), lang));
    const translated = translationBySlug(lang, slug);
    if (translated) redirect(localizeHref(postPath(translated), lang));
    notFound();
  }

  const dict = getDict(lang);
  const t = dict.blog;
  const s = getSettings();
  const blocks = parseBody(post.body);
  const cards = getCardsBySkus(lang, productSkus(blocks)).filter((p) => p.inStockAny);
  const products: Record<string, ProductCard> = Object.fromEntries(cards.map((p) => [p.sku, p]));
  const toc = headings(blocks).filter((h) => h.level === 2);
  const questions = faq(blocks);
  const related = relatedPosts(post, 3);
  const images = coverImagesFor(post.body);
  const url = postUrl(lang, post.slug);
  const minutes = readingMinutes(post.body);
  const translations = publishedTranslations(post);
  const other = translations[0];
  const topicHref = post.topic ? `/blog?tema=${topicSlug(post.topic)}` : null;

  const crumbs: Crumb[] = [{ href: "/blog", label: t.title }];
  if (post.topic && topicHref) crumbs.push({ href: topicHref, label: post.topic });
  crumbs.push({ label: post.title });

  const structured: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.metaDescription || post.excerpt,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      inLanguage: lang,
      ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
      dateModified: post.updatedAt,
      ...(post.cover || images.length ? { image: post.cover ? [absoluteUrl(post.cover)] : images } : {}),
      ...(post.topic ? { articleSection: post.topic } : {}),
      wordCount: wordCount(post.body),
      author: { "@type": "Organization", name: s.name, url: absoluteUrl("/") },
      publisher: { "@type": "Organization", name: s.name, url: absoluteUrl("/"), logo: { "@type": "ImageObject", url: absoluteUrl("/icon.svg") } },
      ...(translations.length ? { workTranslation: translations.map((tr) => ({ "@type": "BlogPosting", url: postUrl(tr.locale, tr.slug), inLanguage: tr.locale })) } : {}),
    },
  ];
  if (questions.length) {
    structured.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a } })),
    });
  }

  const tocList = (
    <ol className="space-y-2 text-[0.95rem]">
      {toc.map((h, i) => (
        <li key={h.id} className="flex gap-2">
          <span className="font-bold tabular-nums text-primary">{i + 1}.</span>
          <a href={`#${h.id}`} className="font-medium text-ink-soft hover:text-primary hover:underline">
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="container-shop pb-12">
      <Breadcrumbs items={crumbs} />

      <article>
        <header className="mx-auto max-w-4xl text-center">
          {post.topic && topicHref ? (
            <Link
              href={localizeHref(topicHref, lang)}
              className="inline-block rounded-pill bg-primary-50 px-3.5 py-1 text-sm font-semibold text-primary-700 transition hover:bg-primary hover:text-white"
            >
              {post.topic}
            </Link>
          ) : null}
          <h1 className="h-title mt-4 text-[1.9rem] md:text-[3rem]">{post.title}</h1>
          {post.excerpt ? <p className="mx-auto mt-4 max-w-3xl text-lg text-ink-soft md:text-xl">{post.excerpt}</p> : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span className="text-sm font-semibold">{fmt(t.byTeam, { store: s.name })}</span>
            <PostMeta post={{ publishedAt: post.publishedAt, readingMinutes: minutes }} lang={lang} />
            {other ? (
              <Link
                href={localizeHref(postPath(other.slug), other.locale)}
                hrefLang={other.locale}
                lang={other.locale}
                className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-line bg-surface px-3 py-1 text-sm font-semibold hover:border-ink"
              >
                <Languages className="h-4 w-4 text-primary" aria-hidden /> {t.readOther}
              </Link>
            ) : null}
          </div>
        </header>

        <div className="mx-auto mt-8 aspect-[16/10] max-w-5xl overflow-hidden rounded-xl sm:aspect-[16/9] md:aspect-[21/9]">
          <BlogCover cover={post.cover} theme={post.theme} images={images} title={post.cover ? post.title : ""} size="hero" eager />
        </div>

        <div className="mx-auto mt-8 grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 max-w-3xl">
            {toc.length > 2 ? (
              <details className="mb-6 rounded-lg border border-line bg-surface p-4 lg:hidden">
                <summary className="flex cursor-pointer items-center gap-2 font-bold">
                  <ListOrdered className="h-5 w-5 text-primary" aria-hidden /> {t.toc}
                </summary>
                <div className="mt-3">{tocList}</div>
              </details>
            ) : null}

            <BlogBody blocks={blocks} products={products} lang={lang} />

            <p className="mt-10 rounded-lg border border-line bg-surface p-4 text-sm text-muted">{t.disclaimer}</p>

            <div className="mt-6 border-t border-line pt-6">
              <ShareButtons url={url} title={post.title} />
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              {toc.length > 2 ? (
                <nav aria-label={t.toc} className="rounded-xl border border-line bg-surface p-5">
                  <p className="mb-3 flex items-center gap-2 font-bold">
                    <ListOrdered className="h-5 w-5 text-primary" aria-hidden /> {t.toc}
                  </p>
                  {tocList}
                </nav>
              ) : null}
              <div className="on-dark rounded-xl bg-ink p-5 text-white">
                <Target className="h-7 w-7 text-accent" aria-hidden />
                <p className="mt-2 font-bold">{t.goalsCta.title}</p>
                <p className="mt-1 text-sm text-white/75">{t.goalsCta.text}</p>
                <Link href={localizeHref("/tseli", lang)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                  {t.goalsCta.button} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </article>

      {related.length ? (
        <section className="mt-14" aria-labelledby="related-posts">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 id="related-posts" className="h-display text-[1.375rem] md:text-[2rem]">
              {t.related}
            </h2>
            <Link href={localizeHref("/blog", lang)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">
              {t.allPosts} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <li key={p.id}>
                <BlogCard post={p} lang={lang} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {structured.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(d) }} />
      ))}
    </div>
  );
}
