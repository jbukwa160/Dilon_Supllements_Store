"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicPathname } from "@/lib/use-public-pathname";

// Disclosure menus of the nav bar (mega menu, dropdowns): a button with aria-expanded that shows a panel
// of links. Opens on click / Enter / Space, and on mouse hover with a short intent delay (touch never "hovers").
// Closes on Escape (focus goes back to the button), on a click outside, when focus leaves it, and after navigating.

const OPEN_DELAY = 150;
const CLOSE_DELAY = 200;

export function useDisclosureMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePublicPathname();
  const [lastPath, setLastPath] = useState(pathname);
  // Close after navigating (adjusting state during render, not in an effect).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Opened by hovering: the click that usually follows must not close it again.
  const openedByHover = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const schedule = (e: React.PointerEvent, show: boolean) => {
    if (e.pointerType !== "mouse") return;
    clearTimer();
    timer.current = setTimeout(
      () => {
        openedByHover.current = show;
        setOpen(show);
      },
      show ? OPEN_DELAY : CLOSE_DELAY,
    );
  };

  return {
    open,
    rootRef,
    buttonRef,
    close: () => {
      clearTimer();
      setOpen(false);
    },
    /** Spread on the wrapper that holds the button and the panel. */
    rootProps: {
      onPointerEnter: (e: React.PointerEvent) => schedule(e, true),
      onPointerLeave: (e: React.PointerEvent) => schedule(e, false),
      onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
        // Tabbing out of the menu closes it (a click on empty space inside moves focus to <body>: related = null).
        const next = e.relatedTarget as Node | null;
        if (next && !e.currentTarget.contains(next)) setOpen(false);
      },
    },
    /** Spread on the toggle button. */
    buttonProps: {
      "aria-expanded": open,
      onClick: () => {
        clearTimer();
        if (open && openedByHover.current) {
          openedByHover.current = false;
          return;
        }
        openedByHover.current = false;
        setOpen((o) => !o);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== "ArrowDown") return;
        e.preventDefault();
        openedByHover.current = false;
        setOpen(true);
        // Focus the first link once the panel is rendered.
        requestAnimationFrame(() => focusables(rootRef.current?.querySelector("[data-menu-panel]"))[0]?.focus());
      },
    },
  };
}

export function focusables(root: Element | null | undefined): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).filter((n) => n.getClientRects().length > 0);
}

/** ArrowUp / ArrowDown (and Home / End) move between the links of a menu panel. */
export function onPanelArrowKeys(e: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = focusables(e.currentTarget);
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next]?.focus();
}
