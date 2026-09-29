import type { SeedPost } from "./types";
import { POSTS_BG } from "./bg";
import { POSTS_EN } from "./en";

export type { SeedPost };

/**
 * Starter posts, newest first within each language (the seed spaces them a few days apart in this order).
 * Originals come before translations so `translationOf` can be resolved while inserting.
 */
export const SEED_POSTS: SeedPost[] = [...POSTS_BG, ...POSTS_EN];
