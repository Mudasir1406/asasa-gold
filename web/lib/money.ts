/**
 * Money and metal formatting/parsing.
 *
 * The API transports PKR as integer paisa (1 PKR = 100 paisa) and gold as
 * integer milligrams (1 g = 1,000 mg). Everything here works on integers:
 * whole and fractional parts are split with integer division and remainder,
 * never by multiplying floats. Parsing returns `null` for anything it cannot
 * represent exactly (too many decimals, negatives, unsafe magnitudes).
 */

const PAISA_PER_PKR = 100;
const MG_PER_GRAM = 1000;
const PKR_DECIMALS = 2;
const GOLD_DECIMALS = 3;

const DECIMAL_INPUT = /^(\d*)(?:\.(\d*))?$/;

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer, got ${value}`);
  }
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Splits an integer amount into sign, grouped whole part and zero-padded fraction. */
function splitUnits(
  value: number,
  perUnit: number,
  decimals: number,
): { sign: string; whole: string; frac: string } {
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / perUnit);
  const frac = abs % perUnit;
  return {
    sign: value < 0 ? "-" : "",
    whole: groupThousands(String(whole)),
    frac: String(frac).padStart(decimals, "0"),
  };
}

/**
 * `4349065` → `"PKR 43,490.65"`. With `{ compact: true }` the whole-rupee
 * amount is abbreviated for tight spaces: `"PKR 43.5K"`, `"PKR 5M"`.
 */
export function formatPKR(
  paisa: number,
  opts: { compact?: boolean } = {},
): string {
  assertInteger(paisa, "paisa");
  if (opts.compact) {
    const rupees = Math.trunc(Math.abs(paisa) / PAISA_PER_PKR);
    const short = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(rupees);
    return `${paisa < 0 ? "-" : ""}PKR ${short}`;
  }
  const { sign, whole, frac } = splitUnits(paisa, PAISA_PER_PKR, PKR_DECIMALS);
  return `${sign}PKR ${whole}.${frac}`;
}

/** `2500` → `"2.500 g"`. */
export function formatGold(mg: number): string {
  assertInteger(mg, "mg");
  const { sign, whole, frac } = splitUnits(mg, MG_PER_GRAM, GOLD_DECIMALS);
  return `${sign}${whole}.${frac} g`;
}

/** `4349065` → `"PKR 43,490.65 / g"` for unit prices in paisa per gram. */
export function formatPricePerGram(paisaPerGram: number): string {
  return `${formatPKR(paisaPerGram)} / g`;
}

/**
 * Parses a user-typed decimal into the smallest unit. Accepts thousands
 * separators and whitespace (`1,25,000.5`), a bare leading or trailing dot,
 * and at most `maxDecimals` fractional digits. Rejects signs, exponents,
 * empty input and results beyond `Number.MAX_SAFE_INTEGER`.
 */
function parseDecimal(
  input: string,
  maxDecimals: number,
  perUnit: number,
): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  const match = DECIMAL_INPUT.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? "";
  const frac = match[2] ?? "";
  if (whole === "" && frac === "") return null;
  if (frac.length > maxDecimals) return null;
  const wholeUnits = whole === "" ? 0 : Number(whole);
  const fracUnits = frac === "" ? 0 : Number(frac.padEnd(maxDecimals, "0"));
  const result = wholeUnits * perUnit + fracUnits;
  return Number.isSafeInteger(result) ? result : null;
}

/** `"250,000"` → `25000000` paisa; `"99.999"`, `"-5"`, `""` → `null`. */
export function parsePKR(input: string): number | null {
  return parseDecimal(input, PKR_DECIMALS, PAISA_PER_PKR);
}

/** `"2.5"` → `2500` mg; more than three decimals or invalid text → `null`. */
export function parseGold(input: string): number | null {
  return parseDecimal(input, GOLD_DECIMALS, MG_PER_GRAM);
}

/** `4351063` → `"43,510.63"`: a paisa amount as text the PKR field accepts back. */
export function toPKRInput(paisa: number): string {
  return formatPKR(paisa).replace(/^-?PKR /, (m) => (m.startsWith("-") ? "-" : ""));
}

/** `2298` → `"2.298"`: a milligram amount as text the gold field accepts back. */
export function toGoldInput(mg: number): string {
  return formatGold(mg).replace(/ g$/, "");
}

/** `5` → `"0.05%"`, `300` → `"3.00%"` (1 bps = 0.01 %). */
export function bpsToPercent(bps: number): string {
  assertInteger(bps, "bps");
  const { sign, whole, frac } = splitUnits(bps, 100, 2);
  return `${sign}${whole}.${frac}%`;
}
