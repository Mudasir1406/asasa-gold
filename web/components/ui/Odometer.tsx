"use client";

import { cx } from "@/lib/cx";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Odometer
 *
 * Renders an already-formatted number (e.g. "PKR 39,547.41") with each digit
 * on a rolling column, so a refreshed price visibly ticks rather than
 * silently swapping. Non-digits — currency, commas, the decimal point — are
 * static, so the string stays readable mid-roll.
 *
 * Three deliberate constraints, because this is money:
 * - The text is always the real value. The roll is a transform on a column
 *   whose resting position is the correct digit; nothing is interpolated, so
 *   a screenshot mid-animation still shows a truthful figure.
 * - `tabular-nums` plus a fixed per-digit width means the layout never
 *   reflows as digits change, so nothing shifts under the reader's finger.
 * - `prefers-reduced-motion` renders plain text with no columns at all.
 *
 * Props
 * - `value` — the formatted string to display.
 * - `className` — applied to the wrapper.
 * - `durationMs` — roll duration; digits further right lag slightly so the
 *   whole number settles left-to-right like a mechanical counter.
 */
export interface OdometerProps {
  value: string;
  className?: string;
  durationMs?: number;
}

export function Odometer({
  value,
  className,
  durationMs = 520,
}: OdometerProps) {
  const reduced = useReducedMotion();

  // On the server (and under reduced motion) this is the plain string, so the
  // first paint is always a readable number and no column animates from zero.
  if (reduced) {
    return (
      <span className={cx("tabular-nums", className)}>{value}</span>
    );
  }

  const characters = [...value];
  const digitCount = characters.filter(isDigit).length;
  let digitIndex = -1;

  return (
    <span className={cx("inline-flex items-baseline tabular-nums", className)}>
      {/* Screen readers get the plain figure; the rolling columns are purely
          visual and hidden from the accessibility tree. `role="text"` is
          non-standard, so this pairing is used instead. */}
      <span className="sr-only">{value}</span>
      {characters.map((character, index) => {
        if (!isDigit(character)) {
          return (
            <span key={index} aria-hidden="true">
              {character === " " ? " " : character}
            </span>
          );
        }

        digitIndex += 1;
        // Later digits change most often, so let them lead and the
        // high-order digits settle last — the way a real counter reads.
        const delay = ((digitCount - 1 - digitIndex) * durationMs) / 18;

        return (
          <DigitColumn
            key={index}
            digit={Number(character)}
            durationMs={durationMs}
            delayMs={delay}
          />
        );
      })}
    </span>
  );
}

function DigitColumn({
  digit,
  durationMs,
  delayMs,
}: {
  digit: number;
  durationMs: number;
  delayMs: number;
}) {
  return (
    <span className="relative inline-block overflow-hidden align-baseline">
      {/* An invisible digit in normal flow. It gives the column the exact
          width and baseline of real text, so the rolling digits line up with
          neighbouring characters instead of floating above them, and (with
          tabular-nums) the box never resizes as the value changes. */}
      <span className="invisible" aria-hidden="true">
        0
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex h-[1000%] flex-col will-change-transform"
        style={{
          // Percentages resolve against this column's own height (10 cells),
          // so one cell is exactly 10% — always in step with the line box.
          transform: `translateY(${-digit * 10}%)`,
          transition: `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms`,
        }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="flex h-[10%] items-center justify-center">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function isDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}
