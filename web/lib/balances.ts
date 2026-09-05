import type { Balances } from "./types";

/** Signed integer changes of the three balances the customer sees. */
export interface BalanceDeltas {
  customer_cash_paisa: number;
  customer_gold_mg: number;
  platform_gold_mg: number;
}

/** True when every balance matches by value; `undefined` never equals anything. */
export function balancesEqual(a: Balances, b: Balances | undefined): boolean {
  return (
    b !== undefined &&
    a.customer_cash_paisa === b.customer_cash_paisa &&
    a.customer_gold_mg === b.customer_gold_mg &&
    a.platform_cash_paisa === b.platform_cash_paisa &&
    a.platform_gold_mg === b.platform_gold_mg
  );
}

/** `current − previous` per balance, in paisa / mg. */
export function balanceDeltas(
  current: Balances,
  previous: Balances,
): BalanceDeltas {
  return {
    customer_cash_paisa:
      current.customer_cash_paisa - previous.customer_cash_paisa,
    customer_gold_mg: current.customer_gold_mg - previous.customer_gold_mg,
    platform_gold_mg: current.platform_gold_mg - previous.platform_gold_mg,
  };
}
