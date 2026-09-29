"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Bold,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Languages,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  MousePointerClick,
  Package,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import type { Lang } from "@/i18n/config";
import { findClaims, type ClaimHit } from "@/lib/admin/claims";
import type { ProductCard } from "@/lib/catalog-types";
import type { BlogPostInput } from "@/lib/blog";
import { headings, parseBody, productSkus, readingMinutes, wordCount } from "@/lib/blog-markup";
import { slugify } from "@/lib/slug";
import type { ThemeKey } from "@/lib/settings-types";
import { blogPreviewProductsAction, deleteBlogPostAction, saveBlogPostAction } from "@/app/admin/_actions/blog";
import type { PickerProduct } from "@/app/admin/_actions/product-search";
import { uploadImageAction } from "@/app/admin/_actions/uploads";
import { BlogBody } from "@/components/blog/BlogBody";
import { BlogCover } from "@/components/blog/BlogCover";
import { LinkPicker, type LinkOptions } from "./LinkPicker";
import { ProductSearch } from "./ProductSearch";
import { Card, Field, ImageField, SaveBar, Select, TextArea, TextInput, ThemePicker, Toggle, useEditor } from "./ui";

export type BlogTranslationRef = { id: number; locale: Lang; title: string };
export type BlogGroupMember = BlogTranslationRef & { slug: string; published: boolean };

type Props = {
  id: number | null;
  initial: BlogPostInput;
  /** Topics already used, per language (datalist). */
  topics: Record<Lang, string[]>;
  /** Originals this post may be a translation of, per language the post is written in. */
  candidates: Record<Lang, BlogTranslationRef[]>;
  /** The other versions of this post (existing posts only). */
  group: BlogGroupMember[];
  /** This post has translations pointing to it (it is an original), so it cannot become a translation itself. */
  isOriginal: boolean;
  linkOptions: LinkOptions;
  siteUrl: string;
  storeName: string;
  /** "YYYY-MM-DDTHH:mm" (Bulgarian time) at page render — "scheduled" is decided against it without reading the clock in render. */
  nowLocal: string;
};

type Tool = null | "link" | "products" | "button";

const LANG_NAME: Record<Lang, string> = { bg: "Български", en: "English" };
const LANG_SHORT: Record<Lang, string> = { bg: "БГ", en: "EN" };

/** Wording food supplements may not use (shared claim linter, lib/admin/claims.ts) — a warning only. */
function claimWarnings(...texts: string[]): ClaimHit[] {
  const seen = new Set<string>();
  const out: ClaimHit[] = [];
  for (const t of texts) {
    for (const hit of findClaims(t)) {
      const key = hit.match.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }
  return out.slice(0, 12);
}

export function BlogEditor({ id, initial, topics, candidates, group, isOriginal, linkOptions, siteUrl, storeName, nowLocal }: Props) {
  const router = useRouter();
  const [slugTouched, setSlugTouched] = useState(!!id || !!initial.slug);
  const [saved, setSaved] = useState(id ? { slug: initial.slug, locale: initial.locale } : null);
  const ed = useEditor(initial, async (v) => {
    const r = await saveBlogPostAction(id, v);
    if (r.ok && r.slug) {
      setSaved({ slug: r.slug, locale: v.locale });
      if (!id && r.id) router.replace(`/admin/blog/${r.id}?saved=1`);
      else router.refresh();
    }
    return r;
  });
  const v = ed.value;
  const set = <K extends keyof BlogPostInput>(k: K, val: BlogPostInput[K]) => ed.setValue((cur) => ({ ...cur, [k]: val }));

  const [tab, setTab] = useState<"write" | "preview">("write");
  const [tool, setTool] = useState<Tool>(null);
  const [linkText, setLinkText] = useState("");
  const [uploading, startUpload] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const blocks = useMemo(() => parseBody(v.body), [v.body]);
  const words = wordCount(v.body);
  const h2Count = headings(blocks).filter((h) => h.level === 2).length;
  const internalLinks = (v.body.match(/\]\(\/(?!\/)[^)]*\)/g) ?? []).length + (v.body.match(/\[\[\s*(?:бутон|button)\s*:/gi) ?? []).length;
  const skus = productSkus(blocks);
  const slug = slugify(v.slug || v.title, 80);
  const warnings = useMemo(() => claimWarnings(v.title, v.excerpt, v.body, v.metaTitle, v.metaDescription), [v.title, v.excerpt, v.body, v.metaTitle, v.metaDescription]);
  const otherLang: Lang = v.locale === "bg" ? "en" : "bg";
  const langCandidates = candidates[v.locale];
  const hasOther = group.some((g) => g.locale === otherLang);

  // ---- text tools: they work on the selected text in the editor
  const edit = (fn: (text: string, start: number, end: number) => { text: string; cursor: [number, number] }) => {
    const el = area.current;
    const start = el?.selectionStart ?? v.body.length;
    const end = el?.selectionEnd ?? v.body.length;
    const r = fn(v.body, start, end);
    set("body", r.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.cursor[0], r.cursor[1]);
    });
  };
  const wrap = (mark: string, placeholder: string) =>
    edit((t, s, e) => {
      const inner = t.slice(s, e) || placeholder;
      return { text: t.slice(0, s) + mark + inner + mark + t.slice(e), cursor: [s + mark.length, s + mark.length + inner.length] };
    });
  const linePrefix = (prefix: string, numbered = false) =>
    edit((t, s, e) => {
      const lineStart = t.lastIndexOf("\n", s - 1) + 1;
      const lineEnd = t.indexOf("\n", e) === -1 ? t.length : t.indexOf("\n", e);
      const lines = t.slice(lineStart, lineEnd).split("\n");
      const clean = (l: string) => l.replace(/^(#{1,3}\s+|[-*•]\s+|\d{1,3}[.)]\s+|>\s?)/, "");
      const out = lines.map((l, i) => (numbered ? `${i + 1}. ` : prefix) + clean(l)).join("\n");
      return { text: t.slice(0, lineStart) + out + t.slice(lineEnd), cursor: [lineStart + out.length, lineStart + out.length] };
    });
  /** Inserts a block (products, button, picture) after the paragraph the cursor is in, with empty lines around it. */
  const insertBlock = (block: string) =>
    edit((t, _s, e) => {
      const next = t.indexOf("\n", e);
      const lineEnd = next === -1 ? t.length : next;
      const before = t.slice(0, lineEnd).replace(/\s+$/, "");
      const after = t.slice(lineEnd).replace(/^\s+/, "");
      const text = `${before}${before ? "\n\n" : ""}${block}\n\n${after}`;
      const pos = before.length + (before ? 2 : 0) + block.length + 2;
      return { text: text.replace(/\n+$/, "\n"), cursor: [pos, pos] };
    });
  const selected = () => {
    const el = area.current;
    return el ? v.body.slice(el.selectionStart, el.selectionEnd) : "";
  };

  const uploadImage = (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    startUpload(async () => {
      const r = await uploadImageAction(fd);
      if (r.url) insertBlock(`![${file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/[[\]]/g, "")}](${r.url})`);
      else setNotice(r.error ?? "Качването не успя.");
    });
  };

  const scheduled = v.published && !!v.publishedAt && v.publishedAt > nowLocal;
  const googleTitle = v.metaTitle || v.title;
  const googleDescription = v.metaDescription || v.excerpt;
  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const productsKeyword = v.locale === "en" ? "products" : "продукти";
  const buttonKeyword = v.locale === "en" ? "button" : "бутон";
  const faqHeading = v.locale === "en" ? "Frequently asked questions" : "Често задавани въпроси";

  const checks: { ok: boolean; text: string }[] = [
    { ok: googleTitle.length >= 30 && googleTitle.length <= 60, text: `Заглавие за Google: ${googleTitle.length} знака (най-добре 30–60)` },
    { ok: googleDescription.length >= 120 && googleDescription.length <= 160, text: `Описание за Google: ${googleDescription.length} знака (най-добре 120–160)` },
    { ok: words >= 600, text: `Текст: ${words} думи (над 600 думи се класират по-добре)` },
    { ok: h2Count >= 2, text: `Подзаглавия: ${h2Count} (поне 2 помагат на читателя и на Google)` },
    { ok: internalLinks >= 2, text: `Връзки към страници от магазина: ${internalLinks} (поне 2)` },
    { ok: skus.length > 0, text: skus.length ? `Показани продукти: ${skus.length}` : "Няма показани продукти — добавете с бутона „Продукти“" },
    { ok: !!v.excerpt, text: v.excerpt ? "Има кратко описание" : "Липсва кратко описание" },
  ];

  const changeLocale = (locale: Lang) =>
    ed.setValue((cur) => ({
      ...cur,
      locale,
      // A link to an original in the new language makes no sense.
      translationOf: cur.translationOf && candidates[locale].some((c) => c.id === cur.translationOf) ? cur.translationOf : null,
    }));

  const liveUrl = saved ? `${saved.locale === "en" ? "/en" : ""}/blog/${saved.slug}` : null;

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Език на статията">
              <span className="mr-1 text-sm font-extrabold">Език на статията:</span>
              {(["bg", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={v.locale === l}
                  onClick={() => changeLocale(l)}
                  className={clsx("chip", v.locale === l && "!border-ink !bg-ink !text-white")}
                >
                  <span className="font-black">{LANG_SHORT[l]}</span> {LANG_NAME[l]}
                </button>
              ))}
            </div>
            <Field label="Заглавие на статията">
              <TextInput
                value={v.title}
                onChange={(e) => {
                  const title = e.target.value;
                  ed.setValue((cur) => ({ ...cur, title, slug: slugTouched ? cur.slug : slugify(title, 80) }));
                }}
                placeholder={v.locale === "en" ? "e.g. How to choose a protein powder" : "напр. Как да избереш протеин"}
                maxLength={140}
                lang={v.locale}
                className="!text-xl !font-black"
              />
            </Field>
            <Field
              label="Кратко описание"
              hint={`${v.excerpt.length}/300 · Показва се под заглавието, в списъка със статии и в Google (ако не попълните „Описание за Google“).`}
              className="mt-4"
            >
              <TextArea
                rows={3}
                value={v.excerpt}
                onChange={(e) => set("excerpt", e.target.value)}
                maxLength={300}
                lang={v.locale}
                placeholder="1–2 изречения: за какво е статията и с какво ще помогне."
              />
            </Field>
          </Card>

          <Card
            title="Текст на статията"
            actions={
              <div className="flex rounded-full bg-canvas p-1" role="tablist" aria-label="Режим">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={clsx("rounded-full px-4 py-1.5 text-sm font-extrabold", tab === t ? "bg-white shadow" : "text-ink-soft")}
                  >
                    {t === "write" ? "Писане" : "Преглед"}
                  </button>
                ))}
              </div>
            }
          >
            {tab === "write" ? (
              <>
                <div className="sticky top-14 z-10 -mx-2 mb-2 flex flex-wrap gap-1 rounded-2xl bg-white/95 px-2 py-1.5 backdrop-blur lg:top-0" role="toolbar" aria-label="Оформяне на текста">
                  <ToolButton icon={Heading2} label="Заглавие на раздел" onClick={() => linePrefix("## ")} />
                  <ToolButton icon={Heading3} label="Подзаглавие" onClick={() => linePrefix("### ")} />
                  <ToolButton icon={Bold} label="Удебелен" onClick={() => wrap("**", v.locale === "en" ? "bold text" : "удебелен текст")} />
                  <ToolButton icon={Italic} label="Курсив" onClick={() => wrap("*", v.locale === "en" ? "italic" : "курсив")} />
                  <ToolButton icon={List} label="Списък" onClick={() => linePrefix("- ")} />
                  <ToolButton icon={ListOrdered} label="Номериран списък" onClick={() => linePrefix("", true)} />
                  <ToolButton icon={Lightbulb} label="Съвет (цветна кутия)" onClick={() => linePrefix("> ")} />
                  <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
                  <ToolButton
                    icon={Link2}
                    label="Връзка"
                    active={tool === "link"}
                    onClick={() => {
                      setLinkText(selected());
                      setTool(tool === "link" ? null : "link");
                    }}
                  />
                  <ToolButton icon={Package} label="Продукти" active={tool === "products"} onClick={() => setTool(tool === "products" ? null : "products")} withText />
                  <ToolButton icon={MousePointerClick} label="Бутон" active={tool === "button"} onClick={() => setTool(tool === "button" ? null : "button")} withText />
                  <ToolButton icon={uploading ? LoaderCircle : ImagePlus} label="Снимка" onClick={() => fileInput.current?.click()} withText spin={uploading} />
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(f);
                      e.target.value = "";
                    }}
                  />
                </div>

                {tool === "link" ? (
                  <LinkTool
                    key={linkText}
                    initialText={linkText}
                    options={linkOptions}
                    onInsert={(text, href) => {
                      setTool(null);
                      edit((t, s, e) => {
                        const md = `[${text}](${href})`;
                        return { text: t.slice(0, s) + md + t.slice(e), cursor: [s + md.length, s + md.length] };
                      });
                    }}
                    onClose={() => setTool(null)}
                  />
                ) : tool === "products" ? (
                  <ProductsTool
                    onInsert={(list) => {
                      setTool(null);
                      insertBlock(`[[${productsKeyword}: ${list.join(", ")}]]`);
                    }}
                    onClose={() => setTool(null)}
                  />
                ) : tool === "button" ? (
                  <ButtonTool
                    options={linkOptions}
                    onInsert={(label, href) => {
                      setTool(null);
                      insertBlock(`[[${buttonKeyword}: ${label} | ${href}]]`);
                    }}
                    onClose={() => setTool(null)}
                  />
                ) : null}
                {notice ? <p className="mb-2 text-sm font-bold text-brand">{notice}</p> : null}

                <textarea
                  ref={area}
                  value={v.body}
                  onChange={(e) => set("body", e.target.value)}
                  rows={26}
                  lang={v.locale}
                  className="field min-h-[28rem] resize-y font-[inherit] text-[1rem] leading-relaxed"
                  aria-label="Текст на статията"
                  placeholder={"Започнете с 2–3 изречения, които казват за какво е статията.\n\n## Първи раздел\n\nТекст…"}
                />
                <p className="mt-2 text-sm text-muted">
                  {words} думи · около {readingMinutes(v.body)} мин. четене · Празен ред започва нов абзац. Маркирайте текст и натиснете бутон горе, за да го оформите.
                </p>
                <details className="mt-3 rounded-2xl bg-canvas p-4 text-sm">
                  <summary className="cursor-pointer font-extrabold">Как се оформя текстът?</summary>
                  <ul className="mt-2 space-y-1 text-ink-soft">
                    <li>
                      <code>## Заглавие</code> — раздел в статията; <code>### Подзаглавие</code> — по-малко заглавие
                    </li>
                    <li>
                      <code>**удебелен**</code>, <code>*курсив*</code>, <code>[текст](/kategoria/proteini)</code> — връзка (на английски страници адресът получава
                      „/en“ автоматично)
                    </li>
                    <li>
                      <code>- точка</code> — списък; <code>1. стъпка</code> — номериран списък; <code>&gt; Съвет: …</code> — цветна кутия със съвет
                    </li>
                    <li>
                      <code>[[{productsKeyword}: Dilon-37265, Dilon-52445]]</code> — карти на продукти с цена и бутон за количката
                    </li>
                    <li>
                      <code>[[{buttonKeyword}: Разгледай протеините | /kategoria/proteini]]</code> — голям бутон
                    </li>
                    <li>Раздел „## {faqHeading}“ с въпроси като „### …?“ се показва и в Google като въпроси и отговори.</li>
                  </ul>
                </details>
              </>
            ) : (
              <Preview title={v.title} excerpt={v.excerpt} body={v.body} skus={skus} lang={v.locale} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Публикуване">
            <Toggle
              checked={v.published}
              onChange={(x) => set("published", x)}
              label={v.published ? (scheduled ? "Насрочена" : "Публикувана") : "Чернова"}
              description={v.published ? "Статията се вижда в сайта от датата и часа по-долу." : "Вижда се само тук, докато не я публикувате."}
            />
            <Field
              label="Дата и час на публикуване"
              group
              hint={scheduled ? "Бъдеща дата: статията ще се покаже автоматично тогава (българско време)." : "Празно = веднага при запазване."}
              className="mt-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={v.publishedAt}
                  onChange={(e) => set("publishedAt", e.target.value)}
                  aria-label="Дата и час на публикуване"
                  className="field w-auto"
                />
                {v.publishedAt ? (
                  <button type="button" onClick={() => set("publishedAt", "")} className="btn btn-ghost h-10 px-3 text-sm">
                    <X className="h-4 w-4" /> Изчисти
                  </button>
                ) : null}
              </div>
            </Field>
            {id && liveUrl && v.published && !scheduled && !ed.dirty ? (
              <a href={liveUrl} target="_blank" rel="noopener" className="btn btn-ghost mt-4 h-10 w-full px-4 text-sm">
                <ExternalLink className="h-4 w-4" /> Виж статията в сайта
              </a>
            ) : null}
          </Card>

          <Card title="Превод" description="Една статия може да има версия на български и на английски. Google показва на всеки читател неговата версия.">
            {group.length ? (
              <ul className="mb-3 space-y-2">
                {group.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2 text-sm">
                    <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-black text-white">{LANG_SHORT[g.locale]}</span>
                    <Link href={`/admin/blog/${g.id}`} className="min-w-0 flex-1 truncate font-bold hover:text-brand">
                      {g.title}
                    </Link>
                    {!g.published ? <span className="text-xs font-bold text-muted">чернова</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {isOriginal ? (
              <p className="text-sm text-muted">Това е оригиналът — преводите сочат към него.</p>
            ) : (
              <Field label={`Превод на статия (${LANG_NAME[otherLang].toLowerCase()})`} hint="Изберете оригинала, ако тази статия е негов превод.">
                <Select value={v.translationOf ?? ""} onChange={(e) => set("translationOf", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Самостоятелна статия —</option>
                  {langCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {LANG_SHORT[c.locale]} · {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {id && !hasOther && !v.translationOf ? (
              <Link href={`/admin/blog/nova?from=${id}`} className="btn btn-ghost mt-4 h-10 w-full px-4 text-sm">
                <Languages className="h-4 w-4" /> Добави превод на {otherLang === "en" ? "английски" : "български"}
              </Link>
            ) : null}
          </Card>

          <Card title="Корица" description="Снимка най-горе в статията и в списъка. Ако няма снимка, се показват продуктите от статията на цветен фон.">
            <ImageField value={v.cover} onChange={(x) => set("cover", x)} recommended="Препоръчителен размер: 1600 × 900 px" compact />
            {!v.cover ? (
              <div className="mt-4">
                <span className="mb-2 block text-sm font-extrabold">Цвят на фона</span>
                <ThemePicker value={v.theme as ThemeKey} onChange={(t) => set("theme", t)} />
                <div className="shop-theme mt-3 aspect-[16/9] overflow-hidden rounded-2xl">
                  <CoverPreview theme={v.theme as ThemeKey} skus={skus} title={v.title} lang={v.locale} />
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="Тема (рубрика)">
            <TextInput
              list="blog-topics"
              value={v.topic}
              onChange={(e) => set("topic", e.target.value)}
              maxLength={40}
              placeholder={v.locale === "en" ? "e.g. Sports nutrition" : "напр. Спортно хранене"}
              aria-label="Тема"
            />
            <datalist id="blog-topics">
              {topics[v.locale].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="mt-1.5 text-sm text-muted">Статиите с еднаква тема се групират в блога (отделно за всеки език).</p>
          </Card>

          <Card title="Google (SEO)">
            <div className="rounded-2xl border border-line bg-white p-4" aria-label="Как ще изглежда в Google">
              <div className="truncate text-xs text-[#4d5156]">
                {host} {v.locale === "en" ? "› en " : ""}› blog › {slug || "…"}
              </div>
              <div className="mt-0.5 line-clamp-2 text-lg leading-snug text-[#1a0dab]">
                {googleTitle || "Заглавие на статията"} | {storeName}
              </div>
              <div className="mt-1 line-clamp-3 text-sm text-[#4d5156]">{googleDescription || "Описание на статията…"}</div>
            </div>
            <Field
              label="Адрес на страницата"
              className="mt-4"
              hint={id && saved && slug !== saved.slug ? "Старият адрес ще пренасочва автоматично към новия." : "Латински букви, думите се разделят с тире."}
            >
              <div className="flex items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
                <span className="pl-3 text-sm font-bold text-muted">{v.locale === "en" ? "/en" : ""}/blog/</span>
                <input
                  value={v.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value);
                  }}
                  onBlur={() => set("slug", slugify(v.slug || v.title, 80))}
                  className="w-full bg-transparent px-1 py-2.5 outline-none focus-visible:outline-none"
                />
              </div>
            </Field>
            <Field label="Заглавие за Google" hint={`${googleTitle.length}/60 · Празно = заглавието на статията.`} className="mt-4">
              <TextInput value={v.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} maxLength={90} placeholder={v.title} lang={v.locale} />
            </Field>
            <Field label="Описание за Google" hint={`${googleDescription.length}/160 · Празно = краткото описание.`} className="mt-4">
              <TextArea rows={3} value={v.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} maxLength={300} placeholder={v.excerpt} lang={v.locale} />
            </Field>
            <ul className="mt-5 space-y-2 text-sm">
              {checks.map((c) => (
                <li key={c.text} className="flex items-start gap-2">
                  {c.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#c98a00]" />}
                  <span className={c.ok ? "text-ink-soft" : "font-bold"}>{c.text}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="border-2 !border-sun bg-sun-soft/40">
            <p className="flex items-center gap-2 text-lg font-black">
              <ShieldAlert className="h-5 w-5 text-[#c98a00]" /> Здравни твърдения — правила
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
              <li>
                Само <b>одобрените от ЕС</b> здравни твърдения (Регламент 1924/2006, списък 432/2012) с точната формулировка, напр. „Витамин D допринася за
                поддържането на нормални кости“.
              </li>
              <li>
                <b>Забранено:</b> че добавка лекува, предотвратява или предпазва от болест; „детокс“, „изгаря мазнини“, „клинично доказано“, „без странични
                ефекти“, препоръки от лекари, обещания за отслабване с X кг.
              </li>
              <li>До твърдението: значението на разнообразното хранене и здравословния начин на живот и нужната дневна доза.</li>
              <li>„Еко“, „зелен“, „био“ — само при сертифициран продукт.</li>
            </ul>
            {warnings.length ? (
              <div className="mt-3 rounded-2xl bg-white p-3 text-sm" role="status">
                <p className="font-extrabold text-brand">Проверете тези думи в текста:</p>
                <ul className="mt-1.5 space-y-1">
                  {warnings.map((w) => (
                    <li key={w.match}>
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 font-bold text-brand">{w.match}</span> <span className="text-ink-soft">{w.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-muted">Само предупреждение — ако употребата е коректна (напр. „не лекува“), може да я оставите.</p>
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-mint">
                <CircleCheck className="h-4 w-4" /> Не са открити рискови думи.
              </p>
            )}
          </Card>

          {id ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (!confirm(`Да изтрия ли статията „${v.title}“? Това не може да се върне.`)) return;
                startDelete(async () => {
                  const r = await deleteBlogPostAction(id);
                  if (r.ok) router.push("/admin/blog");
                  else setNotice(r.error ?? "Грешка");
                });
              }}
              className="btn btn-ghost h-11 w-full px-4 text-brand"
            >
              {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Изтрий статията
            </button>
          ) : null}
        </div>
      </div>

      <SaveBar
        dirty={ed.dirty || !id}
        pending={ed.pending}
        status={ed.status}
        onSave={ed.submit}
        onReset={id ? ed.reset : undefined}
        saveLabel={id ? "Запази промените" : v.published ? "Публикувай статията" : "Запази черновата"}
      />
    </>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  withText = false,
  spin = false,
}: {
  icon: typeof Bold;
  label: string;
  onClick: () => void;
  active?: boolean;
  withText?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={withText ? undefined : label}
      aria-pressed={active || undefined}
      className={clsx("flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-extrabold transition", active ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas hover:text-ink")}
    >
      <Icon className={clsx("h-[1.1rem] w-[1.1rem]", spin && "animate-spin")} />
      {withText ? label : null}
    </button>
  );
}

function ToolPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border-2 border-sky/40 bg-sky-soft/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-black">{title}</p>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white" aria-label="Затвори">
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

function LinkTool({ initialText, options, onInsert, onClose }: { initialText: string; options: LinkOptions; onInsert: (text: string, href: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initialText.replace(/\n/g, " "));
  const [href, setHref] = useState("");
  return (
    <ToolPanel title="Връзка" onClose={onClose}>
      <Field label="Текст на връзката">
        <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="напр. суроватъчния протеин" />
      </Field>
      <Field label="Води към" group className="mt-3">
        <LinkPicker value={href} onChange={setHref} options={options} allowEmpty={false} />
      </Field>
      <button type="button" disabled={!text.trim() || !href} onClick={() => onInsert(text.trim().replace(/[[\]]/g, ""), href)} className="btn btn-primary mt-3 h-10 px-5 text-sm !shadow-none">
        Вмъкни връзката
      </button>
    </ToolPanel>
  );
}

function ButtonTool({ options, onInsert, onClose }: { options: LinkOptions; onInsert: (label: string, href: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  return (
    <ToolPanel title="Голям бутон" onClose={onClose}>
      <Field label="Надпис на бутона">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="напр. Разгледай всички протеини" maxLength={60} />
      </Field>
      <Field label="Води към" group className="mt-3">
        <LinkPicker value={href} onChange={setHref} options={options} allowEmpty={false} />
      </Field>
      <button type="button" disabled={!label.trim() || !href} onClick={() => onInsert(label.trim().replace(/[|[\]]/g, ""), href)} className="btn btn-primary mt-3 h-10 px-5 text-sm !shadow-none">
        Вмъкни бутона
      </button>
    </ToolPanel>
  );
}

function ProductsTool({ onInsert, onClose }: { onInsert: (skus: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<PickerProduct[]>([]);
  const add = (p: PickerProduct) => setPicked((cur) => (cur.some((x) => x.sku === p.sku) || cur.length >= 6 ? cur : [...cur, p]));
  const remove = (sku: string) => setPicked((cur) => cur.filter((x) => x.sku !== sku));
  return (
    <ToolPanel title="Покажи продукти в статията" onClose={onClose}>
      <ProductSearch onAdd={add} isAdded={(sku) => picked.some((x) => x.sku === sku)} addLabel="Избери" />
      {picked.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {picked.map((p) => (
            <span key={p.sku} className="flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-sm font-bold">
              <span className="max-w-48 truncate">{p.name}</span>
              <button type="button" onClick={() => remove(p.sku)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-canvas" aria-label={`Махни ${p.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <button type="button" disabled={!picked.length} onClick={() => onInsert(picked.map((p) => p.sku))} className="btn btn-primary mt-3 h-10 px-5 text-sm !shadow-none">
        <Plus className="h-4 w-4" /> Вмъкни {picked.length ? `${picked.length} ${picked.length === 1 ? "продукт" : "продукта"}` : "продуктите"}
      </button>
      <p className="mt-2 text-xs text-muted">Изберете 2–4 продукта (до 6). Изчерпаните и скритите продукти не се показват в сайта.</p>
    </ToolPanel>
  );
}

function useProductCards(skus: string[], lang: Lang) {
  const key = `${lang}|${skus.join(",")}`;
  const [cards, setCards] = useState<{ key: string; cards: Record<string, ProductCard> }>({ key: "", cards: {} });
  useEffect(() => {
    const [l, list] = key.split("|");
    if (!list) return;
    const t = setTimeout(async () => {
      try {
        setCards({ key, cards: await blogPreviewProductsAction(list.split(","), l) });
      } catch {
        // The preview just stays without cards.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [key]);
  return cards.key === key ? cards.cards : {};
}

function Preview({ title, excerpt, body, skus, lang }: { title: string; excerpt: string; body: string; skus: string[]; lang: Lang }) {
  const cards = useProductCards(skus, lang);
  const blocks = useMemo(() => parseBody(body), [body]);
  return (
    <div className="shop-theme mx-auto max-w-3xl rounded-2xl bg-canvas p-4 md:p-6" lang={lang}>
      <h1 className="h-title text-[2rem]">{title || "Заглавие на статията"}</h1>
      {excerpt ? <p className="mt-3 text-lg text-ink-soft">{excerpt}</p> : null}
      <div className="pointer-events-none">
        <BlogBody blocks={blocks} products={cards} lang={lang} />
      </div>
    </div>
  );
}

function CoverPreview({ theme, skus, title, lang }: { theme: ThemeKey; skus: string[]; title: string; lang: Lang }) {
  const cards = useProductCards(skus.slice(0, 6), lang);
  const images = skus.map((s) => cards[s]?.image).filter((x): x is string => !!x).slice(0, 3);
  return <BlogCover cover="" theme={theme} images={images} title={title} />;
}
