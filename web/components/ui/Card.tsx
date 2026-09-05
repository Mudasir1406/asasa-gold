import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type CardTone = "default" | "dark";

/**
 * Card
 *
 * The 18 px-radius surface every section of the page sits on.
 *
 * Props
 * - `eyebrow` — small muted label above the title (e.g. "24K gold · PKR per gram").
 * - `title` — section heading, rendered as an `<h2>` in the display font.
 * - `action` — element placed on the right of the header (a button, a chip).
 * - `tone` — `default` white, or `dark` forest-deep with light text (receipt header).
 * - `padding` — `md` (default) or `none` when the children manage their own spacing.
 * - Renders a `<section>`; other attributes (`aria-*`, `id`, `className`) pass through.
 */
export interface CardProps
  extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  tone?: CardTone;
  padding?: "md" | "none";
}

export function Card({
  eyebrow,
  title,
  action,
  tone = "default",
  padding = "md",
  className,
  children,
  ...rest
}: CardProps) {
  const hasHeader = eyebrow !== undefined || title !== undefined || action !== undefined;
  return (
    <section
      className={cx(
        "rounded-card border shadow-[0_1px_2px_rgba(26,31,27,0.04)]",
        tone === "dark"
          ? "border-transparent bg-forest-deep text-white"
          : "border-ink/6 bg-white text-ink",
        padding === "md" && "p-5 sm:p-6",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow !== undefined && (
              <p
                className={cx(
                  "text-xs font-medium uppercase tracking-wide",
                  tone === "dark" ? "text-white/60" : "text-ink-muted",
                )}
              >
                {eyebrow}
              </p>
            )}
            {title !== undefined && (
              <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            )}
          </div>
          {action !== undefined && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
