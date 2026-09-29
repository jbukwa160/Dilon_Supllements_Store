"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { LayoutDashboard, LogOut, MapPin, Package, UserRound, UserRoundPen } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref, stripLang } from "@/lib/links";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { logoutAction } from "@/app/[lang]/(shop)/vhod/actions";
import { refreshAccount, setAccount, useAccount } from "./account-store";
import { ACCOUNT_PATH, AUTH_PATHS } from "./form-state";

// Header account icon. The shop pages are static, so who is signed in is asked from the browser
// (GET /api/account/me, once per page load). Signed out: a link to the sign-in page. Signed in: the customer's
// initials; a menu button (Enter / Space / ↓ opens, ↑ ↓ Home End move, Escape / Tab close) with the account pages
// and "Изход" (a form POST, never a GET link).

const isAuthOrAccount = (publicPath: string) => {
  const path = stripLang(publicPath).path;
  return AUTH_PATHS.includes(path) || ACCOUNT_PATH.test(path);
};

function initials(first: string, last?: string) {
  const a = first.trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return (a + b).toUpperCase() || "•";
}

export function AccountButton() {
  const lang = useLang();
  const dict = useDict();
  const t = dict.account;
  const { status, customer } = useAccount();
  const pathname = usePublicPathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const prevPath = useRef(pathname);

  // Close the menu on navigation (adjusting state during render, not in an effect).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    void refreshAccount(false);
  }, []);

  // Leaving a sign-in / account page usually means the session just changed (signed in, out, deleted): ask again.
  useEffect(() => {
    const before = prevPath.current;
    prevPath.current = pathname;
    if (before !== pathname && isAuthOrAccount(before)) void refreshAccount();
  }, [pathname]);

  // Close on a click outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusItem = (which: "first" | "last" | number) => {
    const list = items();
    if (!list.length) return;
    const i = which === "first" ? 0 : which === "last" ? list.length - 1 : (which + list.length) % list.length;
    list[i]?.focus();
  };

  const openMenu = (focus: "first" | "last" | null) => {
    setOpen(true);
    if (focus) requestAnimationFrame(() => focusItem(focus));
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  if (status !== "ready" || !customer) {
    return (
      <Link
        href={localizeHref("/vhod", lang)}
        className="grid h-11 w-11 place-items-center rounded-pill hover:bg-canvas"
        aria-label={dict.header.login}
        title={dict.header.login}
      >
        <UserRound className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </Link>
    );
  }

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  const links = [
    { href: "/profil", label: t.profile, icon: LayoutDashboard },
    { href: "/profil/porachki", label: t.orders, icon: Package },
    { href: "/profil/adresi", label: t.addresses, icon: MapPin },
    { href: "/profil/danni", label: t.details, icon: UserRoundPen },
  ];

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        className="grid h-11 w-11 place-items-center rounded-pill hover:bg-canvas"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={fmt(t.menuLabel, { name })}
        title={name}
        onClick={() => (open ? close(false) : openMenu(null))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || ((e.key === "Enter" || e.key === " ") && !open)) {
            e.preventDefault();
            openMenu("first");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openMenu("last");
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close(true);
          }
        }}
      >
        <span className="grid h-8 w-8 place-items-center rounded-pill bg-primary text-[0.8rem] font-bold tracking-wide text-white" aria-hidden>
          {initials(customer.firstName, customer.lastName)}
        </span>
      </button>

      {open ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={fmt(t.menuLabel, { name })}
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] animate-fade-in rounded-lg border border-line bg-surface p-2 shadow-[var(--shadow-overlay)]"
          onKeyDown={(e) => {
            const list = items();
            const i = list.indexOf(document.activeElement as HTMLElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusItem(i + 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusItem(i - 1);
            } else if (e.key === "Home") {
              e.preventDefault();
              focusItem("first");
            } else if (e.key === "End") {
              e.preventDefault();
              focusItem("last");
            } else if (e.key === "Escape") {
              e.preventDefault();
              close(true);
            } else if (e.key === "Tab") {
              setOpen(false);
            }
          }}
        >
          <div className="border-b border-line px-3 pb-2.5 pt-1.5" role="none">
            <p className="truncate font-bold">{name}</p>
            <p className="truncate text-sm text-muted" title={customer.email}>
              {customer.email}
            </p>
          </div>
          <div className="py-1" role="none">
            {links.map((l) => {
              const Icon = l.icon;
              const current = stripLang(pathname).path === l.href;
              return (
                <Link
                  key={l.href}
                  href={localizeHref(l.href, lang)}
                  role="menuitem"
                  tabIndex={-1}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-[0.95rem] font-semibold hover:bg-canvas focus-visible:bg-canvas",
                    current && "text-primary",
                  )}
                >
                  <Icon className="h-5 w-5 text-muted" aria-hidden />
                  {l.label}
                </Link>
              );
            })}
          </div>
          <form action={logoutAction} className="border-t border-line pt-1" role="none" onSubmit={() => setAccount(null)}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="next" value={pathname} />
            <button
              type="submit"
              role="menuitem"
              tabIndex={-1}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[0.95rem] font-semibold hover:bg-canvas focus-visible:bg-canvas"
            >
              <LogOut className="h-5 w-5 text-muted" aria-hidden />
              {t.logout}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
