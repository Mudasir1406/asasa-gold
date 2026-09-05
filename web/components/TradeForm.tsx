"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import {
  formatGold,
  formatPKR,
  formatPricePerGram,
  parseGold,
  parsePKR,
  toGoldInput,
  toPKRInput,
} from "@/lib/money";
import {
  checkAffordability,
  computeQuote,
  maxAmount,
  mulDivFloor,
  QuoteMathError,
  type QuoteLegs,
  type Shortfall,
} from "@/lib/quoteMath";
import type {
  Balances,
  InputMode,
  PriceView,
  QuoteRequest,
  Side,
} from "@/lib/types";

const CHIPS = [
  { label: "25%", pct: 25 },
  { label: "50%", pct: 50 },
  { label: "Max", pct: 100 },
] as const;

const SIDES: ReadonlyArray<{ side: Side; label: string }> = [
  { side: "BUY", label: "Buy" },
  { side: "SELL", label: "Sell" },
];

const FIELD_LABEL: Record<Side, Record<InputMode, string>> = {
  BUY: { PKR: "Amount to spend", GOLD: "Gold to buy" },
  SELL: { PKR: "Amount to receive", GOLD: "Gold to sell" },
};

interface Draft {
  side: Side;
  mode: InputMode;
  raw: string;
}

type Assessment =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; amount: number; legs: QuoteLegs };

function draftFrom(initial: QuoteRequest | undefined): Draft {
  if (!initial) return { side: "BUY", mode: "PKR", raw: "" };
  return {
    side: initial.side,
    mode: initial.input_mode,
    raw:
      initial.input_mode === "PKR"
        ? toPKRInput(initial.amount)
        : toGoldInput(initial.amount),
  };
}

function shortfallMessage(short: Shortfall): string {
  switch (short.code) {
    case "INSUFFICIENT_CASH":
      return `Exceeds your wallet — you have ${formatPKR(short.available)}`;
    case "INSUFFICIENT_GOLD":
      return `Exceeds your gold — you have ${formatGold(short.available)}`;
    case "INSUFFICIENT_INVENTORY":
      return `Exceeds platform inventory — ${formatGold(short.available)} available`;
  }
}

/** The same integer math the server runs at issue, applied to what is typed. */
function assess(
  draft: Draft,
  buy: number,
  sell: number,
  balances: Balances,
): Assessment {
  if (draft.raw.trim() === "") return { kind: "empty" };

  const amount =
    draft.mode === "PKR" ? parsePKR(draft.raw) : parseGold(draft.raw);
  if (amount === null) {
    return {
      kind: "invalid",
      message:
        draft.mode === "PKR"
          ? "Enter an amount in PKR with up to 2 decimals"
          : "Enter an amount in grams with up to 3 decimals",
    };
  }

  let legs: QuoteLegs;
  try {
    legs = computeQuote(draft.side, draft.mode, amount, buy, sell);
  } catch (err) {
    if (err instanceof QuoteMathError) {
      return {
        kind: "invalid",
        message:
          err.code === "BELOW_MINIMUM"
            ? "Minimum trade is 0.010 g"
            : "Enter an amount greater than zero",
      };
    }
    return { kind: "invalid", message: "Amount is too large" };
  }

  const short = checkAffordability(
    draft.side,
    legs.gold_mg,
    legs.total_paisa,
    balances,
  );
  if (short) return { kind: "invalid", message: shortfallMessage(short) };

  return { kind: "ok", amount, legs };
}

/** "You get ≈ 2.298 g at PKR 43,510.63 / g" — display only; the locked quote wins. */
function estimate(draft: Draft, legs: QuoteLegs): string {
  const at = `at ${formatPricePerGram(legs.unit_price)}`;
  if (draft.side === "BUY") {
    return draft.mode === "PKR"
      ? `You get ≈ ${formatGold(legs.gold_mg)} ${at}`
      : `You pay ≈ ${formatPKR(legs.total_paisa)} ${at}`;
  }
  return draft.mode === "GOLD"
    ? `You receive ≈ ${formatPKR(legs.total_paisa)} ${at}`
    : `You give ≈ ${formatGold(legs.gold_mg)} ${at}`;
}

function detailAmount(details: Record<string, unknown> | undefined, key: string): string | null {
  const value = details?.[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return details?.unit === "mg" ? formatGold(value) : formatPKR(value);
}

/**
 * TradeForm
 *
 * Step 2 of the journey: Buy / Sell, an amount in PKR or grams with a unit
 * toggle inside the field, 25 % · 50 % · Max chips of the relevant balance,
 * a live estimate computed with the server's own integer rules, and the
 * "Lock price for 75 s" action. Validation is inline; the server's answer
 * to the lock request (paused, insufficiency, validation) is shown under
 * the button so nothing fails silently.
 *
 * Props
 * - `price` — current `PriceView`; buy/sell prices drive the estimate.
 * - `balances` — current balances; drive the chips and affordability.
 * - `disabledReason` — when set, trading is paused: everything is disabled
 *   and this sentence is shown under the button.
 * - `initial` — pre-fills side, unit and amount (e.g. "Adjust amount").
 * - `onQuote` — issues the quote; rejections are shown in the form.
 * - `onTyping` — reports whether the amount field is non-empty (for the stepper).
 */
export interface TradeFormProps {
  price: PriceView;
  balances: Balances;
  disabledReason: string | null;
  initial?: QuoteRequest;
  onQuote: (request: QuoteRequest) => Promise<void>;
  onTyping?: (typing: boolean) => void;
}

export function TradeForm({
  price,
  balances,
  disabledReason,
  initial,
  onQuote,
  onTyping,
}: TradeFormProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const buy = price.buy_paisa_per_gram;
  const sell = price.sell_paisa_per_gram;
  const pricesReady = buy !== null && sell !== null;
  const paused =
    disabledReason ?? (pricesReady ? null : "Waiting for a trusted price");

  const assessment: Assessment = pricesReady
    ? assess(draft, buy, sell, balances)
    : { kind: "empty" };

  const isGold = draft.mode === "GOLD";
  const unitPrice = draft.side === "BUY" ? buy : sell;

  function setRaw(raw: string) {
    setDraft((current) => ({ ...current, raw }));
    setSubmitError(null);
    onTyping?.(raw.trim() !== "");
  }

  function setSide(side: Side) {
    setDraft((current) => ({ ...current, side }));
    setSubmitError(null);
  }

  function setMode(mode: InputMode) {
    if (mode === draft.mode) return;
    setDraft((current) => ({ ...current, mode, raw: "" }));
    setSubmitError(null);
    onTyping?.(false);
  }

  function applyChip(pct: number) {
    if (!pricesReady) return;
    const max = maxAmount(draft.side, draft.mode, balances, buy, sell);
    const amount = mulDivFloor(max, pct, 100);
    setRaw(isGold ? toGoldInput(amount) : toPKRInput(amount));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || paused !== null || assessment.kind !== "ok") return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onQuote({
        side: draft.side,
        input_mode: draft.mode,
        amount: assessment.amount,
      });
    } catch (err) {
      setSubmitError(ApiError.from(err));
    } finally {
      setSubmitting(false);
    }
  }

  const required = detailAmount(submitError?.details, "required");
  const available = detailAmount(submitError?.details, "available");

  return (
    <Card eyebrow="Trade" title="Buy or sell gold">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div
          role="group"
          aria-label="Side"
          className="grid grid-cols-2 gap-1 rounded-field bg-mist p-1"
        >
          {SIDES.map(({ side, label }) => (
            <button
              key={side}
              type="button"
              aria-pressed={draft.side === side}
              disabled={paused !== null}
              onClick={() => setSide(side)}
              className={cx(
                "h-10 rounded-lg text-sm font-medium motion-safe:transition-colors disabled:cursor-not-allowed",
                draft.side === side
                  ? "bg-forest text-white shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Field
          id="trade-amount"
          label={FIELD_LABEL[draft.side][draft.mode]}
          value={draft.raw}
          onChange={(event) => setRaw(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder={isGold ? "0.000" : "0.00"}
          disabled={paused !== null}
          prefix={isGold ? undefined : "PKR"}
          suffix={
            <div
              role="group"
              aria-label="Unit"
              className="flex rounded-full bg-mist p-0.5 text-xs font-medium"
            >
              {(["PKR", "GOLD"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={draft.mode === mode}
                  disabled={paused !== null}
                  onClick={() => setMode(mode)}
                  className={cx(
                    "rounded-full px-2.5 py-1 motion-safe:transition-colors",
                    draft.mode === mode
                      ? "bg-white text-forest shadow-sm"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {mode === "PKR" ? "PKR" : "g"}
                </button>
              ))}
            </div>
          }
          error={assessment.kind === "invalid" ? assessment.message : undefined}
          hint={
            assessment.kind === "ok"
              ? estimate(draft, assessment.legs)
              : unitPrice !== null
                ? `${draft.side === "BUY" ? "Buy" : "Sell"} price ${formatPricePerGram(unitPrice)}`
                : undefined
          }
        />

        <div className="flex flex-wrap gap-2" aria-label="Quick amounts">
          {CHIPS.map((chip) => (
            <Button
              key={chip.label}
              variant="chip"
              disabled={paused !== null}
              onClick={() => applyChip(chip.pct)}
            >
              {chip.label}
            </Button>
          ))}
          <span className="ml-auto self-center text-xs text-ink-muted">
            of{" "}
            {draft.side === "BUY"
              ? isGold
                ? "what you can buy"
                : "your wallet"
              : isGold
                ? "your gold"
                : "your gold's value"}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            block
            loading={submitting}
            disabled={paused !== null || assessment.kind !== "ok"}
          >
            Lock price for 75 s
          </Button>
          {paused !== null && (
            <p className="text-center text-sm text-coral">{paused}</p>
          )}
          {submitError && (
            <div
              role="alert"
              className="rounded-field border border-coral/50 bg-coral/12 px-3 py-2 text-sm text-ink"
            >
              <p>{submitError.message}</p>
              {required !== null && available !== null && (
                <p className="mt-1 text-xs text-ink-muted">
                  Required {required} · Available {available}
                </p>
              )}
            </div>
          )}
        </div>
      </form>
    </Card>
  );
}
