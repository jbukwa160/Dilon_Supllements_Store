"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X } from "lucide-react";
import { useDict } from "@/i18n/client";
import { useOverlay } from "./use-overlay";

export type DrawerSide = "left" | "right" | "bottom";

const PANEL: Record<DrawerSide, string> = {
  // Full width on phones, a column on larger screens.
  right: "inset-y-0 right-0 w-full max-w-md animate-drawer-in",
  left: "inset-y-0 left-0 w-[88%] max-w-sm animate-drawer-in-left",
  // Bottom sheet (filters, variant picker on phones).
  bottom: "inset-x-0 bottom-0 max-h-[88dvh] w-full rounded-t-[var(--radius-xl)] animate-sheet-up",
};

/**
 * A panel that slides in from a side of the screen (cart, mobile menu, filters). Modal: focus is trapped inside,
 * Escape and the backdrop close it, the page behind doesn't scroll, and it is labelled by its title.
 * Render it always and toggle `open` (nothing is in the DOM while closed).
 */
export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  footer,
  children,
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  side?: DrawerSide;
  /** Sticky area under the scrolling body (totals, "Към поръчката"). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const dict = useDict();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(open, panel, onClose);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx("absolute flex flex-col bg-surface shadow-[var(--shadow-overlay)] outline-none", PANEL[side], className)}
      >
        {side === "bottom" ? <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-pill bg-line" aria-hidden /> : null}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-2 pl-4 pr-2 md:pl-5">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-canvas" aria-label={dict.common.close}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={clsx("min-h-0 flex-1 overflow-y-auto overscroll-contain", bodyClassName)}>{children}</div>
        {footer ? <div className="shrink-0 border-t border-line p-4 md:p-5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
