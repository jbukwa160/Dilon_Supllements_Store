import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

// Shared pieces of Поръчки / Клиенти / Абонати: the section tabs, a GET search box and the pager. Server-safe (no hooks).

export type OrdersTab = "orders" | "customers" | "subscribers";

const TABS: { key: OrdersTab; label: string; href: string }[] = [
  { key: "orders", label: "Поръчки", href: "/admin/poruchki" },
  { key: "customers", label: "Клиенти", href: "/admin/poruchki/klienti" },
  { key: "subscribers", label: "Абонати", href: "/admin/poruchki/abonati" },
];

export function OrdersTabs({ active, counts }: { active: OrdersTab; counts: Record<OrdersTab, number> }) {
  return (
    <nav aria-label="Раздели" className="mb-5 flex flex-wrap gap-2 border-b border-line pb-4">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-[0.95rem] font-extrabold transition",
            active === t.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink",
          )}
        >
          {t.label}
          <span className={clsx("rounded-full px-2 py-0.5 text-xs", active === t.key ? "bg-white/20" : "bg-canvas text-muted")}>{counts[t.key].toLocaleString("bg-BG")}</span>
        </Link>
      ))}
    </nav>
  );
}

/** A plain GET form: works without JavaScript and keeps the other query parameters given in `keep`. */
export function SearchBox({ action, q, placeholder, keep = {} }: { action: string; q: string; placeholder: string; keep?: Record<string, string> }) {
  return (
    <form action={action} method="get" role="search" className="flex w-full max-w-xl items-center gap-2">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex flex-1 items-center rounded-[0.875rem] border-2 border-line bg-white px-3 focus-within:border-sky">
        <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={100}
          className="w-full bg-transparent px-2 py-2.5 outline-none focus-visible:outline-none"
        />
      </label>
      <button type="submit" className="btn btn-primary h-12 px-5">
        Търси
      </button>
      {q ? (
        <Link href={Object.keys(keep).length ? `${action}?${new URLSearchParams(keep)}` : action} className="btn btn-ghost h-12 px-4" aria-label="Изчисти търсенето">
          <X className="h-4 w-4" />
        </Link>
      ) : null}
    </form>
  );
}

/** Page links: first, last and two around the current page. `href(n)` builds the address of page n. */
export function Pager({ page, pageCount, href }: { page: number; pageCount: number; href: (n: number) => string }) {
  if (pageCount <= 1) return null;
  const pages = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pageCount])].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  return (
    <nav aria-label="Страници" className="mt-5 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className="grid h-10 w-10 place-items-center rounded-full border-2 border-line bg-white hover:border-ink" aria-label="Предишна страница" rel="prev">
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : null}
      {pages.map((n, i) => (
        <span key={n} className="contents">
          {i > 0 && n - pages[i - 1] > 1 ? <span className="px-1 text-muted">…</span> : null}
          <Link
            href={href(n)}
            aria-current={n === page ? "page" : undefined}
            className={clsx("grid h-10 min-w-10 place-items-center rounded-full px-2 font-bold", n === page ? "bg-ink text-white" : "border-2 border-line bg-white hover:border-ink")}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pageCount ? (
        <Link href={href(page + 1)} className="grid h-10 w-10 place-items-center rounded-full border-2 border-line bg-white hover:border-ink" aria-label="Следваща страница" rel="next">
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </nav>
  );
}
