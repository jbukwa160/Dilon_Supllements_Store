"use client";

import { useId } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, ChevronDown } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { useLang } from "@/i18n/client";
import type { Lang } from "@/i18n/config";
import { loc } from "@/lib/l10n";
import { isExternalHref, localizeHref } from "@/lib/links";
import { INK, paletteColor, type MenuColumn, type MenuItem } from "@/lib/settings-types";
import { MenuLabel, menuItemProps } from "./MenuLabel";
import { onPanelArrowKeys, useDisclosureMenu } from "./use-menu";

/** A link typed by the admin: internal paths get the page's language, external ones open in a new tab. */
export function SmartLink({
  href,
  lang,
  className,
  style,
  children,
  onClick,
}: {
  href: string;
  lang: Lang;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const external = isExternalHref(href);
  return (
    <Link
      href={localizeHref(href, lang)}
      className={className}
      style={style}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener" : undefined}
    >
      {children}
    </Link>
  );
}

/** Columns worth showing: pictures with an image, link lists with links or a title. */
export function visibleColumns(columns: MenuColumn[]): MenuColumn[] {
  return columns.filter((c) => (c.kind === "image" ? !!c.image : c.links.length > 0 || !!c.title.bg));
}

/**
 * One column of a dropdown: a titled list of links or a picture with a link. Also rendered by the admin's menu
 * preview (Admin → Меню), so no hooks: the language comes as a prop (Bulgarian by default).
 */
export function MenuColumnView({ column: c, accent, lang = "bg" }: { column: MenuColumn; accent: string; lang?: Lang }) {
  const title = loc(c.title, lang);
  if (c.kind === "image") {
    const body = (
      <>
        <span className="block aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] bg-canvas">
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
          ) : null}
        </span>
        {title ? <span className="mt-2 flex items-center gap-1 font-semibold group-hover:underline">{title}</span> : null}
      </>
    );
    return c.href ? (
      <SmartLink href={c.href} lang={lang} className="group block">
        {body}
      </SmartLink>
    ) : (
      <div>{body}</div>
    );
  }
  return (
    <div className="min-w-0">
      {title ? (
        c.href ? (
          <SmartLink href={c.href} lang={lang} className="mb-2 block text-[0.8rem] font-bold uppercase tracking-[0.08em] hover:underline" style={{ color: accent }}>
            {title}
          </SmartLink>
        ) : (
          <div className="mb-2 text-[0.8rem] font-bold uppercase tracking-[0.08em]" style={{ color: accent }}>
            {title}
          </div>
        )
      ) : null}
      <ul className="space-y-0.5">
        {c.links.map((l) => (
          <li key={l.id}>
            <SmartLink href={l.href} lang={lang} className="-mx-2 block rounded-[var(--radius-sm)] px-2 py-1.5 font-medium text-ink-soft hover:bg-canvas hover:text-ink">
              {loc(l.label, lang)}
            </SmartLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A "dropdown" item of the top menu (e.g. "Цели"): columns of links and pictures under a button. */
export function NavDropdown({ item }: { item: MenuItem }) {
  const lang = useLang();
  const dict = getDict(lang);
  const panelId = useId();
  const { open, rootRef, buttonRef, rootProps, buttonProps } = useDisclosureMenu();
  const p = menuItemProps(item.appearance, open);
  const accent = item.appearance.style === "plain" ? INK : paletteColor(item.appearance.color);
  const cols = visibleColumns(item.columns);
  const label = loc(item.label, lang);
  const hasPanel = cols.length > 0 || !!item.href;

  if (!hasPanel) return null;
  return (
    <div ref={rootRef} className="relative" {...rootProps}>
      <button ref={buttonRef} type="button" aria-controls={panelId} className={p.className} style={p.style} {...buttonProps}>
        <MenuLabel label={label} appearance={item.appearance} />
        <ChevronDown className={clsx("h-4 w-4 opacity-60 transition", open && "rotate-180")} aria-hidden />
      </button>
      <div
        id={panelId}
        data-menu-panel
        hidden={!open}
        onKeyDown={onPanelArrowKeys}
        className="absolute left-0 top-[calc(100%+0.5rem)] z-50 max-w-[calc(100vw-3rem)] animate-fade-in rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-overlay)]"
        style={{ width: `${Math.max(1, cols.length) * 220 + 48}px` }}
      >
        {cols.length ? (
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
            {cols.map((c) => (
              <MenuColumnView key={c.id} column={c} accent={accent} lang={lang} />
            ))}
          </div>
        ) : null}
        {item.href ? (
          <SmartLink
            href={item.href}
            lang={lang}
            className={clsx("inline-flex items-center gap-1 font-semibold text-primary hover:underline", cols.length && "mt-5 w-full border-t border-line pt-4")}
          >
            {fmt(dict.nav.seeAllIn, { name: label })} <ArrowRight className="h-4 w-4" aria-hidden />
          </SmartLink>
        ) : null}
      </div>
    </div>
  );
}
