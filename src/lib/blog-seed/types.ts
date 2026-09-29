import type { Lang } from "@/i18n/config";
import type { ThemeKey } from "@/lib/settings-types";

/**
 * A starter blog post, inserted once into store.db the first time the blog is used (see lib/blog.ts).
 * Bulgarian and English posts are separate rows; an English post may be the translation of a Bulgarian one.
 */
export type SeedPost = {
  /** Stable id inside the seed, used to link a translation to its original ("protein-guide"). */
  key: string;
  locale: Lang;
  /** `key` of the original (Bulgarian) post this one translates, if any. */
  translationOf?: string;
  slug: string;
  title: string;
  /** Shown in the post list and used as the Google description if `metaDescription` is empty. */
  excerpt: string;
  topic: string;
  metaTitle: string;
  metaDescription: string;
  /** Background of the cover when the post has no cover picture. */
  theme: ThemeKey;
  /** Text in the blog's simple markup — see src/lib/blog-markup.ts. */
  body: string;
};
