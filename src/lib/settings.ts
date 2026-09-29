import "server-only";
import { cache } from "react";
import { storeDb } from "./db";
import {
  normalizeChat,
  normalizeGiftTiers,
  normalizeHome,
  normalizeMenu,
  normalizeSettings,
} from "./settings-normalize";
import type { ChatSettings, GiftTierSettings, HomeContent, MenuConfig, StoreSettings } from "./settings-types";
import { automaticGiftTiers } from "./gift-defaults";
import { normalizeCategoriesConfig, normalizeGoalsConfig, type CategoriesConfig, type GoalsConfig } from "./category-config";

// Admin-edited settings: one JSON row per key in store.db. Read through the getters below (normalized, so a
// missing or corrupt row gives the defaults) and written with writeSetting() from admin Server Actions, which
// then call revalidatePath("/", "layout").

export type SettingKey = "store" | "home" | "menu" | "giftTiers" | "chat" | "categories" | "goals";

function read(key: SettingKey): unknown {
  const row = storeDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

/** Save a setting (pass the NORMALIZED value). */
export function writeSetting(key: SettingKey, value: unknown) {
  storeDb()
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(key, JSON.stringify(value), new Date().toISOString());
}

export const getSettings = cache((): StoreSettings => normalizeSettings(read("store")));
export const getHomeContent = cache((): HomeContent => normalizeHome(read("home")));
export const getMenu = cache((): MenuConfig => normalizeMenu(read("menu")));
/** Saved gift tiers — or, until the admin saves them, the default 40 / 60 / 80 € tiers with automatically picked gifts. */
export const getGiftTiers = cache((): GiftTierSettings => {
  const raw = read("giftTiers");
  return raw === undefined ? automaticGiftTiers() : normalizeGiftTiers(raw);
});
export const getChatSettings = cache((): ChatSettings => normalizeChat(read("chat")));
/** The admin's changes to the built-in categories (merge with lib/categories.ts → mergeCategories). */
export const getCategoriesConfig = cache((): CategoriesConfig => normalizeCategoriesConfig(read("categories")));
/** The admin's changes to the built-in goals (merge with lib/categories.ts → mergeGoals). */
export const getGoalsConfig = cache((): GoalsConfig => normalizeGoalsConfig(read("goals")));
