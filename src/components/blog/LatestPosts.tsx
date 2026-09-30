// Home page section "От блога" / "From the blog": the latest published posts of the page's language (nothing when
// there are none). Server Component.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { latestPosts } from "@/lib/blog";
import { localizeHref } from "@/lib/links";
import { BlogCard } from "./BlogCard";

export async function LatestPosts({ lang }: { lang: Lang }) {
  const posts = latestPosts(lang, 3);
  if (!posts.length) return null;
  const t = getDict(lang).blog;
  return (
    <section className="container-shop py-8 md:py-10" aria-labelledby="latest-posts-title">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="latest-posts-title" className="h-display text-[1.375rem] md:text-[2rem]">
            {t.home.title}
          </h2>
          <p className="mt-1 text-muted">{t.home.subtitle}</p>
        </div>
        <Link href={localizeHref("/blog", lang)} className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-extrabold uppercase tracking-[0.02em] text-ink hover:text-primary hover:underline">
          {t.allPosts} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ul className="scroll-row auto-cols-[82%] sm:auto-cols-[46%] md:grid-flow-row md:auto-cols-auto md:grid-cols-3 md:overflow-visible">
        {posts.map((p) => (
          <li key={p.id} className="min-w-0">
            <BlogCard post={p} lang={lang} />
          </li>
        ))}
      </ul>
    </section>
  );
}
