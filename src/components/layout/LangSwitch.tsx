"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useDict, useLang } from "@/i18n/client";
import { LANG_COOKIE, LANGS, type Lang } from "@/i18n/config";
import { switchLangHref } from "@/lib/links";
import { usePublicPathname } from "@/lib/use-public-pathname";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the picked language (a preference only: the proxy never redirects by it, "/" is always Bulgarian). */
function rememberLang(to: Lang) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANG_COOKIE}=${to}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
}

/**
 * БГ | EN switch: the same page in the other language (a pure prefix swap, query string kept).
 * `tone="dark"` on the ink top bar, "light" in the mobile menu.
 */
export function LangSwitch({ tone = "light", size = "sm", className }: { tone?: "light" | "dark"; size?: "sm" | "md"; className?: string }) {
  const lang = useLang();
  const dict = useDict();
  const pathname = usePublicPathname();
  const router = useRouter();
  const dark = tone === "dark";
  return (
    <div role="group" aria-label={dict.header.language} className={clsx("flex w-fit items-center rounded-pill p-0.5", dark ? "bg-black/20" : "bg-canvas ring-1 ring-line", className)}>
      {LANGS.map((l) => {
        const current = l === lang;
        const cls = clsx(
          "grid place-items-center rounded-pill font-bold tracking-[0.04em]",
          size === "md" ? "min-h-11 min-w-14 px-4 text-sm" : "min-h-8 min-w-11 px-2.5 text-[0.78rem]",
          current ? (dark ? "bg-white text-ink" : "bg-ink text-white") : dark ? "text-white hover:bg-white/15" : "text-ink-soft hover:text-ink",
        );
        if (current) {
          return (
            <span key={l} className={cls} aria-current="true" lang={l}>
              <span aria-hidden>{dict.header.langShort[l]}</span>
              <span className="sr-only">{dict.header.langName[l]}</span>
            </span>
          );
        }
        return (
          <Link
            key={l}
            href={switchLangHref(pathname, "", l)}
            hrefLang={l}
            lang={l}
            className={cls}
            onClick={(e) => {
              rememberLang(l);
              // Keep the query string (filters, search) — read here so the link itself needs no useSearchParams().
              const search = window.location.search;
              if (search && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                e.preventDefault();
                router.push(switchLangHref(pathname, search, l));
              }
            }}
          >
            <span aria-hidden>{dict.header.langShort[l]}</span>
            <span className="sr-only">{dict.header.langName[l]}</span>
          </Link>
        );
      })}
    </div>
  );
}
