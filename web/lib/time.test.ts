import { describe, it, expect } from "vitest";
import { formatClock, formatAge, secondsBetween, formatDateTime } from "./time";

describe("time", () => {
  it("formats a countdown as m:ss", () => {
    expect(formatClock(258)).toBe("4:18");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(-3)).toBe("0:00");
    expect(formatClock(3600)).toBe("60:00");
  });

  it("formats an age in the largest sensible unit", () => {
    expect(formatAge(0)).toBe("0 s");
    expect(formatAge(42)).toBe("42 s");
    expect(formatAge(59)).toBe("59 s");
    expect(formatAge(60)).toBe("1 min");
    expect(formatAge(258)).toBe("4 min");
    expect(formatAge(3599)).toBe("59 min");
    expect(formatAge(3600)).toBe("1 h");
    expect(formatAge(7325)).toBe("2 h");
    expect(formatAge(-5)).toBe("0 s");
  });

  it("measures whole seconds between two ISO timestamps", () => {
    expect(
      secondsBetween("2026-09-05T10:00:00.000Z", "2026-09-05T10:04:18.900Z"),
    ).toBe(258);
    expect(
      secondsBetween("2026-09-05T10:04:18.900Z", "2026-09-05T10:00:00.000Z"),
    ).toBe(0);
    expect(secondsBetween("not a date", "2026-09-05T10:00:00.000Z")).toBe(0);
  });

  it("formats a timestamp as a readable local date and time", () => {
    const text = formatDateTime("2026-09-05T10:11:12.345Z");
    expect(text).toContain("2026");
    expect(text).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(formatDateTime("not a date")).toBe("not a date");
  });
});
