"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, LayoutDashboard, LogOut, MapPin, Package, UserRoundPen } from "lucide-react";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref, stripLang } from "@/lib/links";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { logoutAction } from "@/app/[lang]/(shop)/vhod/actions";
import { setAccount } from "./account-store";

// Account area navigation: a card with the customer and a vertical menu on desktop (lg+), a row of capsule tabs
// on phones and tablets (scrolls sideways if it has to).

const ITEMS = [
  { href: "/profil", key: "dashboard", icon: LayoutDashboard },
  { href: "/profil/porachki", key: "orders", icon: Package },
  { href: "/profil/adresi", key: "addresses", icon: MapPin },
  { href: "/profil/danni", key: "details", icon: UserRoundPen },
  { href: "/lyubimi", key: "wishlist", icon: Heart },
] as const;

export function AccountNav({ name, email, initials, memberSince }: { name: string; email: string; initials: string; memberSince: string }) {
  const lang = useLang();
  const t = useDict().account;
  const path = stripLang(usePublicPathname()).path;
  const tabs = useRef<HTMLElement>(null);
  const active = (href: string) => (href === "/profil" ? path === "/profil" : path === href || path.startsWith(`${href}/`));

  // Phones: keep the current tab in view (e.g. "Лични данни" is off-screen to the right at 390 px).
  useEffect(() => {
    const nav = tabs.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    const n = nav.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    nav.scrollLeft += r.left - n.left - (n.width - r.width) / 2;
  }, [path]);

  return (
    <>
      {/* Phones / tablets: capsule tabs. */}
      <nav ref={tabs} aria-label={t.area.nav} className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
        <ul className="flex w-max gap-2">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            const on = active(it.href);
            return (
              <li key={it.href}>
                <Link href={localizeHref(it.href, lang)} aria-current={on ? "page" : undefined} className="chip min-h-11 px-4">
                  <Icon className="h-4 w-4" aria-hidden />
                  {t.area[it.key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop: sidebar card. */}
      <aside className="card sticky top-24 hidden self-start p-4 lg:block">
        <div className="flex items-center gap-3 border-b border-line px-2 pb-4 pt-1">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-pill bg-primary text-base font-bold text-white" aria-hidden>
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">{name}</p>
            <p className="truncate text-sm text-muted" title={email}>
              {email}
            </p>
            <p className="mt-0.5 text-xs text-muted">{memberSince}</p>
          </div>
        </div>
        <nav aria-label={t.area.nav} className="py-2">
          <ul className="space-y-1">
            {ITEMS.map((it) => {
              const Icon = it.icon;
              const on = active(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={localizeHref(it.href, lang)}
                    aria-current={on ? "page" : undefined}
                    className={clsx(
                      "flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold transition-colors",
                      on ? "bg-primary-50 text-primary-700" : "hover:bg-canvas",
                    )}
                  >
                    <Icon className={clsx("h-5 w-5", on ? "text-primary" : "text-muted")} aria-hidden />
                    {t.area[it.key]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <form action={logoutAction} className="border-t border-line pt-2" onSubmit={() => setAccount(null)}>
          <input type="hidden" name="lang" value={lang} />
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left font-semibold text-muted hover:bg-canvas hover:text-ink"
          >
            <LogOut className="h-5 w-5" aria-hidden />
            {t.logout}
          </button>
        </form>
      </aside>
    </>
  );
}
