import type { HTMLAttributes } from "react";
import { cx } from "@/lib/cx";

export type PillTone = "neutral" | "forest" | "lime" | "gold" | "coral";

/**
 * Pill
 *
 * A rounded status or value chip. Text stays ink/forest for contrast; the
 * tone shows in the tint and the optional dot, so one colour carries one
 * meaning: lime = live/positive, gold = the metal or a single source,
 * coral = insufficiency or paused, forest = brand emphasis.
 *
 * Props
 * - `tone` — background tint (default `neutral`).
 * - `dot` — leading status dot in the tone colour.
 * - `size` — `sm` (default) for chips, `md` for the buy/sell price pills.
 * - Renders a `<span>`; other attributes pass through.
 */
export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  dot?: boolean;
  size?: "sm" | "md";
}

const TONE: Record<PillTone, { bg: string; dot: string }> = {
  neutral: { bg: "bg-ink/6 text-ink", dot: "bg-ink-muted" },
  forest: { bg: "bg-forest/10 text-forest", dot: "bg-forest" },
  lime: { bg: "bg-lime/25 text-forest", dot: "bg-lime" },
  gold: { bg: "bg-gold/35 text-ink", dot: "bg-gold" },
  coral: { bg: "bg-coral/15 text-ink", dot: "bg-coral" },
};

export function Pill({
  tone = "neutral",
  dot = false,
  size = "sm",
  className,
  children,
  ...rest
}: PillProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1.5 text-sm",
        TONE[tone].bg,
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cx("size-1.5 shrink-0 rounded-full", TONE[tone].dot)}
        />
      )}
      {children}
    </span>
  );
}
