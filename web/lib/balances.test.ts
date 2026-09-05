import { describe, it, expect } from "vitest";
import { balancesEqual, balanceDeltas } from "./balances";
import type { Balances } from "./types";

const seed: Balances = {
  customer_cash_paisa: 25000000,
  customer_gold_mg: 2500,
  platform_cash_paisa: 500000000,
  platform_gold_mg: 50000,
};

describe("balances", () => {
  it("compares by value, not identity", () => {
    expect(balancesEqual(seed, { ...seed })).toBe(true);
    expect(balancesEqual(seed, { ...seed, customer_gold_mg: 2501 })).toBe(false);
    expect(balancesEqual(seed, undefined)).toBe(false);
  });

  it("returns signed integer deltas for the three customer-facing balances", () => {
    const after: Balances = {
      customer_cash_paisa: 25000000 - 4351063,
      customer_gold_mg: 3500,
      platform_cash_paisa: 500000000 + 4351063,
      platform_gold_mg: 49000,
    };
    expect(balanceDeltas(after, seed)).toEqual({
      customer_cash_paisa: -4351063,
      customer_gold_mg: 1000,
      platform_gold_mg: -1000,
    });
    expect(balanceDeltas(seed, seed)).toEqual({
      customer_cash_paisa: 0,
      customer_gold_mg: 0,
      platform_gold_mg: 0,
    });
  });
});
