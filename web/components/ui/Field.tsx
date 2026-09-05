import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Field
 *
 * A labelled text input with optional adornments and inline validation.
 *
 * Props
 * - `id` — required; links the label, hint and error to the input.
 * - `label` — visible label text.
 * - `hint` — muted helper line under the input (hidden while `error` is set).
 * - `error` — coral message under the input; also sets `aria-invalid`.
 * - `prefix` / `suffix` — nodes inside the bordered box, before/after the
 *   input (a currency label, a unit toggle button).
 * - Every other `<input>` attribute passes through (`inputMode`, `value`,
 *   `onChange`, `placeholder`, `disabled` …).
 */
export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "prefix"> {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function Field({
  id,
  label,
  hint,
  error,
  prefix,
  suffix,
  className,
  disabled,
  ...rest
}: FieldProps) {
  const messageId = `${id}-message`;
  const hasMessage = error !== undefined || hint !== undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cx(
          "flex items-center rounded-field border bg-white",
          "motion-safe:transition-colors focus-within:border-forest focus-within:ring-2 focus-within:ring-forest/15",
          error !== undefined ? "border-coral" : "border-ink/15",
          disabled && "bg-mist opacity-60",
        )}
      >
        {prefix !== undefined && (
          <span className="pl-3 text-sm text-ink-muted">{prefix}</span>
        )}
        <input
          id={id}
          disabled={disabled}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className="h-12 min-w-0 flex-1 bg-transparent px-3 text-lg tabular-nums text-ink outline-none placeholder:text-ink-muted/60"
          {...rest}
        />
        {suffix !== undefined && <span className="pr-2">{suffix}</span>}
      </div>
      {error !== undefined ? (
        <p id={messageId} role="alert" className="text-sm text-coral">
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p id={messageId} className="text-sm text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
