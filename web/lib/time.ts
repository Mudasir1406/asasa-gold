/**
 * Small, display-only time helpers for countdowns and "updated N ago" lines.
 * All inputs are whole seconds; negatives clamp to zero so a countdown that
 * overshoots between ticks never renders "-1".
 */

/** `258` → `"4:18"` (minutes without padding, seconds zero-padded). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** `42` → `"42 s"`, `258` → `"4 min"`, `7325` → `"2 h"`. */
export function formatAge(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.floor(total / 60)} min`;
  return `${Math.floor(total / 3600)} h`;
}

/**
 * Whole seconds from `fromIso` to `toIso`, clamped at zero. Returns `0` when
 * either timestamp fails to parse, so a missing field degrades to "just now"
 * instead of `NaN` in the UI.
 */
export function secondsBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 1000));
}

/**
 * An ISO timestamp as a readable local date and time for receipts, e.g.
 * `5 Sept 2026, 10:11:12`. Falls back to the raw string when it fails to parse.
 */
export function formatDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(ms));
}
