import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Languages } from "lucide-react";
import { isLang, type Lang } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth";
import { blogEditorData, getPost, sofiaLocal, type BlogPostInput } from "@/lib/blog";
import { getLinkOptions } from "@/lib/admin/link-options";
import { getSettings } from "@/lib/settings";
import { site } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { BlogEditor } from "@/components/admin/BlogEditor";

export const metadata: Metadata = { title: "Нова статия" };

const LANG_NAME: Record<Lang, string> = { bg: "български", en: "английски" };

export default async function NewBlogPostPage({ searchParams }: PageProps<"/admin/blog/nova">) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  // "Добави превод": ?from=<id> starts the other language's version from the original (as a draft).
  const fromId = parseInt(one(sp.from), 10);
  const original = Number.isInteger(fromId) && fromId > 0 ? getPost(fromId) : null;
  const locale: Lang = original ? (original.locale === "bg" ? "en" : "bg") : isLang(one(sp.ezik)) ? (one(sp.ezik) as Lang) : "bg";

  const initial: BlogPostInput = original
    ? {
        locale,
        translationOf: original.translationOf ?? original.id,
        title: original.title,
        slug: "",
        excerpt: original.excerpt,
        body: original.body,
        cover: original.cover,
        theme: original.theme,
        topic: "",
        metaTitle: "",
        metaDescription: "",
        published: false,
        publishedAt: "",
      }
    : {
        locale,
        translationOf: null,
        title: "",
        slug: "",
        excerpt: "",
        body: "",
        cover: "",
        theme: "sunrise",
        topic: "",
        metaTitle: "",
        metaDescription: "",
        published: true,
        publishedAt: "",
      };
  const data = blogEditorData(null);

  return (
    <>
      <Link href="/admin/blog" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички статии
      </Link>
      <PageHeader
        title={original ? `Превод на ${LANG_NAME[locale]}` : "Нова статия"}
        description={
          original
            ? "Текстът на оригинала е копиран като начало — преведете заглавието, описанието и текста, после публикувайте. Продуктите и връзките остават същите."
            : "Напишете заглавие и текст. Статията се появява в сайта, когато е включено „Публикувана“ и я запазите."
        }
      />
      {original ? (
        <p className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-grape-soft px-4 py-3 text-sm font-bold text-grape">
          <Languages className="h-5 w-5" /> Превод на „{original.title}“ ·{" "}
          <Link href={`/admin/blog/${original.id}`} className="underline">
            отвори оригинала
          </Link>
        </p>
      ) : null}
      <BlogEditor
        id={null}
        initial={initial}
        topics={data.topics}
        candidates={data.candidates}
        group={[]}
        isOriginal={false}
        linkOptions={getLinkOptions()}
        siteUrl={site.url}
        storeName={getSettings().name}
        nowLocal={sofiaLocal(new Date().toISOString())}
      />
    </>
  );
}
