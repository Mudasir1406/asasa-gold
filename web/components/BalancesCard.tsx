"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { balanceDeltas, type BalanceDeltas } from "@/lib/balances";
import { cx } from "@/lib/cx";
import { formatGold, formatPKR } from "@/lib/money";
import type { Balances } from "@/lib/types";

const DELTA_VISIBLE_MS = 3000;

/**
 * BalancesCard
 *
 * The three balances a trade can move: Wallet (PKR), Your gold (g) and
 * Platform inventory (g). Gold amounts carry the gold accent; cash stays
 * neutral. When `previous` changes to a set of balances that differs from
 * `balances`, each changed tile shows a ▲/▼ delta chip for three seconds.
 *
 * Props
 * - `balances` — current balances from `/api/state`.
 * - `previous` — the balances before the last change; pass a new object only
 *   when the values actually changed (see `balancesEqual`), otherwise the
 *   chips would replay on every poll.
 */
export interface BalancesCardProps {
  balances: Balances;
  previous?: Balances;
}

interface Flash {
  previous: Balances;
  deltas: BalanceDeltas;
}

export function BalancesCard({ balances, previous }: BalancesCardProps) {
  const [seen, setSeen] = useState(previous);
  const [flash, setFlash] = useState<Flash | null>(null);

  if (previous !== seen) {
    setSeen(previous);
    setFlash(
      previous ? { previous, deltas: balanceDeltas(balances, previous) } : null,
    );
  }

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), DELTA_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [flash]);

  const deltas = flash?.deltas;

  return (
    <Card eyebrow="Balances" title="Your position">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Tile
          label="Wallet"
          value={formatPKR(balances.customer_cash_paisa)}
          delta={deltas?.customer_cash_paisa}
          format={formatPKR}
          className="sm:col-span-2"
        />
        <Tile
          label="Your gold"
          value={formatGold(balances.customer_gold_mg)}
          delta={deltas?.customer_gold_mg}
          format={formatGold}
          metal
        />
        <Tile
          label="Platform inventory"
          value={formatGold(balances.platform_gold_mg)}
          delta={deltas?.platform_gold_mg}
          format={formatGold}
          metal
        />
      </dl>
    </Card>
  );
}

interface TileProps {
  label: string;
  value: string;
  delta?: number;
  format: (amount: number) => string;
  metal?: boolean;
  className?: string;
}

function Tile({
  label,
  value,
  delta,
  format,
  metal = false,
  className,
}: TileProps) {
  const changed = delta !== undefined && delta !== 0;
  return (
    <div
      className={cx(
        "rounded-field border px-4 py-3",
        metal ? "border-gold/50 bg-gold/8" : "border-ink/8 bg-mist",
        className,
      )}
    >
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        {metal && (
          <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
        )}
        {label}
      </dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-xl font-semibold tabular-nums text-ink">
          {value}
        </span>
        {changed && (
          <span
            className={cx(
              "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              "starting:opacity-0 motion-safe:transition-opacity motion-safe:duration-300",
              delta > 0 ? "bg-lime/25 text-forest" : "bg-ink/6 text-ink-muted",
            )}
          >
            {delta > 0 ? "▲" : "▼"} {format(Math.abs(delta))}
          </span>
        )}
      </dd>
    </div>
  );
}
