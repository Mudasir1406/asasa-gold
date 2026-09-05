import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatGold, formatPKR } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import type { Trade } from "@/lib/types";

/**
 * TradeHistory
 *
 * The recent trades from `/api/state`, newest first. Each row is a button
 * that reopens the full receipt.
 *
 * Props
 * - `trades` — newest first, as the API returns them.
 * - `onOpen` — called with the trade id to fetch and show its receipt.
 */
export interface TradeHistoryProps {
  trades: Trade[];
  onOpen: (id: string) => void;
}

export function TradeHistory({ trades, onOpen }: TradeHistoryProps) {
  return (
    <Card eyebrow="History" title="Recent trades">
      {trades.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No trades yet. Your first receipt will appear here.
        </p>
      ) : (
        <ul className="-mx-2 divide-y divide-ink/6">
          {trades.map((trade) => {
            const isBuy = trade.side === "BUY";
            return (
              <li key={trade.id}>
                <button
                  type="button"
                  onClick={() => onOpen(trade.id)}
                  className="flex w-full items-center gap-3 rounded-field px-2 py-3 text-left hover:bg-mist"
                >
                  <Pill tone={isBuy ? "lime" : "gold"} className="w-16 justify-center">
                    {isBuy ? "Bought" : "Sold"}
                  </Pill>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium tabular-nums text-ink">
                      {formatGold(trade.gold_mg)}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {formatDateTime(trade.settled_at)}
                    </span>
                  </span>
                  <span className="text-sm font-medium tabular-nums text-ink">
                    {isBuy ? "−" : "+"}
                    {formatPKR(trade.total_paisa)}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    className="size-4 shrink-0 text-ink-muted"
                    aria-hidden="true"
                  >
                    <path
                      d="M7.5 5l5 5-5 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
