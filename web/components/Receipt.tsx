"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/lib/cx";
import { formatGold, formatPKR, formatPricePerGram } from "@/lib/money";
import { sourceName } from "@/lib/sources";
import { formatDateTime } from "@/lib/time";
import type { Balances, Receipt as ReceiptData } from "@/lib/types";

const COPIED_VISIBLE_MS = 2000;

/**
 * Receipt
 *
 * Step 5 of the journey: what was traded, at what price, from which source,
 * and every balance before → after. The footer reports the double-entry
 * check from `/api/integrity`. A replayed confirm shows the original receipt
 * with a note, and the layout prints cleanly (actions hidden).
 *
 * Props
 * - `receipt` — the settlement receipt.
 * - `integrityOk` — result of `/api/integrity`; `null` while it is being checked.
 * - `onNewTrade` — back to an empty trade form.
 */
export interface ReceiptProps {
  receipt: ReceiptData;
  integrityOk: boolean | null;
  onNewTrade: () => void;
}

export function Receipt({ receipt, integrityOk, onNewTrade }: ReceiptProps) {
  const { trade, balances_before: before, balances_after: after } = receipt;
  const isBuy = trade.side === "BUY";

  return (
    <Card padding="none" className="print:border-0 print:shadow-none">
      <div className="rounded-t-card bg-forest-deep px-5 py-6 text-white sm:px-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lime text-forest-deep"
          >
            <svg viewBox="0 0 20 20" className="size-5">
              <path
                d="M5 10.5l3.2 3.2L15 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-white/60">
              Trade complete
            </p>
            <h2 className="text-lg font-semibold leading-tight">
              {isBuy ? "Bought" : "Sold"} {formatGold(trade.gold_mg)}
            </h2>
          </div>
        </div>
        <p className="mt-4 font-display text-3xl font-semibold tabular-nums tracking-tight">
          {formatPKR(trade.total_paisa)}
        </p>
        <p className="mt-1 text-sm text-white/70">
          {isBuy ? "Paid from your wallet" : "Added to your wallet"}
        </p>
        {receipt.idempotent_replay && (
          <p className="mt-3 rounded-field bg-white/10 px-3 py-2 text-xs text-white/80">
            Already settled — showing the original receipt.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <dl className="divide-y divide-ink/6 text-sm">
          <Row label="Trade ID">
            <TradeId id={trade.id} />
          </Row>
          <Row label="Settled at">{formatDateTime(trade.settled_at)}</Row>
          <Row label="Unit price">{formatPricePerGram(trade.unit_price_paisa_per_gram)}</Row>
          <Row label="Total">{formatPKR(trade.total_paisa)}</Row>
          <Row label="Market reference">
            <span className="block">{formatPricePerGram(trade.market_paisa_per_gram)}</span>
            <span className="block text-xs text-ink-muted">
              {sourceName(trade.source)} · priced {formatDateTime(trade.price_fetched_at)}
            </span>
          </Row>
          {trade.guardrail_applied && (
            <Row label="Guardrail">
              Applied — floor {formatPKR(trade.guardrail_paisa_per_gram)}
            </Row>
          )}
        </dl>

        <div>
          <h3 className="text-sm font-semibold">Balances before → after</h3>
          <dl className="mt-2 flex flex-col gap-2 text-sm">
            <BalanceRow
              label="Wallet"
              before={before.customer_cash_paisa}
              after={after.customer_cash_paisa}
              format={formatPKR}
            />
            <BalanceRow
              label="Your gold"
              before={before.customer_gold_mg}
              after={after.customer_gold_mg}
              format={formatGold}
              metal
            />
            <BalanceRow
              label="Platform inventory"
              before={before.platform_gold_mg}
              after={after.platform_gold_mg}
              format={formatGold}
              metal
            />
          </dl>
        </div>

        <BooksLine ok={integrityOk} />

        <Button size="lg" block onClick={onNewTrade} className="print:hidden">
          New trade
        </Button>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function TradeId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  function copy() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <code className="font-mono text-xs" title={id}>
        {id.slice(0, 8)}
      </code>
      <button
        type="button"
        onClick={copy}
        className="rounded-full px-2 py-0.5 text-xs font-medium text-forest hover:bg-forest/8 print:hidden"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function BalanceRow({
  label,
  before,
  after,
  format,
  metal = false,
}: {
  label: string;
  before: number;
  after: number;
  format: (amount: number) => string;
  metal?: boolean;
}) {
  const delta = after - before;
  return (
    <div
      className={cx(
        "rounded-field border px-3 py-2",
        metal ? "border-gold/50 bg-gold/8" : "border-ink/8 bg-mist",
      )}
    >
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
        <span className="text-ink-muted">{format(before)}</span>
        <span aria-hidden="true" className="text-ink-muted">
          →
        </span>
        <span className="font-medium text-ink">{format(after)}</span>
        {delta !== 0 && (
          <span
            className={cx(
              "text-xs",
              delta > 0 ? "text-forest" : "text-ink-muted",
            )}
          >
            {delta > 0 ? "▲" : "▼"} {format(Math.abs(delta))}
          </span>
        )}
      </dd>
    </div>
  );
}

function BooksLine({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return (
      <p className="text-sm text-ink-muted" aria-live="polite">
        Checking the books…
      </p>
    );
  }
  return (
    <p
      className={cx(
        "flex items-center gap-2 text-sm font-medium",
        ok ? "text-forest" : "text-coral",
      )}
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={cx("size-2 rounded-full", ok ? "bg-lime" : "bg-coral")}
      />
      {ok ? "Books balanced ✓" : "Books check failed"}
    </p>
  );
}

/** Pure helper for consumers that want to know whether a receipt moved a balance. */
export function balancesChanged(before: Balances, after: Balances): boolean {
  return (
    before.customer_cash_paisa !== after.customer_cash_paisa ||
    before.customer_gold_mg !== after.customer_gold_mg ||
    before.platform_gold_mg !== after.platform_gold_mg
  );
}
