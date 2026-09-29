"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X } from "lucide-react";
import { useDict } from "@/i18n/client";
import { useOverlay } from "./use-overlay";

const SIZES = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" } as const;

/**
 * A modal dialog (cookie settings, quick view, confirmations): centred from `sm` up, a bottom sheet on phones.
 * Same behaviour as Drawer: focus trap, Escape / backdrop close, scroll lock, labelled by its title (and described
 * by `description` when given). Put `data-autofocus` on the element that should get focus first.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const dict = useDict();
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(open, panel, onClose);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={clsx(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-[var(--radius-xl)] bg-surface shadow-[var(--shadow-overlay)] outline-none animate-sheet-up sm:rounded-[var(--radius-xl)] sm:animate-fade-in",
          SIZES[size],
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4 md:px-6 md:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold leading-snug">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-[0.95rem] text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-canvas" aria-label={dict.common.close}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 md:px-6">{children}</div> : null}
        {footer ? <div className="shrink-0 border-t border-line px-5 py-4 md:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
