import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { ExternalLink, Languages, Pencil, Plus } from "lucide-react";
import { isLang, type Lang } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth";
import { LOCALE_LABEL, listAllPosts, postCounts } from "@/lib/blog";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { BlogCover } from "@/components/blog/BlogCover";

export const metadata: Metadata = { title: "Блог" };

export default async function AdminBlogPage({ searchParams }: PageProps<"/admin/blog">) {
  await requireAdmin();
  const sp = await searchParams;
  const langParam = Array.isArray(sp.ezik) ? sp.ezik[0] : sp.ezik;
  const locale: Lang | null = isLang(langParam) ? langParam : null;
  const posts = listAllPosts(locale);
  const counts = postCounts();
  const now = new Date().toISOString();
  const live = posts.filter((p) => p.published && p.publishedAt && p.publishedAt <= now).length;
  const chips: { key: Lang | null; label: string; count: number }[] = [
    { key: null, label: "Всички", count: counts.bg + counts.en },
    { key: "bg", label: "БГ", count: counts.bg },
    { key: "en", label: "EN", count: counts.en },
  ];

  return (
    <>
      <PageHeader
        title="Блог"
        description="Полезните статии водят посетители от Google. Пишете по същество, с подзаглавия и връзки към категории и продукти. Българските и английските статии са отделни — свържете превода с оригинала."
        actions={
          <Link href={locale === "en" ? "/admin/blog/nova?ezik=en" : "/admin/blog/nova"} className="btn btn-primary h-12 px-6">
            <Plus className="h-5 w-5" strokeWidth={3} /> Нова статия
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.key ? `/admin/blog?ezik=${c.key}` : "/admin/blog"}
            aria-current={locale === c.key ? "page" : undefined}
            className={clsx("chip", locale === c.key && "!border-ink !bg-ink !text-white")}
          >
            {c.label} <span className="opacity-70">{c.count}</span>
          </Link>
        ))}
        <span className="ml-auto text-sm font-bold text-muted">
          {live} публикувани · {posts.length - live} чернови или насрочени
        </span>
      </div>

      {posts.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
          {posts.map((p) => {
            const scheduled = p.published && !!p.publishedAt && p.publishedAt > now;
            const isLive = p.published && !scheduled;
            const other: Lang = p.locale === "bg" ? "en" : "bg";
            const translation = p.translations.find((t) => t.locale === other);
            const siteHref = `${p.locale === "en" ? "/en" : ""}/blog/${p.slug}`;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="shop-theme h-16 w-24 shrink-0 overflow-hidden rounded-xl">
                  <BlogCover cover={p.cover} theme={p.theme} images={p.coverImages.slice(0, 1)} title="" />
                </div>
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded-md bg-ink px-1.5 py-0.5 text-[0.7rem] font-black text-white" title={p.locale === "bg" ? "Български" : "English"}>
                      {LOCALE_LABEL[p.locale]}
                    </span>
                    <Link href={`/admin/blog/${p.id}`} className="line-clamp-2 font-black leading-snug hover:text-brand">
                      {p.title}
                    </Link>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-muted">
                    {isLive ? (
                      <span className="rounded-full bg-mint-soft px-2 py-0.5 text-mint">Публикувана</span>
                    ) : scheduled ? (
                      <span className="rounded-full bg-sky-soft px-2 py-0.5 text-sky">Насрочена за {formatDateTime(p.publishedAt!, "bg")}</span>
                    ) : (
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-ink-soft">Чернова</span>
                    )}
                    {p.topic ? <span>{p.topic}</span> : null}
                    {p.publishedAt && !scheduled ? <span>· {formatDate(p.publishedAt, "bg")}</span> : null}
                    <span>· {p.readingMinutes} мин. четене</span>
                    {translation ? (
                      <Link href={`/admin/blog/${translation.id}`} className="inline-flex items-center gap-1 rounded-full bg-grape-soft px-2 py-0.5 text-grape hover:underline">
                        <Languages className="h-3 w-3" /> {LOCALE_LABEL[translation.locale]} превод
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!translation && !p.translationOf ? (
                    <Link href={`/admin/blog/nova?from=${p.id}`} className="btn btn-ghost h-10 px-4 text-sm" title={`Създай ${other === "en" ? "английска" : "българска"} версия`}>
                      <Languages className="h-4 w-4" /> Добави превод
                    </Link>
                  ) : null}
                  <Link href={`/admin/blog/${p.id}`} className="btn btn-ghost h-10 px-4 text-sm">
                    <Pencil className="h-4 w-4" /> Редактирай
                  </Link>
                  {isLive ? (
                    <a href={siteHref} target="_blank" rel="noopener" className="btn btn-ghost h-10 w-10 !px-0" aria-label={`Виж „${p.title}“ в сайта`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-3xl border border-dashed border-line bg-white p-10 text-center font-bold text-ink-soft">
          {locale ? "Няма статии на този език." : "Все още няма статии. Натиснете „Нова статия“."}
        </div>
      )}
    </>
  );
}
