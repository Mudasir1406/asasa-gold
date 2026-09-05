"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Drawer
 *
 * A slide-over panel built on the native `<dialog>` element, so focus
 * trapping, Escape handling, the top layer and inert background come from
 * the browser. Full-width sheet below 640 px, a 420 px panel on the right
 * above it.
 *
 * Props
 * - `open` — controls visibility; the parent owns the state.
 * - `onClose` — called on Escape, backdrop click or the close button.
 * - `title` — heading; also labels the dialog for assistive tech.
 * - `subtitle` — muted line under the title (e.g. the demo-only disclaimer).
 * - `footer` — optional sticky area at the bottom of the panel.
 * - `children` — the scrolling body.
 */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={
        "fixed inset-y-0 right-0 left-auto m-0 hidden h-dvh max-h-none w-full max-w-none " +
        "flex-col bg-white p-0 text-ink shadow-2xl open:flex sm:w-[420px] " +
        "backdrop:bg-forest-deep/40 backdrop:backdrop-blur-[2px] " +
        "translate-x-0 starting:open:translate-x-full motion-safe:transition-transform motion-safe:duration-300"
      }
    >
      <div className="flex h-full w-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-ink/6 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-tight">
              {title}
            </h2>
            {subtitle !== undefined && (
              <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-ink/6 hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer !== undefined && (
          <footer className="border-t border-ink/6 px-5 py-4">{footer}</footer>
        )}
      </div>
    </dialog>
  );
}
