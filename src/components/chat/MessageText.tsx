"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { INTL_LOCALE, type Lang } from "@/i18n/config";
import { localizeHref } from "@/lib/links";

// Web addresses in chat messages become links; links to this shop open in the same tab (the chat stays open).
// Used by the storefront bubble and the admin inbox.

const URL_RE = /(https?:\/\/[^\s<>"]*[^\s<>".,!?;:)\]}'])/g;

const noSubscribe = () => () => {};
/** This site's host — only known in the browser (null while hydrating, so server and client HTML match). */
function useHost(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.host,
    () => null,
  );
}

export function MessageText({ text, lang, linkClassName = "underline" }: { text: string; /** Visitor's language: shop links get "/en". */ lang?: Lang; linkClassName?: string }) {
  const host = useHost();
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        let local: string | null = null;
        try {
          const u = new URL(part);
          const path = u.pathname + u.search + u.hash;
          // Same site AND a plain local path: "//evil.example" or "/\evil.example" would leave the site in a
          // client-side navigation, so such links are treated as external (new tab, no referrer).
          if (host && u.host === host && /^\/(?![/\\])/.test(path) && !path.includes("\\")) local = path;
        } catch {
          return part;
        }
        return local ? (
          <Link key={i} href={lang ? localizeHref(local, lang) : local} className={`${linkClassName} break-all`}>
            {part}
          </Link>
        ) : (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className={`${linkClassName} break-all`}>
            {part}
          </a>
        );
      })}
    </>
  );
}

const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" });

/** "14:05" today, "29 сеп, 14:05" on another day — Bulgarian time. */
export function formatChatTime(iso: string, lang: Lang = "bg", now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const locale = INTL_LOCALE[lang];
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });
  if (DAY_KEY.format(d) === DAY_KEY.format(new Date(now))) return time;
  return `${d.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Europe/Sofia" })}, ${time}`;
}
