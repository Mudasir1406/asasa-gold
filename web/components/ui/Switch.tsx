import { cx } from "@/lib/cx";

/**
 * Switch
 *
 * An on/off toggle with a visible label, built as a `role="switch"` button so
 * it announces its state and toggles with Space/Enter.
 *
 * Props
 * - `id` — links the label to the control.
 * - `label` — what the switch controls.
 * - `description` — muted line under the label.
 * - `checked` / `onChange` — controlled state.
 * - `disabled` — greys the control and ignores clicks.
 */
export interface SwitchProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({
  id,
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: SwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && (
          <span className="block text-xs text-ink-muted">{description}</span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full motion-safe:transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-coral" : "bg-ink/15",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "absolute top-1 left-1 size-5 rounded-full bg-white shadow-sm motion-safe:transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
