"use client";

import { useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { contrastText, paletteColor } from "@/lib/settings-types";
import { ProductImage } from "@/components/product/ProductImage";
import { CategoryIcon } from "./CategoryIcon";
import type { NavCategory, NavGoal } from "./nav-types";
import { focusables, useDisclosureMenu } from "./use-menu";

/**
 * "Всички категории" (desktop nav bar): categories on the left — hovering or focusing one shows its subcategories
 * and most stocked brands in the middle — and the goals ("Пазарувай по цел") on the right.
 * Keyboard: ↓ on the button opens it; ↑ ↓ move between categories, → jumps into the category's links, ← back.
 */
export function MegaMenu({ categories, goals, label, color }: { categories: NavCategory[]; goals: NavGoal[]; label: string; color: string }) {
  const lang = useLang();
  const dict = useDict();
  const panelId = useId();
  const { open, rootRef, buttonRef, close, rootProps, buttonProps } = useDisclosureMenu();
  const [active, setActive] = useState(categories[0]?.slug ?? "");
  const current = categories.find((c) => c.slug === active) ?? categories[0];
  const href = (path: string) => localizeHref(path, lang);
  const bg = paletteColor(color);

  const onListKeys = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const items = focusables(e.currentTarget);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusables(rootRef.current?.querySelector("[data-mega-detail]"))[0]?.focus();
    }
  };
  const onDetailKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = focusables(e.currentTarget);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      rootRef.current?.querySelector<HTMLElement>(`[data-cat="${current?.slug}"]`)?.focus();
    }
  };

  if (!categories.length) return null;
  return (
    <div ref={rootRef} className="relative" {...rootProps}>
      <button
        ref={buttonRef}
        type="button"
        aria-controls={panelId}
        className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] px-4 text-[0.9rem] font-extrabold uppercase tracking-[0.01em] transition hover:brightness-110"
        style={{ background: bg, color: contrastText(bg) }}
        {...buttonProps}
      >
        <LayoutGrid className="h-5 w-5" aria-hidden />
        {label}
        <ChevronDown className={clsx("h-4 w-4 transition", open && "rotate-180")} aria-hidden />
      </button>

      <div
        id={panelId}
        data-menu-panel
        hidden={!open}
        className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-[min(1256px,calc(100vw-3rem))] animate-fade-in overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-overlay)]"
      >
        <div className="grid h-[min(40rem,calc(100dvh-12rem))] grid-cols-[17rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">
          <ul className="overflow-y-auto border-r border-line bg-canvas p-2" onKeyDown={onListKeys}>
            {categories.map((c) => {
              const on = c.slug === current?.slug;
              return (
                <li key={c.slug}>
                  <Link
                    href={href(`/kategoria/${c.slug}`)}
                    data-cat={c.slug}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setActive(c.slug)}
                    onFocus={() => setActive(c.slug)}
                    onClick={close}
                    aria-current={on ? "true" : undefined}
                    className={clsx(
                      "flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[0.93rem] font-semibold transition",
                      on ? "bg-surface text-primary shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink hover:text-primary",
                    )}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: c.color, color: c.accent }}>
                      <CategoryIcon icon={c.icon} className="h-[1.1rem] w-[1.1rem]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <ChevronRight className={clsx("h-4 w-4 shrink-0 transition", on ? "text-primary" : "text-muted/60")} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>

          {current ? (
            <div data-mega-detail className="min-w-0 overflow-y-auto p-6 xl:p-7" onKeyDown={onDetailKeys}>
              <div className="flex items-start gap-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-muted">{plural(lang, current.count, dict.common.products)}</p>
                  <h3 className="mt-0.5 text-2xl font-extrabold uppercase leading-tight tracking-[-0.01em]">
                    <Link href={href(`/kategoria/${current.slug}`)} onClick={close} className="hover:text-primary">
                      {current.name}
                    </Link>
                  </h3>
                  {current.tagline ? <p className="mt-1 text-[0.95rem] text-ink-soft">{current.tagline}</p> : null}
                </div>
                {current.image ? (
                  <span className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-full p-3 xl:block" style={{ background: current.color }} aria-hidden>
                    <ProductImage src={current.image} alt="" className="mix-blend-multiply" />
                  </span>
                ) : null}
              </div>

              {current.subs.length ? (
                <ul className="mt-5 grid grid-cols-2 gap-2 2xl:grid-cols-3" aria-label={fmt(dict.nav.subcategoriesOf, { name: current.name })}>
                  {current.subs.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={href(`/kategoria/${s.slug}`)}
                        onClick={close}
                        className="group flex h-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line px-3.5 py-2.5 font-medium transition hover:border-primary hover:bg-primary-50"
                      >
                        <span className="min-w-0">{s.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted group-hover:text-primary-700">{s.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              {current.brands.length ? (
                <>
                  <h4 className="mb-2.5 mt-6 text-[0.78rem] font-bold uppercase tracking-[0.08em] text-muted">{dict.nav.popularBrands}</h4>
                  <ul className="flex flex-wrap gap-2">
                    {current.brands.map((b) => (
                      <li key={b.slug}>
                        <Link href={href(`/kategoria/${current.slug}?marka=${encodeURIComponent(b.slug)}`)} onClick={close} className="chip">
                          {b.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <Link
                href={href(`/kategoria/${current.slug}`)}
                onClick={close}
                className="mt-6 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                {fmt(dict.nav.seeAllIn, { name: current.name })} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : null}

          {goals.length ? (
            <div className="hidden overflow-y-auto border-l border-line bg-canvas/60 p-5 xl:block">
              <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.08em] text-muted">{dict.nav.goals}</h3>
              <ul className="mt-3 space-y-0.5">
                {goals.map((g) => (
                  <li key={g.slug}>
                    <Link
                      href={href(`/tsel/${g.slug}`)}
                      onClick={close}
                      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 font-medium text-ink-soft transition hover:bg-surface hover:text-ink"
                    >
                      <CategoryIcon icon={g.icon} className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 leading-snug">{g.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={href("/tseli")} onClick={close} className="mt-3 inline-flex items-center gap-1 px-2 text-sm font-semibold text-primary hover:underline">
                {dict.nav.allGoals} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
