import "server-only";
import { isLang, LANGS, type Lang } from "@/i18n/config";
import { catalogDb, storeDb } from "./db";
import { parseBody, productSkus, readingMinutes } from "./blog-markup";
import { THEMES, type ThemeKey } from "./settings-types";
import { slugify } from "./slug";
import { SEED_POSTS } from "./blog-seed";

// The blog (/blog, /en/blog). Bulgarian and English posts are separate rows (column `locale`, slug unique per
// language). A translation points to its original with `translation_of`; the original and its translations form
// a "group" (root = translation_of ?? id) with at most one post per language — used for hreflang and the
// language switcher. Links inside posts are language-neutral (see blog-markup.ts).

export type BlogPost = {
  id: number;
  locale: Lang;
  /** Id of the original post this one translates (null = an original). */
  translationOf: number | null;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover: string;
  theme: ThemeKey;
  topic: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A post for lists and cards: no body, but reading time and product pictures for the cover. */
export type BlogCardData = Omit<BlogPost, "body"> & { readingMinutes: number; coverImages: string[] };

type Row = {
  id: number;
  locale: string;
  translation_of: number | null;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover: string;
  theme: string;
  topic: string;
  meta_title: string;
  meta_description: string;
  published: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export const BLOG_PER_PAGE = 9;
export const LOCALE_LABEL: Record<Lang, string> = { bg: "БГ", en: "EN" };

function toPost(r: Row): BlogPost {
  return {
    id: r.id,
    locale: isLang(r.locale) ? r.locale : "bg",
    translationOf: r.translation_of,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    body: r.body,
    cover: r.cover,
    theme: r.theme in THEMES ? (r.theme as ThemeKey) : "sunrise",
    topic: r.topic,
    metaTitle: r.meta_title,
    metaDescription: r.meta_description,
    published: !!r.published,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Pictures of visible, in-stock products by SKU (covers of posts without their own picture). */
function productImagesBySku(skus: string[]): Map<string, string> {
  const list = [...new Set(skus)].slice(0, 400);
  if (!list.length) return new Map();
  try {
    const rows = catalogDb()
      .prepare(`SELECT sku, image FROM products WHERE sku IN (${list.map(() => "?").join(",")}) AND hidden = 0 AND stock > 0 AND image IS NOT NULL AND image <> ''`)
      .all(...list) as { sku: string; image: string }[];
    return new Map(rows.map((r) => [r.sku, r.image]));
  } catch {
    // The catalogue is being rebuilt: covers fall back to the theme colour.
    return new Map();
  }
}

/** Up to three product pictures from the post's product cards. */
export function coverImagesFor(body: string): string[] {
  const skus = productSkus(parseBody(body)).slice(0, 6);
  const images = productImagesBySku(skus);
  return skus.map((s) => images.get(s)).filter((x): x is string => !!x).slice(0, 3);
}

/** Cards with the first three products of each post (in stock and visible) as cover pictures. */
function toCards(rows: Row[]): BlogCardData[] {
  const skusByPost = rows.map((r) => productSkus(parseBody(r.body)).slice(0, 6));
  const bySku = productImagesBySku(skusByPost.flat());
  return rows.map((r, k) => {
    const { body, ...rest } = toPost(r);
    return {
      ...rest,
      readingMinutes: readingMinutes(body),
      coverImages: skusByPost[k].map((s) => bySku.get(s)).filter((x): x is string => !!x).slice(0, 3),
    };
  });
}

// ---------------------------------------------------------------------------
// Dates: the admin enters Bulgarian local time ("YYYY-MM-DDTHH:mm"), the database keeps ISO instants.

const SOFIA_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Sofia",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function sofiaParts(d: Date): Record<string, string> {
  return Object.fromEntries(SOFIA_PARTS.formatToParts(d).map((p) => [p.type, p.value]));
}

/** "2026-09-29T14:05" in Bulgarian time — what the admin's date + time field shows. "" for null. */
export function sofiaLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = sofiaParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DDTHH:mm" in Bulgarian time -> ISO instant (DST-safe). null for an invalid value. */
function fromSofiaLocal(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = (utc: number) => {
    const p = sofiaParts(new Date(utc));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - utc;
  };
  let utc = local - offset(local);
  utc = local - offset(utc); // second pass settles the DST change days
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Starter posts: added once, the first time the blog is used. Deleting them later is final.

const g = globalThis as unknown as { __blogSeeded?: boolean };
const DAY = 24 * 60 * 60 * 1000;
const SEED_FLAG = "blog_seeded";

function ensureSeeded() {
  // Nothing to add yet (an empty seed never marks the blog as seeded, so the posts still arrive later).
  if (g.__blogSeeded || !SEED_POSTS.length) return;
  const db = storeDb();
  if (!db.prepare("SELECT 1 FROM settings WHERE key = ?").get(SEED_FLAG)) {
    db.transaction(() => {
      if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(SEED_FLAG)) return;
      const empty = !db.prepare("SELECT 1 FROM blog_posts LIMIT 1").get();
      if (empty) {
        const insert = db.prepare(
          `INSERT OR IGNORE INTO blog_posts (locale, translation_of, slug, title, excerpt, body, cover, theme, topic, meta_title, meta_description,
             published, published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, 1, ?, ?, ?)`,
        );
        const ids = new Map<string, number>();
        const now = Date.now();
        const perLocale = new Map<Lang, number>();
        for (const p of SEED_POSTS) {
          // Newest first in each language, three days apart; a translation shares its original's date.
          const i = perLocale.get(p.locale) ?? 0;
          perLocale.set(p.locale, i + 1);
          const original = p.translationOf ? ids.get(p.translationOf) : undefined;
          const originalAt = original
            ? (db.prepare("SELECT published_at FROM blog_posts WHERE id = ?").get(original) as { published_at: string } | undefined)?.published_at
            : undefined;
          const at = originalAt ?? new Date(now - i * 3 * DAY).toISOString();
          const r = insert.run(p.locale, original ?? null, p.slug, p.title, p.excerpt, p.body, p.theme, p.topic, p.metaTitle, p.metaDescription, at, at, at);
          if (r.changes) ids.set(p.key, Number(r.lastInsertRowid));
        }
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, 'true', ?)").run(SEED_FLAG, new Date().toISOString());
    }).immediate();
  }
  g.__blogSeeded = true;
}

// ---------------------------------------------------------------------------
// Site

const PUBLISHED = "published = 1 AND published_at IS NOT NULL AND published_at <= ?";
const nowIso = () => new Date().toISOString();

export function topicSlug(topic: string): string {
  return slugify(topic, 40);
}

export type BlogTopic = { slug: string; name: string; count: number };

/** Published posts of one language (newest first), optionally of one topic, one page at a time. */
export function listPublished(lang: Lang, opts: { topic?: string | null; page?: number; perPage?: number } = {}) {
  ensureSeeded();
  const perPage = opts.perPage ?? BLOG_PER_PAGE;
  const all = storeDb().prepare(`SELECT * FROM blog_posts WHERE locale = ? AND ${PUBLISHED} ORDER BY published_at DESC, id DESC`).all(lang, nowIso()) as Row[];
  const topics = new Map<string, BlogTopic>();
  for (const r of all) {
    if (!r.topic) continue;
    const slug = topicSlug(r.topic);
    if (!slug) continue;
    const t = topics.get(slug) ?? { slug, name: r.topic, count: 0 };
    t.count++;
    topics.set(slug, t);
  }
  const topic = opts.topic ? (topics.get(opts.topic) ?? null) : null;
  const rows = topic ? all.filter((r) => topicSlug(r.topic) === topic.slug) : all;
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pageCount);
  return {
    items: toCards(rows.slice((page - 1) * perPage, page * perPage)),
    total: rows.length,
    page,
    pageCount,
    topic,
    topics: [...topics.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, lang)),
  };
}

/** The newest published posts of a language (home page "От блога", sidebars). */
export function latestPosts(lang: Lang, limit = 3, exceptId?: number): BlogCardData[] {
  ensureSeeded();
  const rows = storeDb()
    .prepare(`SELECT * FROM blog_posts WHERE locale = ? AND ${PUBLISHED} AND id != ? ORDER BY published_at DESC, id DESC LIMIT ?`)
    .all(lang, nowIso(), exceptId ?? 0, limit) as Row[];
  return toCards(rows);
}

export function getPublishedPost(lang: Lang, slug: string): BlogPost | null {
  ensureSeeded();
  const r = storeDb().prepare(`SELECT * FROM blog_posts WHERE locale = ? AND slug = ? AND ${PUBLISHED}`).get(lang, slug, nowIso()) as Row | undefined;
  return r ? toPost(r) : null;
}

/** blog_redirects keys carry the language, so a Bulgarian and an English post may once have had the same address. */
const redirectKey = (lang: Lang, slug: string) => `${lang}:${slug}`;

/** The current address of a post whose address was changed (same language). */
export function renamedPostSlug(lang: Lang, oldSlug: string): string | null {
  const r = storeDb()
    .prepare(
      `SELECT p.slug FROM blog_redirects r JOIN blog_posts p ON p.id = r.post_id
       WHERE r.old_slug = ? AND p.locale = ? AND p.published = 1 AND p.published_at IS NOT NULL AND p.published_at <= ?`,
    )
    .get(redirectKey(lang, oldSlug), lang, nowIso()) as { slug: string } | undefined;
  return r?.slug ?? null;
}

/**
 * For an address that exists only in the other language (e.g. the language switcher sent /en/blog/<bulgarian-slug>):
 * the published post in `lang` that translates it, or null.
 */
export function translationBySlug(lang: Lang, otherSlug: string): string | null {
  const other = LANGS.find((l) => l !== lang)!;
  const src = storeDb().prepare("SELECT id, translation_of FROM blog_posts WHERE locale = ? AND slug = ?").get(other, otherSlug) as
    | { id: number; translation_of: number | null }
    | undefined;
  if (!src) return null;
  const root = src.translation_of ?? src.id;
  const r = storeDb()
    .prepare(`SELECT slug FROM blog_posts WHERE locale = ? AND (id = ? OR translation_of = ?) AND ${PUBLISHED}`)
    .get(lang, root, root, nowIso()) as { slug: string } | undefined;
  return r?.slug ?? null;
}

/** Published versions of this post in the other languages (hreflang, "Read in English"). */
export function publishedTranslations(post: BlogPost): { locale: Lang; slug: string; title: string }[] {
  const root = post.translationOf ?? post.id;
  const rows = storeDb()
    .prepare(`SELECT locale, slug, title FROM blog_posts WHERE (id = ? OR translation_of = ?) AND id != ? AND ${PUBLISHED}`)
    .all(root, root, post.id, nowIso()) as { locale: string; slug: string; title: string }[];
  return rows.filter((r): r is { locale: Lang; slug: string; title: string } => isLang(r.locale) && r.locale !== post.locale);
}

/** Same topic first, then the newest (same language). */
export function relatedPosts(post: BlogPost, limit = 3): BlogCardData[] {
  const rows = storeDb()
    .prepare(`SELECT * FROM blog_posts WHERE locale = ? AND ${PUBLISHED} AND id != ? ORDER BY (topic = ?) DESC, published_at DESC, id DESC LIMIT ?`)
    .all(post.locale, nowIso(), post.id, post.topic, limit) as Row[];
  return toCards(rows);
}

/** Published posts of a language for the sitemap: slug + last change. */
export function listPublishedPosts(lang: Lang): { slug: string; updatedAt: string }[] {
  ensureSeeded();
  return (
    storeDb().prepare(`SELECT slug, updated_at FROM blog_posts WHERE locale = ? AND ${PUBLISHED} ORDER BY published_at DESC`).all(lang, nowIso()) as {
      slug: string;
      updated_at: string;
    }[]
  ).map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
}

// ---------------------------------------------------------------------------
// Admin

export type AdminPostRow = BlogCardData & {
  /** Published versions and drafts in the other language(s). */
  translations: { id: number; locale: Lang; title: string }[];
};

/** Every post (drafts and scheduled ones too), newest first; `locale` narrows to one language. */
export function listAllPosts(locale?: Lang | null): AdminPostRow[] {
  ensureSeeded();
  const db = storeDb();
  const rows = (
    locale
      ? db.prepare("SELECT * FROM blog_posts WHERE locale = ? ORDER BY COALESCE(published_at, created_at) DESC, (translation_of IS NULL) DESC, id DESC").all(locale)
      : db.prepare("SELECT * FROM blog_posts ORDER BY COALESCE(published_at, created_at) DESC, (translation_of IS NULL) DESC, id DESC").all()
  ) as Row[];
  const links = db.prepare("SELECT id, locale, title, translation_of FROM blog_posts").all() as { id: number; locale: string; title: string; translation_of: number | null }[];
  const groups = new Map<number, { id: number; locale: Lang; title: string }[]>();
  for (const l of links) {
    if (!isLang(l.locale)) continue;
    const root = l.translation_of ?? l.id;
    groups.set(root, [...(groups.get(root) ?? []), { id: l.id, locale: l.locale, title: l.title }]);
  }
  return toCards(rows).map((c) => ({
    ...c,
    translations: (groups.get(c.translationOf ?? c.id) ?? []).filter((t) => t.id !== c.id),
  }));
}

export function postCounts(): Record<Lang, number> {
  ensureSeeded();
  const rows = storeDb().prepare("SELECT locale, COUNT(*) AS n FROM blog_posts GROUP BY locale").all() as { locale: string; n: number }[];
  const out: Record<Lang, number> = { bg: 0, en: 0 };
  for (const r of rows) if (isLang(r.locale)) out[r.locale] = r.n;
  return out;
}

export function getPost(id: number): BlogPost | null {
  ensureSeeded();
  const r = storeDb().prepare("SELECT * FROM blog_posts WHERE id = ?").get(id) as Row | undefined;
  return r ? toPost(r) : null;
}

/** The other posts of a post's translation group (any status). */
export function postGroup(post: Pick<BlogPost, "id" | "translationOf">): { id: number; locale: Lang; title: string; slug: string; published: boolean }[] {
  const root = post.translationOf ?? post.id;
  return (
    storeDb().prepare("SELECT id, locale, title, slug, published FROM blog_posts WHERE (id = ? OR translation_of = ?) AND id != ?").all(root, root, post.id) as {
      id: number;
      locale: string;
      title: string;
      slug: string;
      published: number;
    }[]
  )
    .filter((r) => isLang(r.locale))
    .map((r) => ({ id: r.id, locale: r.locale as Lang, title: r.title, slug: r.slug, published: !!r.published }));
}

/** Posts that a post in `locale` may be linked to as their translation: originals in the other language without a `locale` version yet. */
export function translationCandidates(locale: Lang, exceptId: number | null): { id: number; locale: Lang; title: string }[] {
  const rows = storeDb()
    .prepare(
      `SELECT p.id, p.locale, p.title FROM blog_posts p
       WHERE p.locale != ? AND p.translation_of IS NULL AND p.id != ?
         AND NOT EXISTS (SELECT 1 FROM blog_posts t WHERE t.translation_of = p.id AND t.locale = ? AND t.id != ?)
       ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT 300`,
    )
    .all(locale, exceptId ?? 0, locale, exceptId ?? 0) as { id: number; locale: string; title: string }[];
  return rows.filter((r) => isLang(r.locale)).map((r) => ({ id: r.id, locale: r.locale as Lang, title: r.title }));
}

export function allTopics(locale?: Lang): string[] {
  ensureSeeded();
  const db = storeDb();
  const rows = (
    locale
      ? db.prepare("SELECT DISTINCT topic FROM blog_posts WHERE topic != '' AND locale = ? ORDER BY topic").all(locale)
      : db.prepare("SELECT DISTINCT topic FROM blog_posts WHERE topic != '' ORDER BY topic").all()
  ) as { topic: string }[];
  return rows.map((r) => r.topic);
}

export type BlogPostInput = {
  locale: Lang;
  /** The original this post translates (another language), or null. */
  translationOf: number | null;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover: string;
  theme: string;
  topic: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
  /** "YYYY-MM-DDTHH:mm" in Bulgarian time, or "" for "now" (when publishing). */
  publishedAt: string;
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");
const oneLine = (v: unknown, max: number) => clip(v, max).replace(/\s+/g, " ");

function coverImage(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (/^\/uploads\/[a-z0-9]+\.[a-z]+$/.test(t)) return t;
  if (/^https?:\/\/[^\s<>"'\\]+$/i.test(t)) return t.slice(0, 1000);
  return "";
}

const LOCALE_NAME: Record<Lang, string> = { bg: "български", en: "английски" };

export function savePost(id: number | null, input: BlogPostInput): { id: number; slug: string } | { error: string } {
  const db = storeDb();
  const existing = id ? getPost(id) : null;
  if (id && !existing) return { error: "Статията не е намерена." };
  const locale: Lang = isLang(input?.locale) ? input.locale : "bg";
  const title = oneLine(input.title, 140);
  if (!title) return { error: "Въведете заглавие на статията." };
  const slug = slugify(oneLine(input.slug, 100) || title, 80);
  if (!slug) return { error: "Въведете адрес на страницата (с латински букви)." };
  const clash = db.prepare("SELECT id FROM blog_posts WHERE locale = ? AND slug = ? AND id != ?").get(locale, slug, id ?? 0);
  if (clash) return { error: `Адресът „${locale === "en" ? "/en" : ""}/blog/${slug}“ вече се използва от друга статия. Сменете го.` };

  // Translation link: the target must be an original in another language, and the group may hold one post per language.
  let translationOf: number | null = null;
  const rawTr = Number(input.translationOf);
  if (Number.isInteger(rawTr) && rawTr > 0 && rawTr !== id) {
    const target = getPost(rawTr);
    if (!target) return { error: "Оригиналът, към който е свързан преводът, вече не съществува." };
    translationOf = target.translationOf ?? target.id;
    if (translationOf === id) translationOf = null;
  }
  if (id && translationOf && (db.prepare("SELECT 1 FROM blog_posts WHERE translation_of = ?").get(id))) {
    return { error: "Тази статия вече има свои преводи, затова не може да бъде превод на друга." };
  }
  const groupRoot = translationOf ?? id;
  if (groupRoot) {
    const sameLang = db
      .prepare("SELECT title FROM blog_posts WHERE (id = ? OR translation_of = ?) AND locale = ? AND id != ?")
      .get(groupRoot, groupRoot, locale, id ?? 0) as { title: string } | undefined;
    if (sameLang) return { error: `Вече има версия на ${LOCALE_NAME[locale]} („${sameLang.title}“). Една статия може да има само по една версия на език.` };
  }

  let publishedAt: string | null = existing?.publishedAt ?? null;
  const when = oneLine(input.publishedAt, 16);
  if (when) {
    // An unchanged value keeps the exact stored instant (seconds included).
    if (!publishedAt || sofiaLocal(publishedAt) !== when) {
      const iso = fromSofiaLocal(when);
      if (!iso) return { error: "Невалидна дата или час на публикуване." };
      publishedAt = iso;
    }
  } else if (input.published) publishedAt = existing?.published && existing.publishedAt ? existing.publishedAt : new Date().toISOString();
  else publishedAt = null;

  const now = new Date().toISOString();
  const values = {
    locale,
    translation_of: translationOf,
    slug,
    title,
    excerpt: oneLine(input.excerpt, 300),
    body: clip(input.body, 60_000),
    cover: coverImage(input.cover),
    theme: typeof input.theme === "string" && input.theme in THEMES ? input.theme : "sunrise",
    topic: oneLine(input.topic, 40),
    meta_title: oneLine(input.metaTitle, 90),
    meta_description: oneLine(input.metaDescription, 300),
    published: input.published ? 1 : 0,
    published_at: publishedAt,
    updated_at: now,
  };

  return db.transaction(() => {
    let postId = id;
    if (existing) {
      db.prepare(
        `UPDATE blog_posts SET locale = @locale, translation_of = @translation_of, slug = @slug, title = @title, excerpt = @excerpt, body = @body,
           cover = @cover, theme = @theme, topic = @topic, meta_title = @meta_title, meta_description = @meta_description, published = @published,
           published_at = @published_at, updated_at = @updated_at
         WHERE id = @id`,
      ).run({ ...values, id });
      // The old address keeps working (and tells Google the page moved).
      if (existing.slug !== slug || existing.locale !== locale) {
        db.prepare("INSERT OR REPLACE INTO blog_redirects (old_slug, post_id) VALUES (?, ?)").run(redirectKey(existing.locale, existing.slug), id);
      }
    } else {
      const r = db
        .prepare(
          `INSERT INTO blog_posts (locale, translation_of, slug, title, excerpt, body, cover, theme, topic, meta_title, meta_description, published,
             published_at, created_at, updated_at)
           VALUES (@locale, @translation_of, @slug, @title, @excerpt, @body, @cover, @theme, @topic, @meta_title, @meta_description, @published,
             @published_at, @created_at, @updated_at)`,
        )
        .run({ ...values, created_at: now });
      postId = Number(r.lastInsertRowid);
    }
    // A post now living at an old address takes it over.
    db.prepare("DELETE FROM blog_redirects WHERE old_slug = ?").run(redirectKey(locale, slug));
    return { id: postId!, slug };
  })();
}

export function deletePost(id: number) {
  const db = storeDb();
  db.transaction(() => {
    db.prepare("DELETE FROM blog_redirects WHERE post_id = ?").run(id);
    // Translations of a deleted original stay as standalone posts.
    db.prepare("UPDATE blog_posts SET translation_of = NULL WHERE translation_of = ?").run(id);
    db.prepare("DELETE FROM blog_posts WHERE id = ?").run(id);
  })();
}

/** Everything the admin editor needs besides the post itself: topics and translation choices per language. */
export function blogEditorData(post: Pick<BlogPost, "id" | "translationOf"> | null) {
  const id = post?.id ?? null;
  return {
    topics: { bg: allTopics("bg"), en: allTopics("en") } satisfies Record<Lang, string[]>,
    candidates: { bg: translationCandidates("bg", id), en: translationCandidates("en", id) } satisfies Record<Lang, { id: number; locale: Lang; title: string }[]>,
    group: post ? postGroup(post) : [],
    isOriginal: !!id && !!storeDb().prepare("SELECT 1 FROM blog_posts WHERE translation_of = ?").get(id),
  };
}
