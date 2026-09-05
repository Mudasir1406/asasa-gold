import { describe, it, expect } from "vitest";
import {
  formatPKR,
  formatGold,
  formatPricePerGram,
  parsePKR,
  parseGold,
  bpsToPercent,
  toPKRInput,
  toGoldInput,
} from "./money";

describe("money", () => {
  it("formats paisa", () => {
    expect(formatPKR(4349065)).toBe("PKR 43,490.65");
    expect(formatPKR(0)).toBe("PKR 0.00");
    expect(formatPKR(25000000)).toBe("PKR 250,000.00");
  });

  it("formats mg", () => {
    expect(formatGold(2500)).toBe("2.500 g");
    expect(formatGold(7)).toBe("0.007 g");
    expect(formatGold(52500)).toBe("52.500 g");
  });

  it("parses PKR", () => {
    expect(parsePKR("250,000")).toBe(25000000);
    expect(parsePKR("99.999")).toBe(null);
    expect(parsePKR("-5")).toBe(null);
    expect(parsePKR("")).toBe(null);
    expect(parsePKR("0.01")).toBe(1);
  });

  it("parses gold", () => {
    expect(parseGold("2.5")).toBe(2500);
    expect(parseGold("0.001")).toBe(1);
    expect(parseGold("0.0001")).toBe(null);
    expect(parseGold("abc")).toBe(null);
  });

  it("formats single-paisa and negative amounts", () => {
    expect(formatPKR(1)).toBe("PKR 0.01");
    expect(formatPKR(-4351063)).toBe("-PKR 43,510.63");
    expect(formatGold(-500)).toBe("-0.500 g");
    expect(formatGold(1000000)).toBe("1,000.000 g");
  });

  it("formats compact PKR", () => {
    expect(formatPKR(4349065, { compact: true })).toBe("PKR 43.5K");
    expect(formatPKR(500000000, { compact: true })).toBe("PKR 5M");
    expect(formatPKR(99900, { compact: true })).toBe("PKR 999");
  });

  it("formats a unit price", () => {
    expect(formatPricePerGram(4349065)).toBe("PKR 43,490.65 / g");
  });

  it("parses forgiving input", () => {
    expect(parsePKR("1,25,000.5")).toBe(12500050);
    expect(parsePKR(" 250000 ")).toBe(25000000);
    expect(parsePKR(".5")).toBe(50);
    expect(parsePKR("5.")).toBe(500);
    expect(parsePKR("1e5")).toBe(null);
    expect(parsePKR("12,34")).toBe(123400);
    expect(parseGold("2.500")).toBe(2500);
    expect(parseGold("-1")).toBe(null);
    expect(parseGold("")).toBe(null);
  });

  it("rejects amounts outside the safe integer range", () => {
    expect(parsePKR("99999999999999999")).toBe(null);
    expect(parseGold("99999999999999999")).toBe(null);
  });

  it("round-trips amounts through the input fields", () => {
    expect(toPKRInput(4351063)).toBe("43,510.63");
    expect(toPKRInput(0)).toBe("0.00");
    expect(toGoldInput(2298)).toBe("2.298");
    expect(toGoldInput(50000)).toBe("50.000");
    for (const paisa of [1, 99, 100, 500000, 25000000, 9998743]) {
      expect(parsePKR(toPKRInput(paisa))).toBe(paisa);
    }
    for (const mg of [1, 10, 999, 1000, 2500, 52500]) {
      expect(parseGold(toGoldInput(mg))).toBe(mg);
    }
  });

  it("formats basis points as a percentage", () => {
    expect(bpsToPercent(5)).toBe("0.05%");
    expect(bpsToPercent(300)).toBe("3.00%");
    expect(bpsToPercent(0)).toBe("0.00%");
    expect(bpsToPercent(1234)).toBe("12.34%");
  });
});
