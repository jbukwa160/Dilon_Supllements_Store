"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ArrowRight, Clock, Search, TrendingUp, X } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { ProductCard } from "@/lib/catalog-types";
import { formatNumber, formatPrice } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useConsent } from "@/components/consent/ConsentProvider";
import { ProductImage } from "@/components/product/ProductImage";
import { Spinner } from "@/components/ui/Spinner";

// The header search: suggestions while typing (products with picture and price, categories, brands) from
// GET /api/search?q=&lang=, popular searches when empty, and — only with "functional" cookie consent — the visitor's
// recent searches (localStorage). Keyboard: ↑ ↓ pick a suggestion, Enter opens it (or searches), Escape closes.
// Uses useSearchParams(): every placement must be inside <Suspense>.

type Suggest = {
  products: ProductCard[];
  total: number;
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
};

type Option = { id: string; href: string; term?: string };

const MIN_CHARS = 2;
const DEBOUNCE_MS = 180;
const RECENT_KEY = "sp-recent-searches";
const RECENT_MAX = 6;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    else localStorage.removeItem(RECENT_KEY);
  } catch {
    // Storage full or blocked: recent searches are only a convenience.
  }
}

export function SearchBox({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const lang = useLang();
  const dict = useDict();
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePublicPathname();
  const { consent } = useConsent();
  const remember = !!consent?.preferences;

  const [q, setQ] = useState(() => params.get("q") ?? "");
  // The suggestions of the last answered term (data null = the request failed).
  const [result, setResult] = useState<{ term: string; data: Suggest | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;

  // Leaving the page (a suggestion was followed, or the back button) closes the panel.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const term = q.trim();
  useEffect(() => {
    if (term.length < MIN_CHARS) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}&lang=${lang}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<Suggest>) : null))
        .then((data) => setResult({ term, data }))
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) setResult({ term, data: null });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, lang]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const searchHref = (t: string) => localizeHref(`/tarsene?q=${encodeURIComponent(t)}`, lang);
  const typing = term.length >= MIN_CHARS;
  // While the next answer is on its way the previous suggestions stay (dimmed) instead of flickering away.
  const data = typing ? (result?.data ?? null) : null;
  const loading = typing && result?.term !== term;
  const popular = dict.search.popularTerms;
  const recentShown = remember ? recent : [];

  // Every selectable row in display order (the ↑ ↓ keys walk through them).
  const options: Option[] = [];
  if (data) {
    data.categories.forEach((c) => options.push({ id: `${uid}-c-${c.slug}`, href: localizeHref(`/kategoria/${c.slug}`, lang) }));
    data.brands.forEach((b) => options.push({ id: `${uid}-b-${b.slug}`, href: localizeHref(`/marka/${b.slug}`, lang) }));
    data.products.forEach((p) => options.push({ id: `${uid}-p-${p.id}`, href: localizeHref(`/produkt/${p.slug}`, lang) }));
    if (data.total > 0) options.push({ id: `${uid}-all`, href: searchHref(term) });
  } else if (!typing) {
    recentShown.forEach((t, i) => options.push({ id: `${uid}-r-${i}`, href: searchHref(t), term: t }));
    popular.forEach((t, i) => options.push({ id: `${uid}-t-${i}`, href: searchHref(t), term: t }));
  }
  const panelVisible = open && (typing ? !!data : options.length > 0);
  const activeOption = panelVisible && active >= 0 ? options[active] : undefined;
  const isActive = (id: string) => activeOption?.id === id;

  const rememberTerm = (t: string) => {
    if (!remember || !t) return;
    const next = [t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
    writeRecent(next);
    setRecent(next);
  };

  const done = (t?: string) => {
    if (t) rememberTerm(t);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    onNavigate?.();
  };

  const go = (href: string, t?: string) => {
    done(t);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      const n = options.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1 >= n ? 0 : i + 1) : i <= 0 ? n - 1 : i - 1));
      return;
    }
    if (e.key === "Enter" && activeOption) {
      e.preventDefault();
      go(activeOption.href, activeOption.term ?? (activeOption.id === `${uid}-all` ? term : undefined));
    }
  };

  const optionClass = (id: string) => (isActive(id) ? "bg-primary-50" : "hover:bg-canvas");

  return (
    <div ref={boxRef} className={clsx("relative w-full", className)}>
      <form
        role="search"
        action={localizeHref("/tarsene", lang)}
        onSubmit={(e) => {
          e.preventDefault();
          if (!term) {
            inputRef.current?.focus();
            return;
          }
          go(searchHref(term), term);
        }}
        className="flex h-12 items-center rounded-pill border-[1.5px] border-[#cfcfcf] bg-surface pl-4 pr-1.5 transition focus-within:border-ink focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]"
      >
        {loading ? <Spinner className="h-5 w-5 shrink-0 text-muted" /> : <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
        <label htmlFor={`${uid}-q`} className="sr-only">
          {dict.search.label}
        </label>
        <input
          ref={inputRef}
          id={`${uid}-q`}
          name="q"
          type="search"
          value={q}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={100}
          placeholder={dict.search.placeholderShort}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(remember ? readRecent() : []);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={panelVisible}
          aria-activedescendant={activeOption?.id}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setActive(-1);
              inputRef.current?.focus();
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-pill text-muted hover:bg-canvas hover:text-ink"
            aria-label={dict.search.clear}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary ml-1 min-h-10 min-w-11 shrink-0 rounded-pill px-3 text-[0.8rem] sm:px-5" aria-label={dict.search.submit}>
          <Search className="h-4 w-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">{dict.search.submit}</span>
        </button>
      </form>

      <div
        id={listId}
        role="listbox"
        aria-label={dict.search.suggestions}
        hidden={!panelVisible}
        aria-busy={loading}
        className={clsx(
          "absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(70dvh,34rem)] animate-fade-in overflow-y-auto overscroll-contain rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-overlay)] transition-opacity",
          loading && data && "opacity-70",
        )}
      >
        {data ? (
          <>
            {data.categories.length || data.brands.length ? (
              <div role="group" aria-label={dict.search.categories} className="flex flex-wrap gap-2 border-b border-line p-3">
                {data.categories.map((c) => {
                  const id = `${uid}-c-${c.slug}`;
                  return (
                    <Link
                      key={id}
                      id={id}
                      role="option"
                      aria-selected={isActive(id)}
                      href={localizeHref(`/kategoria/${c.slug}`, lang)}
                      onClick={() => done()}
                      className={clsx("chip bg-primary-50 text-primary-700", isActive(id) ? "border-primary" : "border-primary-50")}
                    >
                      {c.name}
                    </Link>
                  );
                })}
                {data.brands.map((b) => {
                  const id = `${uid}-b-${b.slug}`;
                  return (
                    <Link
                      key={id}
                      id={id}
                      role="option"
                      aria-selected={isActive(id)}
                      href={localizeHref(`/marka/${b.slug}`, lang)}
                      onClick={() => done()}
                      className={clsx("chip", isActive(id) && "border-primary")}
                    >
                      {fmt(dict.search.brand, { name: b.name })}
                    </Link>
                  );
                })}
              </div>
            ) : null}
            {data.products.length ? (
              <div role="group" aria-label={dict.search.products} className="py-1">
                {data.products.map((p) => {
                  const id = `${uid}-p-${p.id}`;
                  return (
                    <Link
                      key={id}
                      id={id}
                      role="option"
                      aria-selected={isActive(id)}
                      href={localizeHref(`/produkt/${p.slug}`, lang)}
                      onClick={() => done(term)}
                      className={clsx("flex items-center gap-3 px-3 py-2", optionClass(id))}
                    >
                      <span className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] border border-line bg-surface p-1">
                        <ProductImage src={p.image} alt="" dim={!p.inStockAny} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</span>
                        {p.brand || p.variantLabel ? (
                          <span className="block truncate text-xs text-muted">{[p.brand, p.variantLabel].filter(Boolean).join(" · ")}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right text-sm font-bold tabular-nums">
                        {p.priceFrom ? fmt(dict.common.price.from, { price: formatPrice(p.price, lang) }) : formatPrice(p.price, lang)}
                        {p.oldPrice && p.oldPrice > p.price ? (
                          <span className="block text-xs font-medium text-muted line-through">{formatPrice(p.oldPrice, lang)}</span>
                        ) : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted">{fmt(dict.search.none, { q: result?.term ?? term })}</p>
            )}
            {data.total > 0 ? (
              <Link
                id={`${uid}-all`}
                role="option"
                aria-selected={isActive(`${uid}-all`)}
                href={searchHref(term)}
                onClick={() => done(term)}
                className={clsx(
                  "flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-sm font-semibold text-primary",
                  isActive(`${uid}-all`) ? "bg-primary-50" : "bg-canvas hover:underline",
                )}
              >
                {data.total === 1 ? dict.search.seeAllResultsOne : fmt(dict.search.seeAllResults, { n: formatNumber(data.total, lang) })}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
          </>
        ) : !typing ? (
          <div className="space-y-4 p-4">
            {recentShown.length ? (
              <div role="group" aria-label={dict.search.recent}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[0.78rem] font-bold uppercase tracking-[0.08em] text-muted">{dict.search.recent}</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                    onClick={() => {
                      writeRecent([]);
                      setRecent([]);
                      setActive(-1);
                      inputRef.current?.focus();
                    }}
                  >
                    {dict.search.clearRecent}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentShown.map((t, i) => {
                    const id = `${uid}-r-${i}`;
                    return (
                      <Link key={id} id={id} role="option" aria-selected={isActive(id)} href={searchHref(t)} onClick={() => done(t)} className={clsx("chip", isActive(id) && "border-primary")}>
                        <Clock className="h-3.5 w-3.5 text-muted" aria-hidden /> {t}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div role="group" aria-label={dict.search.popular}>
              <p className="mb-2 text-[0.78rem] font-bold uppercase tracking-[0.08em] text-muted">{dict.search.popular}</p>
              <div className="flex flex-wrap gap-2">
                {popular.map((t, i) => {
                  const id = `${uid}-t-${i}`;
                  return (
                    <Link key={id} id={id} role="option" aria-selected={isActive(id)} href={searchHref(t)} onClick={() => done(t)} className={clsx("chip", isActive(id) && "border-primary")}>
                      <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden /> {t}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
