import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { blogEditorData, getPost, sofiaLocal } from "@/lib/blog";
import { getLinkOptions } from "@/lib/admin/link-options";
import { getSettings } from "@/lib/settings";
import { site } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { BlogEditor } from "@/components/admin/BlogEditor";

export const metadata: Metadata = { title: "Редактиране на статия" };

export default async function EditBlogPostPage({ params, searchParams }: PageProps<"/admin/blog/[id]">) {
  await requireAdmin();
  const id = parseInt((await params).id, 10);
  const post = Number.isInteger(id) && id > 0 ? getPost(id) : null;
  if (!post) notFound();
  const justCreated = (await searchParams).saved === "1";
  const data = blogEditorData(post);
  return (
    <>
      <Link href={`/admin/blog?ezik=${post.locale}`} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички статии
      </Link>
      <PageHeader title="Редактиране на статия" />
      {justCreated ? (
        <p className="mb-5 flex items-center gap-2 rounded-2xl bg-mint-soft px-4 py-3 font-bold text-mint" role="status">
          <Check className="h-5 w-5" strokeWidth={3} /> Статията е запазена.
        </p>
      ) : null}
      <BlogEditor
        key={post.id}
        id={post.id}
        initial={{
          locale: post.locale,
          translationOf: post.translationOf,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          body: post.body,
          cover: post.cover,
          theme: post.theme,
          topic: post.topic,
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          published: post.published,
          publishedAt: sofiaLocal(post.publishedAt),
        }}
        topics={data.topics}
        candidates={data.candidates}
        group={data.group}
        isOriginal={data.isOriginal}
        linkOptions={getLinkOptions()}
        siteUrl={site.url}
        storeName={getSettings().name}
        nowLocal={sofiaLocal(new Date().toISOString())}
      />
    </>
  );
}
