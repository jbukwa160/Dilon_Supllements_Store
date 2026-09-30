"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { useDict } from "@/i18n/client";

// Phones and tablets (< lg): the header's full-width search row slides up behind the logo row while the visitor scrolls down and
// comes back on the first scroll up (reference-ux §7); a search icon in the logo row brings it back on demand.
// No layout shift: the row is positioned absolutely under the sticky header and a static spacer of the same height
// (rendered by Header after </header>, h-[61px]) reserves its place at the top of the page, so collapsing
// never moves the content (and never fights the browser's scroll anchoring). The logo row sits above it (z-10, opaque).

/** Height of the row (48 px field + 12 px bottom padding + 1 px border). Keep Header's spacer in sync. */
const ROW_HEIGHT = "h-[61px]";

/** Scroll distance in one direction that toggles the row; small jitters (momentum, address bar) are ignored. */
const DELTA = 24;
/** Above this scroll position the row is always shown (the top of the page). */
const TOP = 160;

let collapsed = false;
const listeners = new Set<() => void>();
function setCollapsed(v: boolean) {
  if (v === collapsed) return;
  collapsed = v;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const useCollapsed = () =>
  useSyncExternalStore(
    subscribe,
    () => collapsed,
    () => false,
  );

/** The search row itself (children = the SearchBox). Hidden from `lg` up (the search sits in the logo row there). */
export function PhoneSearchRow({ children }: { children: React.ReactNode }) {
  const hidden = useCollapsed();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastY = window.scrollY;
    let run = 0; // accumulated distance in the current direction (+ down, − up)
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (window.matchMedia("(min-width: 1024px)").matches || y < TOP) {
        run = 0;
        setCollapsed(false);
        return;
      }
      // Never hide the field while it is being used (typing, suggestions open).
      if (ref.current?.contains(document.activeElement)) return;
      if (dy === 0) return;
      if (Math.sign(dy) !== Math.sign(run)) run = 0;
      run += dy;
      if (run > DELTA) setCollapsed(true);
      else if (run < -DELTA) setCollapsed(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      setCollapsed(false);
    };
  }, []);

  // The header (group/header) shows its bottom border while the row is tucked away.
  useEffect(() => {
    const header = ref.current?.closest("header");
    if (!header) return;
    if (hidden) header.setAttribute("data-search-collapsed", "");
    else header.removeAttribute("data-search-collapsed");
  }, [hidden]);

  return (
    <div
      ref={ref}
      data-phone-search
      inert={hidden}
      aria-hidden={hidden || undefined}
      className={clsx(
        "absolute inset-x-0 top-full border-b border-line bg-surface transition-transform duration-200 ease-out lg:hidden",
        ROW_HEIGHT,
        hidden ? "-translate-y-full" : "translate-y-0",
      )}
    >
      <div className="container-shop pb-3">{children}</div>
    </div>
  );
}

/** Search icon for the logo row: shown on phones and tablets only while the row is tucked away; brings it back and focuses it. */
export function PhoneSearchButton() {
  const hidden = useCollapsed();
  const t = useDict().header;
  if (!hidden) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setCollapsed(false);
        // After the row is interactive again (inert removed on the next render).
        // preventScroll: the row is already on screen; without it Chrome scrolls to the sticky header's place in the page.
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-phone-search] input")?.focus({ preventScroll: true }));
      }}
      className="grid h-11 w-11 animate-fade-in place-items-center rounded-pill transition hover:bg-canvas lg:hidden"
      aria-label={t.search}
      data-phone-search-toggle
    >
      <Search className="h-6 w-6" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
