"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, LoaderCircle, Search } from "lucide-react";
import { findProductsAction, type PickerProduct } from "@/app/admin/_actions/product-search";
import { safeHref } from "@/lib/settings-types";

// Links are stored LANGUAGE-NEUTRAL: the Bulgarian path ("/kategoria/proteini"). The storefront adds "/en" on English
// pages (localizeHref), so the admin picks a link once for both languages. Options come from lib/admin/link-options.

export type LinkOptions = {
  categories: { slug: string; name: string; subs: { slug: string; name: string }[] }[];
  brands: { slug: string; name: string }[];
  goals: { slug: string; name: string }[];
  posts: { slug: string; title: string }[];
};

const PAGES = [
  { href: "/", label: "Начална страница" },
  { href: "/produkti", label: "Всички продукти" },
  { href: "/promotsii", label: "Промоции" },
  { href: "/novi", label: "Нови продукти" },
  { href: "/marki", label: "Всички марки" },
  { href: "/tseli", label: "Пазарувай по цел" },
  { href: "/blog", label: "Блог" },
  { href: "/dostavka", label: "Доставка и плащане" },
  { href: "/vrashtane", label: "Връщане и отказ от поръчка" },
  { href: "/kontakti", label: "Контакти" },
  { href: "/obshti-usloviya", label: "Общи условия" },
  { href: "/poveritelnost", label: "Политика за поверителност" },
  { href: "/biskvitki", label: "Политика за бисквитки" },
  { href: "/otkaz-ot-dogovor", label: "Отказ от договора" },
  { href: "/registratsia", label: "Регистрация" },
  { href: "/vhod", label: "Вход в профила" },
];

type Kind = "none" | "page" | "category" | "brand" | "goal" | "product" | "blog" | "search" | "custom";

const KIND_LABELS: Record<Kind, string> = {
  none: "Без връзка",
  page: "Страница от сайта",
  category: "Категория",
  brand: "Марка",
  goal: "Цел (мускулна маса, имунитет…)",
  product: "Конкретен продукт",
  blog: "Статия от блога",
  search: "Резултати от търсене",
  custom: "Друг адрес (линк)",
};

function detect(href: string): Kind {
  if (!href) return "none";
  if (PAGES.some((p) => p.href === href)) return "page";
  if (/^\/kategoria\/[a-z0-9-]+$/.test(href)) return "category";
  if (/^\/marka\/[a-z0-9-]+$/.test(href)) return "brand";
  if (/^\/tsel\/[a-z0-9-]+$/.test(href)) return "goal";
  if (/^\/produkt\/[a-z0-9-]+$/.test(href)) return "product";
  if (/^\/blog\/[a-z0-9-]+$/.test(href)) return "blog";
  if (/^\/tarsene\?q=/.test(href)) return "search";
  return "custom";
}

export function LinkPicker({ value, onChange, options, allowEmpty = true }: { value: string; onChange: (href: string) => void; options: LinkOptions; allowEmpty?: boolean }) {
  const [kind, setKind] = useState<Kind>(() => detect(value));
  const [brandText, setBrandText] = useState(() => options.brands.find((b) => `/marka/${b.slug}` === value)?.name ?? "");
  const [searchText, setSearchText] = useState(() => (value.startsWith("/tarsene?q=") ? decodeURIComponent(value.slice(11).replace(/\+/g, " ")) : ""));
  const [productQuery, setProductQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [searching, start] = useTransition();

  useEffect(() => {
    if (kind !== "product" || productQuery.trim().length < 2) return;
    const t = setTimeout(() => start(async () => setResults(await findProductsAction(productQuery))), 250);
    return () => clearTimeout(t);
  }, [productQuery, kind]);

  const kinds = (Object.keys(KIND_LABELS) as Kind[]).filter((k) => allowEmpty || k !== "none");
  const valid = safeHref(value) !== null;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <select
          className="field cursor-pointer"
          value={kind}
          onChange={(e) => {
            const k = e.target.value as Kind;
            setKind(k);
            if (k === "none") onChange("");
            if (k === "page") onChange(PAGES[0].href);
            if (k === "category") onChange(`/kategoria/${options.categories[0]?.slug ?? ""}`);
            if (k === "goal") onChange(`/tsel/${options.goals[0]?.slug ?? ""}`);
            if (k === "blog") onChange(options.posts[0] ? `/blog/${options.posts[0].slug}` : "/blog");
            if (k === "brand" || k === "product" || k === "search" || k === "custom") onChange(k === "custom" ? value : "");
          }}
          aria-label="Вид връзка"
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>

        {kind === "page" ? (
          <select className="field cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Страница">
            {PAGES.map((p) => (
              <option key={p.href} value={p.href}>
                {p.label}
              </option>
            ))}
          </select>
        ) : kind === "category" ? (
          <select className="field cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Категория">
            {options.categories.map((c) => (
              <optgroup key={c.slug} label={c.name}>
                <option value={`/kategoria/${c.slug}`}>{c.name} — всички</option>
                {c.subs.map((s) => (
                  <option key={s.slug} value={`/kategoria/${s.slug}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : kind === "goal" ? (
          <select className="field cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Цел">
            {options.goals.map((g) => (
              <option key={g.slug} value={`/tsel/${g.slug}`}>
                {g.name}
              </option>
            ))}
          </select>
        ) : kind === "blog" ? (
          <select className="field cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Статия">
            {options.posts.length ? null : <option value="/blog">Няма публикувани статии</option>}
            {options.posts.map((p) => (
              <option key={p.slug} value={`/blog/${p.slug}`}>
                {p.title}
              </option>
            ))}
          </select>
        ) : kind === "brand" ? (
          <div>
            <input
              className="field"
              list="admin-brand-list"
              placeholder="Започнете да пишете марка, напр. Optimum Nutrition"
              value={brandText}
              onChange={(e) => {
                setBrandText(e.target.value);
                const b = options.brands.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
                onChange(b ? `/marka/${b.slug}` : "");
              }}
              aria-label="Марка"
            />
            <datalist id="admin-brand-list">
              {options.brands.map((b) => (
                <option key={b.slug} value={b.name} />
              ))}
            </datalist>
          </div>
        ) : kind === "search" ? (
          <input
            className="field"
            placeholder="Дума за търсене, напр. креатин"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              const q = e.target.value.trim();
              onChange(q ? `/tarsene?q=${encodeURIComponent(q)}` : "");
            }}
            aria-label="Дума за търсене"
          />
        ) : kind === "custom" ? (
          <input className="field" placeholder="https://… или /страница" value={value} onChange={(e) => onChange(e.target.value.trim())} aria-label="Адрес" />
        ) : kind === "product" ? (
          <div className="relative">
            <div className="flex items-center rounded-[0.875rem] border-2 border-line bg-white px-3 focus-within:border-sky">
              {searching ? <LoaderCircle className="h-4 w-4 animate-spin text-muted" /> : <Search className="h-4 w-4 text-muted" />}
              <input
                className="w-full bg-transparent px-2 py-2.5 outline-none focus-visible:outline-none"
                placeholder="Търсете продукт по име, код или баркод"
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  if (e.target.value.trim().length < 2) setResults([]);
                }}
                aria-label="Търсене на продукт"
              />
            </div>
            {results.length && productQuery ? (
              <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line bg-white py-1 shadow-[var(--shadow-lift)]">
                {results.map((r) => (
                  <li key={r.sku}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas"
                      onClick={() => {
                        onChange(`/produkt/${r.slug}`);
                        setChosenName(r.variant ? `${r.name} · ${r.variant}` : r.name);
                        setProductQuery("");
                        setResults([]);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.image ?? "/placeholder.svg"} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-contain" referrerPolicy="no-referrer" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-sm font-bold">{r.name}</span>
                        <span className="text-xs text-muted">
                          {r.variant ? `${r.variant} · ` : ""}
                          {r.sku}
                          {r.ean ? ` · баркод ${r.ean}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center text-sm text-muted">Бутонът няма да води никъде.</div>
        )}
      </div>

      {value ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Води към:</span>
          <code className="rounded-md bg-canvas px-2 py-0.5 text-ink-soft">{kind === "product" && chosenName ? chosenName : value}</code>
          {valid ? (
            <a href={value} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-bold text-sky hover:underline">
              Провери <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="font-bold text-brand">Невалиден адрес — трябва да започва с https:// или /</span>
          )}
        </p>
      ) : kind === "brand" && brandText ? (
        <p className="text-sm font-bold text-brand">Изберете марка от списъка.</p>
      ) : null}
      {value && kind !== "custom" ? <p className="text-xs text-muted">В английската версия на сайта връзката води към същата страница на английски.</p> : null}
    </div>
  );
}
