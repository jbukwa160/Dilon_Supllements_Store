// Texts the admin types in two languages (banners, menu labels, settings…). Bulgarian is required where the
// field is required; English is optional and falls back to Bulgarian when empty.
// Pure data: safe to import from client components, server code and scripts.
import type { Lang } from "@/i18n/config";

export type L10n = { bg: string; en: string };

export const EMPTY_L10N: L10n = { bg: "", en: "" };

/** The text for `lang`; English falls back to Bulgarian when it is empty. Plain strings are returned as they are. */
export function loc(v: L10n | string | null | undefined, lang: Lang): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (lang === "en" && v.en.trim()) return v.en;
  return v.bg;
}

export function l10n(bg = "", en = ""): L10n {
  return { bg, en };
}

/** True when the Bulgarian text is set but the English one is missing (the admin shows "Липсва превод"). */
export function missingEn(v: L10n): boolean {
  return !!v.bg.trim() && !v.en.trim();
}

/**
 * Sanitise an L10n value read from JSON: both halves trimmed and clipped to `max` characters.
 * Accepts a plain string (texts saved before a field became bilingual) -> { bg: s, en: "" }. Never throws.
 */
export function normL10n(v: unknown, max: number): L10n {
  const clip = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, max) : "");
  if (typeof v === "string") return { bg: clip(v), en: "" };
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return { bg: clip(o.bg), en: clip(o.en) };
  }
  return { bg: "", en: "" };
}
