"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  ExternalLink,
  Factory,
  Images,
  LayoutDashboard,
  LayoutGrid,
  ListTree,
  LogOut,
  Menu,
  MessagesSquare,
  Newspaper,
  Package,
  Settings,
  ShoppingBag,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/admin/_actions/auth";
import { LogoMark } from "@/components/layout/Logo";

const NAV = [
  { href: "/admin", label: "Табло", icon: LayoutDashboard, exact: true },
  { href: "/admin/produkti", label: "Продукти", icon: Package },
  { href: "/admin/kategorii", label: "Категории", icon: LayoutGrid },
  { href: "/admin/proizvoditeli", label: "Производители", icon: Factory },
  { href: "/admin/tseni", label: "Цени и промоции", icon: Tags },
  { href: "/admin/nachalna", label: "Начална страница", icon: Images },
  { href: "/admin/menyu", label: "Меню", icon: ListTree },
  { href: "/admin/blog", label: "Блог", icon: Newspaper },
  { href: "/admin/poruchki", label: "Поръчки", icon: ShoppingBag, badge: "orders" as const },
  { href: "/admin/chat", label: "Чат", icon: MessagesSquare, badge: "chat" as const },
  { href: "/admin/nastroyki", label: "Настройки", icon: Settings },
  { href: "/admin/profil", label: "Профил и парола", icon: UserRound },
];

/** Fired by the chat page when it knows the new unread count, so the menu badge updates at once. */
export const CHAT_UNREAD_EVENT = "admin-chat-unread";

export function AdminShell({
  username,
  storeName,
  newOrders,
  unreadChats: initialUnread,
  children,
}: {
  username: string;
  storeName: string;
  newOrders: number;
  unreadChats: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const [unreadChats, setUnreadChats] = useState(initialUnread);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Check for new chat messages every 15 s. This also tells visitors that someone is on line.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const r = await fetch("/admin/chat/data?summary=1", { cache: "no-store" });
          if (r.ok) setUnreadChats(((await r.json()) as { unread: number }).unread);
        } catch {}
      }
      if (!stopped) timer = setTimeout(tick, 15000);
    };
    tick();
    const onUnread = (e: Event) => setUnreadChats((e as CustomEvent<number>).detail);
    window.addEventListener(CHAT_UNREAD_EVENT, onUnread);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(CHAT_UNREAD_EVENT, onUnread);
    };
  }, []);

  // "(2) …" in the browser tab while chat messages are waiting. Next sets the title after navigation, so re-apply it.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\) /, "");
      const want = unreadChats ? `(${unreadChats}) ${base}` : base;
      if (base && document.title !== want) document.title = want;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [unreadChats]);

  // Escape closes the phone menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const nav = (
    <nav className="flex h-full flex-col" aria-label="Админ меню">
      <Link href="/admin" className="flex items-center gap-2.5 px-5 py-5">
        <LogoMark className="h-9 w-9" />
        <span className="leading-tight">
          <span className="block font-black text-white">{storeName}</span>
          <span className="text-xs font-bold text-white/60">Админ панел</span>
        </span>
      </Link>
      <ul className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map(({ href, label, icon: Icon, exact, badge }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition",
                  active ? "bg-white text-ink" : "text-white/80 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{label}</span>
                {badge === "orders" && newOrders ? (
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-sun px-1.5 text-xs font-black text-ink" aria-label={`${newOrders} нови`}>
                    {newOrders}
                  </span>
                ) : null}
                {badge === "chat" && unreadChats ? (
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-black text-white" aria-label={`${unreadChats} непрочетени`}>
                    {unreadChats}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-white/80 hover:bg-white/10 hover:text-white">
          <ExternalLink className="h-5 w-5" /> Виж сайта
        </a>
        <form action={logoutAction}>
          <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-white/80 hover:bg-white/10 hover:text-white">
            <LogOut className="h-5 w-5" /> Изход <span className="ml-auto truncate text-xs font-semibold text-white/50">{username}</span>
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-ink lg:block">{nav}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas" aria-label="Меню" aria-expanded={open}>
          <Menu className="h-6 w-6" />
        </button>
        <span className="font-black">{storeName} · Админ</span>
        {unreadChats ? (
          <Link href="/admin/chat" className="ml-auto flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-sm font-extrabold text-white" aria-label={`Чат: ${unreadChats} непрочетени`}>
            <MessagesSquare className="h-4 w-4" /> {unreadChats}
          </Link>
        ) : null}
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10" aria-label="Затвори">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
