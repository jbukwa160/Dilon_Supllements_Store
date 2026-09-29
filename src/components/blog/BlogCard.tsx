import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Clock } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { BlogCardData } from "@/lib/blog";
import { formatDate } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { BlogCover } from "./BlogCover";

// Post cards for the blog index, related posts and the home page. No hooks (lang is a prop).

export function formatPostDate(iso: string | null, lang: Lang): string {
  return iso ? formatDate(iso, lang) : "";
}

export function PostMeta({ post, lang, className }: { post: Pick<BlogCardData, "publishedAt" | "readingMinutes">; lang: Lang; className?: string }) {
  const t = getDict(lang).blog;
  return (
    <p className={clsx("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted", className)}>
      {post.publishedAt ? <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt, lang)}</time> : null}
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" aria-hidden /> {fmt(t.readingTime, { n: post.readingMinutes })}
      </span>
    </p>
  );
}

export function BlogCard({
  post,
  lang,
  featured = false,
  eager = false,
  headingLevel = 3,
}: {
  post: BlogCardData;
  lang: Lang;
  featured?: boolean;
  eager?: boolean;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article
      className={clsx(
        "group relative flex h-full overflow-hidden rounded-lg border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] motion-reduce:hover:translate-y-0",
        featured ? "flex-col md:grid md:grid-cols-[1.15fr_1fr]" : "flex-col",
      )}
    >
      <div className={clsx("overflow-hidden", featured ? "aspect-[16/10] md:aspect-auto md:min-h-80" : "aspect-[16/10]")}>
        <div className="h-full w-full transition duration-500 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100">
          <BlogCover cover={post.cover} theme={post.theme} images={post.coverImages} title="" size={featured ? "hero" : "card"} eager={eager} />
        </div>
      </div>
      <div className={clsx("flex flex-1 flex-col", featured ? "p-6 md:p-9" : "p-5")}>
        {post.topic ? (
          <span className="mb-2.5 w-fit rounded-pill bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">{post.topic}</span>
        ) : null}
        <H className={clsx("font-bold leading-snug text-ink text-balance", featured ? "h-title text-[1.6rem] md:text-[2.1rem]" : "text-lg")}>
          <Link href={localizeHref(`/blog/${post.slug}`, lang)} className="after:absolute after:inset-0 after:content-[''] group-hover:text-primary">
            {post.title}
          </Link>
        </H>
        {post.excerpt ? <p className={clsx("mt-2 text-ink-soft", featured ? "text-lg" : "line-clamp-3 text-[0.95rem]")}>{post.excerpt}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <PostMeta post={post} lang={lang} />
          <ArrowRight className="h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-1" aria-hidden />
        </div>
      </div>
    </article>
  );
}
