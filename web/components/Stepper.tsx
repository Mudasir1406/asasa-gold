import { cx } from "@/lib/cx";

export type Step = 1 | 2 | 3 | 4 | 5;

export const STEP_LABELS = [
  "See price",
  "Enter",
  "Review",
  "Confirm",
  "Complete",
] as const;

/**
 * Stepper
 *
 * The brief's five-step journey as navigational feedback only: completed
 * steps are filled, the current one is ringed and announced with
 * `aria-current="step"`, upcoming ones are muted. It never handles clicks.
 *
 * Props
 * - `step` — the current step, 1 (See price) to 5 (Complete).
 */
export interface StepperProps {
  step: Step;
}

export function Stepper({ step }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol className="grid grid-cols-5">
        {STEP_LABELS.map((label, index) => {
          const number = index + 1;
          const state =
            number < step ? "done" : number === step ? "current" : "upcoming";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className="relative flex flex-col items-center gap-1.5 text-center"
            >
              {index < STEP_LABELS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute top-3 left-1/2 h-px w-full",
                    number < step ? "bg-forest" : "bg-ink/10",
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cx(
                  "relative z-10 flex size-6 items-center justify-center rounded-full text-[11px] font-semibold",
                  state === "done" && "bg-forest text-white",
                  state === "current" &&
                    "bg-white text-forest ring-2 ring-forest ring-inset",
                  state === "upcoming" && "bg-white text-ink-muted ring-1 ring-ink/15 ring-inset",
                )}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 12 12" className="size-3">
                    <path
                      d="M2.5 6.5l2.2 2.2L9.5 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  number
                )}
              </span>
              <span
                className={cx(
                  "text-[11px] leading-tight sm:text-xs",
                  state === "current"
                    ? "font-semibold text-forest"
                    : state === "done"
                      ? "text-ink"
                      : "text-ink-muted",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
