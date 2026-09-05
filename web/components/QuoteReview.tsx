"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import {
  bpsToPercent,
  formatGold,
  formatPKR,
  formatPricePerGram,
} from "@/lib/money";
import { applyBps } from "@/lib/quoteMath";
import { sourceName } from "@/lib/sources";
import type { Quote } from "@/lib/types";
import type { ServerClock } from "@/lib/useServerClock";

const TICK_MS = 250;
const URGENT_SECONDS = 10;

type Phase =
  | { kind: "active" }
  | { kind: "expired" }
  | { kind: "insufficient"; error: ApiError };

function detailAmount(
  details: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = details?.[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return details?.unit === "mg" ? formatGold(value) : formatPKR(value);
}

/**
 * QuoteReview
 *
 * Step 3 of the journey: the locked unit price, how it was derived, both legs
 * of the trade, and a ring countdown to `expires_at` measured against the
 * server-corrected clock. Confirm is guarded against a double click with an
 * in-flight ref; the server remains the guarantee. At zero — locally or by a
 * `QUOTE_EXPIRED` reply — the review turns into the "Price lock expired"
 * state with one "Get a fresh quote" action; an `INSUFFICIENT_*` reply shows
 * what is short with an "Adjust amount" way back to the form.
 *
 * Mount with `key={quote.id}` so a new quote starts a fresh review.
 *
 * Props
 * - `quote` — the quote being reviewed; a re-fetched copy with a new status
 *   or `expires_at` (e.g. expired from the reviewer tools) is honoured.
 * - `serverClock` — from `useServerClock`, fed with this quote's `server_now`.
 * - `previousUnitPrice` — the unit price of the quote this one replaced,
 *   to show the delta after a re-quote.
 * - `onConfirm` — settles the quote; rejections are mapped to the states above.
 * - `onCancel` — back to the form.
 * - `onRequote` — re-issues with the same inputs; rejections are shown here.
 */
export interface QuoteReviewProps {
  quote: Quote;
  serverClock: ServerClock;
  previousUnitPrice?: number;
  onConfirm: (quote: Quote) => Promise<void>;
  onCancel: () => void;
  onRequote: (quote: Quote) => Promise<void>;
}

export function QuoteReview({
  quote,
  serverClock,
  previousUnitPrice,
  onConfirm,
  onCancel,
  onRequote,
}: QuoteReviewProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "active" });
  const [remainingMs, setRemainingMs] = useState(
    () => quote.seconds_remaining * 1000,
  );
  const [submitting, setSubmitting] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);

  const expiresAt = Date.parse(quote.expires_at);
  const totalMs = Math.max(1, expiresAt - Date.parse(quote.created_at));
  const expired = phase.kind === "expired" || quote.status !== "ACTIVE";

  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => {
      const ms = Math.max(0, expiresAt - serverClock.now());
      setRemainingMs(ms);
      if (ms === 0) setPhase({ kind: "expired" });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [expired, expiresAt, serverClock]);

  async function handleConfirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(quote);
    } catch (err) {
      const apiError = ApiError.from(err);
      if (apiError.code === "QUOTE_EXPIRED") {
        setPhase({ kind: "expired" });
      } else if (apiError.code.startsWith("INSUFFICIENT_")) {
        setPhase({ kind: "insufficient", error: apiError });
      } else {
        setError(apiError);
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleRequote() {
    if (requoting) return;
    setRequoting(true);
    setError(null);
    try {
      await onRequote(quote);
    } catch (err) {
      setError(ApiError.from(err));
    } finally {
      setRequoting(false);
    }
  }

  const isBuy = quote.side === "BUY";
  const unit = quote.unit_price_paisa_per_gram;
  const spreadBps = quote.spread_bps - 10000;
  const buyBeforeGuardrail = applyBps(quote.market_paisa_per_gram, quote.spread_bps);
  const delta = previousUnitPrice === undefined ? null : unit - previousUnitPrice;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <Card
      eyebrow={`Price locked · ${isBuy ? "Buy" : "Sell"}`}
      title={
        <span className="tabular-nums">
          {formatPKR(unit)}{" "}
          <span className="text-sm font-medium text-ink-muted">/ g</span>
        </span>
      }
      action={
        expired ? (
          <Pill tone="coral" dot>
            Expired
          </Pill>
        ) : (
          <CountdownRing seconds={seconds} fraction={remainingMs / totalMs} />
        )
      }
    >
      <div className="flex flex-col gap-5">
        {delta !== null && (
          <p className="rounded-field bg-forest/6 px-3 py-2 text-sm text-forest">
            New locked price: {formatPKR(unit)} (
            {delta === 0
              ? "unchanged since your last quote"
              : `${delta > 0 ? "▲" : "▼"} ${formatPKR(Math.abs(delta))} since your last quote`}
            ).
          </p>
        )}

        <dl className={cx("divide-y divide-ink/6 text-sm", expired && "opacity-60")}>
          <Row label="Market reference">
            {formatPricePerGram(quote.market_paisa_per_gram)}
          </Row>
          <Row label="Spread">
            {spreadBps >= 0 ? "+" : "−"}
            {bpsToPercent(Math.abs(spreadBps))}
          </Row>
          {quote.guardrail_applied && (
            <Row label="Guardrail">
              Guardrail applied — floor {formatPKR(quote.guardrail_paisa_per_gram)}{" "}
              is above market × 1.10 ({formatPKR(buyBeforeGuardrail)})
            </Row>
          )}
          <Row label="Source">
            {sourceName(quote.source)}
          </Row>
          <Row label={isBuy ? "You pay" : "You receive"} strong>
            {formatPKR(quote.total_paisa)}
          </Row>
          <Row label={isBuy ? "You get" : "You give"} strong metal>
            {formatGold(quote.gold_mg)}
          </Row>
        </dl>

        {phase.kind === "insufficient" ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-field border border-coral/50 bg-coral/12 p-4 text-sm text-ink"
          >
            <div>
              <p className="font-semibold">Balance changed since you locked</p>
              <p className="mt-1">{phase.error.message}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Required {detailAmount(phase.error.details, "required") ?? "—"} ·
                Available {detailAmount(phase.error.details, "available") ?? "—"}
              </p>
            </div>
            <Button variant="secondary" block onClick={onCancel}>
              Adjust amount
            </Button>
          </div>
        ) : expired ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-field border border-coral/50 bg-coral/12 p-4 text-sm text-ink"
          >
            <div>
              <p className="font-semibold">Price lock expired</p>
              <p className="mt-1 text-ink-muted">
                The 75-second lock has ended. Nothing was traded.
              </p>
            </div>
            <Button size="lg" block loading={requoting} onClick={() => void handleRequote()}>
              Get a fresh quote
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={requoting}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-ink-muted">
              Locked for{" "}
              <span className="font-medium tabular-nums text-ink">{seconds} s</span>
            </p>
            <Button
              size="lg"
              block
              loading={submitting}
              disabled={seconds === 0}
              onClick={() => void handleConfirm()}
            >
              Confirm {isBuy ? "purchase" : "sale"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-coral">
            {error.message}
          </p>
        )}
      </div>
    </Card>
  );
}

function Row({
  label,
  strong = false,
  metal = false,
  children,
}: {
  label: string;
  strong?: boolean;
  metal?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={cx("shrink-0", strong ? "font-medium text-ink" : "text-ink-muted")}>
        {label}
      </dt>
      <dd
        className={cx(
          "min-w-0 text-right tabular-nums",
          strong ? "font-display text-lg font-semibold" : "text-ink",
          metal && "text-forest",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function CountdownRing({ seconds, fraction }: { seconds: number; fraction: number }) {
  const urgent = seconds <= URGENT_SECONDS;
  const visible = Math.min(1, Math.max(0, fraction));
  return (
    <div
      role="timer"
      aria-label={`${seconds} seconds left on this price`}
      className="relative size-16"
    >
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-ink/10"
        />
        <circle
          cx="32"
          cy="32"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - visible)}
          className={cx(
            "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300 motion-safe:ease-linear",
            urgent ? "text-coral" : "text-forest",
          )}
        />
      </svg>
      <span
        className={cx(
          "absolute inset-0 flex items-center justify-center font-display text-lg font-semibold tabular-nums",
          urgent ? "text-coral" : "text-ink",
        )}
      >
        {seconds}
      </span>
    </div>
  );
}
