"use client";

// Cookie consent state for the whole shop (SPEC §5.9): <ConsentProvider> in ShopChrome, useConsent() anywhere.
// The choice lives in the first-party cookie `sp_consent` (12 months) and is read in the browser only
// (useSyncExternalStore), so the server-rendered shop stays static. It is valid while its `version` equals
// settings.tracking.consentVersion (Admin → Настройки: raising it asks every visitor again) and it is less than
// 12 months old. Nothing non-essential may run until `consent` says so (see TrackingScripts).
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { useLang } from "@/i18n/client";
import { useSettings } from "@/components/SettingsProvider";

export type Consent = { necessary: true; preferences: boolean; analytics: boolean; marketing: boolean };

export type ConsentState = {
  /** False on the server and during hydration: nothing that depends on consent should render yet. */
  ready: boolean;
  /** null = the visitor hasn't chosen yet (the banner is shown). */
  consent: Consent | null;
  /** Opens the cookie settings dialog (footer link "Настройки за бисквитки"). */
  openSettings(): void;
  save(c: Consent): void;
  /** The settings dialog is open (CookieConsent renders it). */
  settingsOpen: boolean;
  closeSettings(): void;
  /** Bumped after every save (CookieConsent shows "Изборът ти е запазен."). */
  savedAt: number;
};

export const CONSENT_COOKIE = "sp_consent";
const MAX_AGE_S = 60 * 60 * 24 * 365;
const MAX_AGE_MS = MAX_AGE_S * 1000;

/** What the cookie holds (JSON, URI-encoded). */
type Stored = { version: number; preferences: boolean; analytics: boolean; marketing: boolean; ts: string };

// ---------------------------------------------------------------------------------------------------------------
// External store over document.cookie. Snapshots are cached by the raw cookie value (stable references).

const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastParsed: Stored | null = null;

function readRaw(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`));
  return m ? m[1] : null;
}

function parse(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<Stored>;
    if (typeof v.version !== "number" || typeof v.ts !== "string") return null;
    // Older than 12 months (the cookie's Max-Age normally removes it first): ask again.
    const age = Date.now() - Date.parse(v.ts);
    if (!(age < MAX_AGE_MS)) return null;
    return { version: v.version, preferences: v.preferences === true, analytics: v.analytics === true, marketing: v.marketing === true, ts: v.ts };
  } catch {
    return null;
  }
}

function getSnapshot(): Stored | null {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastParsed = parse(raw);
  }
  return lastParsed;
}

/** undefined on the server = "not known yet". */
function getServerSnapshot(): Stored | null | undefined {
  return undefined;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab may have changed the choice while this one was in the background.
  const onVisible = () => document.visibilityState === "visible" && cb();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    listeners.delete(cb);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function writeCookie(stored: Stored) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(stored))}; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secure}`;
  listeners.forEach((l) => l());
}

/** Drop the cookies analytics / marketing scripts set, on this host and its parent domains. */
function deleteTrackingCookies(prefixes: string[]) {
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => prefixes.some((p) => n.startsWith(p)));
  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; Domain=.${parts.slice(i).join(".")}`);
  for (const n of names) for (const d of domains) document.cookie = `${n}=; Path=/; Max-Age=0${d}`;
}

const ANALYTICS_COOKIES = ["_ga", "_gid", "_gat"];
const MARKETING_COOKIES = ["_fbp", "_fbc", "_gcl"];

// ---------------------------------------------------------------------------------------------------------------

const noop = () => {};
const Ctx = createContext<ConsentState>({
  ready: false,
  consent: null,
  openSettings: noop,
  save: noop,
  settingsOpen: false,
  closeSettings: noop,
  savedAt: 0,
});

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const version = useSettings().tracking.consentVersion;
  const lang = useLang();
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  const ready = stored !== undefined;
  // A choice made for an older policy version no longer counts.
  const valid = !!stored && stored.version === version;
  const preferences = valid && stored.preferences;
  const analytics = valid && stored.analytics;
  const marketing = valid && stored.marketing;
  const consent = useMemo<Consent | null>(() => (valid ? { necessary: true, preferences, analytics, marketing } : null), [valid, preferences, analytics, marketing]);

  const save = useCallback(
    (c: Consent) => {
      const before = getSnapshot();
      const next: Stored = { version, preferences: c.preferences, analytics: c.analytics, marketing: c.marketing, ts: new Date().toISOString() };
      writeCookie(next);
      setSettingsOpen(false);
      setSavedAt(Date.now());
      if (!c.preferences) {
        try {
          localStorage.removeItem("sp-recent-searches");
        } catch {
          // Blocked storage: nothing was stored either.
        }
      }
      // Proof of consent (anonymous, rate-limited); a failure must never block the visitor.
      fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, lang, consent: { preferences: c.preferences, analytics: c.analytics, marketing: c.marketing } }),
        keepalive: true,
      }).catch(() => {});
      // Withdrawn consent: remove what the scripts stored and reload so the already-running scripts are gone too.
      const revoked = (before?.analytics && !c.analytics) || (before?.marketing && !c.marketing);
      if (before?.analytics && !c.analytics) deleteTrackingCookies(ANALYTICS_COOKIES);
      if (before?.marketing && !c.marketing) deleteTrackingCookies(MARKETING_COOKIES);
      if (revoked) window.location.reload();
    },
    [version, lang],
  );

  const value = useMemo<ConsentState>(
    () => ({
      ready,
      consent,
      openSettings: () => setSettingsOpen(true),
      save,
      settingsOpen,
      closeSettings: () => setSettingsOpen(false),
      savedAt,
    }),
    [ready, consent, save, settingsOpen, savedAt],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsent(): ConsentState {
  return useContext(Ctx);
}
