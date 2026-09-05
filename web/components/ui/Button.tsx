import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "chip";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Button
 *
 * The single interactive control used across the app.
 *
 * Props
 * - `variant` — `primary` (forest, the one main action on screen), `secondary`
 *   (outlined), `ghost` (text only), `danger` (coral outline, destructive
 *   reviewer actions), `chip` (small rounded selector such as 25 % · 50 % · Max).
 * - `size` — `sm` 36 px, `md` 44 px (default, mobile tap target), `lg` 48 px.
 * - `loading` — shows a spinner, sets `aria-busy` and disables the button.
 * - `block` — stretch to the container width.
 * - Every other `<button>` attribute passes through; `type` defaults to `button`.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-forest text-white hover:bg-forest-deep",
  secondary:
    "border border-forest/30 bg-white text-forest hover:border-forest hover:bg-forest/5",
  ghost: "bg-transparent text-forest hover:bg-forest/8",
  danger:
    "border border-coral/60 bg-white text-ink hover:bg-coral/10 hover:border-coral",
  chip: "rounded-full border border-ink/10 bg-white text-ink hover:border-forest/50 hover:text-forest",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

const CHIP_SIZE = "h-8 px-3 text-xs";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-field font-medium",
        "motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        variant === "chip" ? CHIP_SIZE : SIZE[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && (
        <svg
          className="size-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="3"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
