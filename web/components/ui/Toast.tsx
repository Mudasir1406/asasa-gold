"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";

export type ToastTone = "success" | "error";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const TOAST_TTL_MS = 4000;

/**
 * Owns a short-lived list of result messages. `push` adds one that removes
 * itself after four seconds; pending timers are cleared on unmount.
 */
export function useToasts(): {
  toasts: ToastItem[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
} {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, TOAST_TTL_MS);
      timers.current.add(timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { toasts, push, dismiss };
}

/**
 * ToastStack
 *
 * Renders the toasts from `useToasts` as a polite live region; each one can
 * be dismissed early with its close button.
 */
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            "flex items-start justify-between gap-3 rounded-field px-3 py-2 text-sm",
            "starting:opacity-0 motion-safe:transition-opacity motion-safe:duration-200",
            toast.tone === "success"
              ? "bg-forest-deep text-white"
              : "border border-coral/60 bg-coral/12 text-ink",
          )}
        >
          <p className="min-w-0">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="-mr-1 shrink-0 rounded-full px-1 leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
