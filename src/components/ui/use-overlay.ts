"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

// Modal behaviour shared by Drawer and Dialog. Overlays can be stacked (a dialog opened from the cart drawer):
// only the top one reacts to Escape / Tab, and the page scroll stays locked until the last one closes.

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const stack: symbol[] = [];
let saved: { overflow: string; paddingRight: string } | null = null;

function lockScroll() {
  if (saved) return;
  const body = document.body;
  saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  // Keep the page from shifting sideways when its scrollbar disappears.
  const bar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (bar > 0) body.style.paddingRight = `${bar}px`;
}

function unlockScroll() {
  if (stack.length || !saved) return;
  document.body.style.overflow = saved.overflow;
  document.body.style.paddingRight = saved.paddingRight;
  saved = null;
}

/**
 * While `open`: focus moves into `panel` (its first `[data-autofocus]` element, else the panel itself, which needs
 * tabIndex={-1}), Tab / Shift+Tab cycle inside it, Escape calls onClose, the page behind doesn't scroll, and focus
 * goes back to where it was when the overlay closes.
 */
export function useOverlay(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const requestClose = useEffectEvent(() => onClose());

  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const token = Symbol("overlay");
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(token);
    lockScroll();
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getClientRects().length > 0);
      if (!items.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!el.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      unlockScroll();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, panel]);
}
