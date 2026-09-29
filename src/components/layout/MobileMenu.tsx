"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, Clock, Heart, Mail, Menu, Phone, UserRound } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { plural } from "@/lib/format";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import type { MenuItem } from "@/lib/settings-types";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { Drawer } from "@/components/ui/Drawer";
import { CategoryIcon } from "./CategoryIcon";
import { LangSwitch } from "./LangSwitch";
import { MenuLabel, menuItemProps } from "./MenuLabel";
import { SmartLink, visibleColumns } from "./NavDropdown";
import type { NavCategory, NavGoal } from "./nav-types";

export type MobileMenuContacts = { phone: string; email: string; hours: string };

/**
 * The menu below `lg`: a hamburger that opens a drawer from the left with the admin's menu links, the categories
 * (accordion with subcategories), goals, account links, the language switch and the contacts.
 */
export function MobileMenu({
  categories,
  goals,
  items,
  contacts,
}: {
  categories: NavCategory[];
  goals: NavGoal[];
  items: MenuItem[];
  contacts: MobileMenuContacts;
}) {
  const lang = useLang();
  const dict = useDict();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePublicPathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  const close = () => setOpen(false);
  const href = (path: string) => localizeHref(path, lang);
  const links = items.filter((i) => i.kind === "link");
  const heading = "px-2 text-[0.78rem] font-bold uppercase tracking-[0.08em] text-muted";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-canvas lg:hidden"
        aria-label={dict.header.openMenu}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Menu className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </button>

      <Drawer open={open} onClose={close} title={dict.common.menu} side="left" bodyClassName="pb-6">
        <nav aria-label={dict.nav.mainNav} className="space-y-6 p-3">
          {links.length ? (
            <div className="flex flex-wrap gap-2 px-1">
              {links.map((i) => {
                const p = menuItemProps(i.appearance);
                return (
                  <SmartLink
                    key={i.id}
                    href={i.href}
                    lang={lang}
                    onClick={close}
                    className={clsx(p.className, "min-h-10 py-1.5 text-sm", i.appearance.style === "plain" && "border-[1.5px] border-line")}
                    style={p.style}
                  >
                    <MenuLabel label={loc(i.label, lang)} appearance={i.appearance} />
                  </SmartLink>
                );
              })}
            </div>
          ) : null}

          {categories.length ? (
            <section aria-labelledby="mm-categories">
              <h3 id="mm-categories" className={heading}>
                {dict.nav.categories}
              </h3>
              <ul className="mt-2">
                {categories.map((c) => {
                  const isOpen = expanded === c.slug;
                  const subsId = `mm-subs-${c.slug}`;
                  return (
                    <li key={c.slug} className="border-b border-line/70 last:border-0">
                      <div className="flex items-center">
                        <Link href={href(`/kategoria/${c.slug}`)} onClick={close} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] px-2 py-1.5 font-semibold">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: c.color, color: c.accent }}>
                            <CategoryIcon icon={c.icon} className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 leading-snug">{c.name}</span>
                        </Link>
                        {c.subs.length ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : c.slug)}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-canvas"
                            aria-label={fmt(dict.nav.subcategoriesOf, { name: c.name })}
                            aria-expanded={isOpen}
                            aria-controls={subsId}
                          >
                            <ChevronDown className={clsx("h-5 w-5 transition", isOpen && "rotate-180")} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                      {c.subs.length ? (
                        <ul id={subsId} hidden={!isOpen} className="mb-2 ml-12 space-y-0.5 border-l-2 border-primary-50 pl-3">
                          {c.subs.map((s) => (
                            <li key={s.slug}>
                              <Link href={href(`/kategoria/${s.slug}`)} onClick={close} className="flex min-h-10 items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-ink-soft hover:bg-canvas hover:text-ink">
                                {s.name}
                              </Link>
                            </li>
                          ))}
                          <li>
                            <Link href={href(`/kategoria/${c.slug}`)} onClick={close} className="flex min-h-10 items-center px-2 py-1.5 text-sm font-semibold text-primary">
                              {fmt(dict.nav.seeAllIn, { name: c.name })} · {plural(lang, c.count, dict.common.products)}
                            </Link>
                          </li>
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {goals.length ? (
            <section aria-labelledby="mm-goals">
              <h3 id="mm-goals" className={heading}>
                {dict.nav.goals}
              </h3>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {goals.map((g) => (
                  <li key={g.slug}>
                    <Link
                      href={href(`/tsel/${g.slug}`)}
                      onClick={close}
                      className="flex h-full min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line px-2.5 py-2 text-sm font-medium hover:border-primary"
                    >
                      <CategoryIcon icon={g.icon} className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 leading-tight">{g.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {items.map((i) => {
            if (i.kind !== "dropdown") return null;
            const cols = visibleColumns(i.columns);
            // A dropdown that only lists goal pages would repeat the goals section above.
            const goalsOnly = goals.length > 0 && cols.length > 0 && cols.every((c) => c.kind === "links" && c.links.every((l) => /^\/tsel\//.test(l.href)));
            if (goalsOnly) return null;
            return (
              <details key={i.id} className="group rounded-[var(--radius-lg)] border border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-1.5" style={i.appearance.style === "plain" ? undefined : { color: i.appearance.color }}>
                    <MenuLabel label={loc(i.label, lang)} appearance={i.appearance} />
                  </span>
                  <ChevronDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  {cols.map((c) =>
                    c.kind === "image" ? (
                      c.href ? (
                        <SmartLink key={c.id} href={c.href} lang={lang} onClick={close} className="block font-semibold text-ink-soft">
                          {loc(c.title, lang) || dict.common.seeAll}
                        </SmartLink>
                      ) : null
                    ) : (
                      <div key={c.id}>
                        {loc(c.title, lang) ? <div className="mb-1.5 text-sm font-semibold text-muted">{loc(c.title, lang)}</div> : null}
                        <div className="flex flex-wrap gap-1.5">
                          {c.links.map((l) => (
                            <SmartLink key={l.id} href={l.href} lang={lang} onClick={close} className="chip min-h-9">
                              {loc(l.label, lang)}
                            </SmartLink>
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                  {i.href ? (
                    <SmartLink href={i.href} lang={lang} onClick={close} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary">
                      {fmt(dict.nav.seeAllIn, { name: loc(i.label, lang) })} →
                    </SmartLink>
                  ) : null}
                </div>
              </details>
            );
          })}

          <section className="grid grid-cols-2 gap-2">
            <Link href={href("/profil")} onClick={close} className="btn btn-ghost min-h-12 justify-start px-4">
              <UserRound className="h-5 w-5 shrink-0 text-primary" aria-hidden /> {dict.nav.myAccount}
            </Link>
            <Link href={href("/lyubimi")} onClick={close} className="btn btn-ghost min-h-12 justify-start px-4">
              <Heart className="h-5 w-5 shrink-0 text-primary" aria-hidden /> {dict.header.wishlist}
            </Link>
          </section>

          <section aria-labelledby="mm-lang" className="flex items-center justify-between gap-3 px-2">
            <h3 id="mm-lang" className="font-semibold">
              {dict.header.language}
            </h3>
            <LangSwitch size="md" />
          </section>

          <section aria-labelledby="mm-contacts" className="rounded-[var(--radius-lg)] bg-canvas p-4 text-sm">
            <h3 id="mm-contacts" className="font-semibold">
              {dict.nav.contacts}
            </h3>
            <ul className="mt-2 space-y-2">
              {contacts.phone ? (
                <li>
                  <a href={`tel:${contacts.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-9 items-center gap-2 font-semibold text-ink">
                    <Phone className="h-4 w-4 text-primary" aria-hidden /> {contacts.phone}
                  </a>
                </li>
              ) : null}
              {contacts.email ? (
                <li>
                  <a href={`mailto:${contacts.email}`} className="flex min-h-9 items-center gap-2 break-all text-ink-soft hover:text-ink">
                    <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {contacts.email}
                  </a>
                </li>
              ) : null}
              {contacts.hours ? (
                <li className="flex items-center gap-2 text-ink-soft">
                  <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {contacts.hours}
                </li>
              ) : null}
            </ul>
          </section>
        </nav>
      </Drawer>
    </>
  );
}
