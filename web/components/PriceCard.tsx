import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { selectedSourceName } from "@/components/TrustBanner";
import { cx } from "@/lib/cx";
import { bpsToPercent, formatPKR, formatPricePerGram } from "@/lib/money";
import { formatAge, formatClock, secondsBetween } from "@/lib/time";
import type { PriceView, SourceReading, Verification } from "@/lib/types";

const VERIFICATION: Record<Verification, { label: string; tone: PillTone }> = {
  CROSS_CHECKED: { label: "Cross-checked ✓", tone: "lime" },
  SINGLE_SOURCE: { label: "Single source", tone: "gold" },
  DISPUTED: { label: "Disputed", tone: "coral" },
  UNAVAILABLE: { label: "Unavailable", tone: "coral" },
};

const STATUS: Record<PriceView["status"], { label: string; tone: PillTone }> = {
  LIVE: { label: "Live", tone: "lime" },
  DEGRADED: { label: "Degraded", tone: "gold" },
  PAUSED: { label: "Paused", tone: "coral" },
};

/**
 * PriceCard
 *
 * "24K gold · PKR per gram": the market reference price large, the customer
 * buy and sell prices as pills, the source in use, the cross-check state,
 * a locally ticking "Updated N ago · next refresh in m:ss" line, and the
 * guardrail line only when it binds. When no trusted price exists the last
 * known price is shown greyed with its age instead of going blank. The ⓘ
 * popover lists both raw source readings, their derivation and the
 * divergence between them.
 *
 * Props
 * - `price` — the current `PriceView`.
 * - `elapsed` — whole seconds since `price` was received (the app-state tick);
 *   added to `age_seconds` and subtracted from `next_refresh_in_seconds`.
 */
export interface PriceCardProps {
  price: PriceView;
  elapsed: number;
}

export function PriceCard({ price, elapsed }: PriceCardProps) {
  const market = price.market_paisa_per_gram;
  const age = price.age_seconds === null ? null : price.age_seconds + elapsed;
  const nextRefreshIn = Math.max(0, price.next_refresh_in_seconds - elapsed);
  const verification = VERIFICATION[price.source.verification];
  const status = STATUS[price.status];
  const sourceName = selectedSourceName(price);

  const lastKnown = price.last_known_market_paisa_per_gram;
  const lastKnownAge =
    price.last_known_at === null
      ? null
      : secondsBetween(price.last_known_at, price.server_now) + elapsed;

  return (
    <Card
      eyebrow="24K gold · PKR per gram"
      action={
        <Pill tone={status.tone} dot>
          {status.label}
        </Pill>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          {market !== null ? (
            <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink sm:text-5xl">
              {formatPKR(market)}{" "}
              <span className="text-base font-medium text-ink-muted">/ g</span>
            </p>
          ) : lastKnown !== null ? (
            <>
              <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink-muted sm:text-5xl">
                {formatPKR(lastKnown)}{" "}
                <span className="text-base font-medium">/ g</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Last known
                {lastKnownAge !== null && ` · ${formatAge(lastKnownAge)} ago`}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-4xl font-semibold text-ink-muted sm:text-5xl">
                —
              </p>
              <p className="mt-1 text-sm text-ink-muted">No price yet</p>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <PricePill label="Buy" paisaPerGram={price.buy_paisa_per_gram} />
          <PricePill label="Sell" paisaPerGram={price.sell_paisa_per_gram} />
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <Pill tone="neutral">
            <span className="text-ink-muted">via</span>{" "}
            {sourceName ?? "no source"}
          </Pill>
          <Pill tone={verification.tone} dot>
            {verification.label}
          </Pill>
          <DerivationPopover price={price} />
        </div>

        <p className="text-sm text-ink-muted">
          {age === null
            ? "No price fetched yet"
            : `Updated ${formatAge(age)} ago · ${
                nextRefreshIn > 0
                  ? `next refresh in ${formatClock(nextRefreshIn)}`
                  : "refresh due"
              }`}
        </p>

        {price.guardrail_applied && (
          <p className="flex items-center gap-2 rounded-field bg-forest/6 px-3 py-2 text-sm text-forest">
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
              <path
                d="M8 1.5l5 2v4c0 3-2.2 5.3-5 6.5C5.2 12.8 3 10.5 3 7.5v-4l5-2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              Guardrail applied · floor{" "}
              <span className="font-medium tabular-nums">
                {formatPKR(price.guardrail_paisa_per_gram)}
              </span>
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

function PricePill({
  label,
  paisaPerGram,
}: {
  label: string;
  paisaPerGram: number | null;
}) {
  return (
    <Pill
      size="md"
      tone="neutral"
      className={cx("tabular-nums", paisaPerGram === null && "text-ink-muted")}
    >
      <span className="text-ink-muted">{label}</span>
      {paisaPerGram === null ? "—" : formatPKR(paisaPerGram)}
    </Pill>
  );
}

function DerivationPopover({ price }: { price: PriceView }) {
  return (
    <details>
      <summary
        aria-label="How this price is derived"
        className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full text-ink-muted hover:bg-ink/6 hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 9v5M10 6.5v.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </summary>
      <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-card border border-ink/8 bg-white p-4 text-sm shadow-lg sm:left-auto sm:w-[22rem]">
        <p className="font-display font-semibold">How this price is derived</p>
        <div className="mt-3 flex flex-col gap-3">
          <SourceRow
            reading={price.source.primary}
            selected={price.source.selected === "pakgold"}
            note="pakgold.pk method: gold-api × USD/PKR"
          />
          <SourceRow
            reading={price.source.fallback}
            selected={price.source.selected === "goldprice"}
          />
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-ink/6 pt-3 text-ink-muted">
          <dt>Divergence</dt>
          <dd className="tabular-nums text-ink">
            {price.source.divergence_bps === null
              ? "—"
              : `${bpsToPercent(price.source.divergence_bps)} (limit 3.00%)`}
          </dd>
          <dt>Buy / Sell</dt>
          <dd className="text-ink">market × 1.10 / market × 0.90</dd>
          <dt>Guardrail</dt>
          <dd className="tabular-nums text-ink">
            buy floor {formatPKR(price.guardrail_paisa_per_gram)}
          </dd>
        </dl>
      </div>
    </details>
  );
}

function metaNumber(reading: SourceReading, key: string): number | null {
  const value = reading.meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metaMethod(reading: SourceReading): string | null {
  const value = reading.meta?.method;
  return typeof value === "string" ? value : null;
}

function SourceRow({
  reading,
  selected,
  note,
}: {
  reading: SourceReading;
  selected: boolean;
  note?: string;
}) {
  const method = metaMethod(reading);
  const xau = metaNumber(reading, "xau_usd_per_oz");
  const fx = metaNumber(reading, "usd_to_pkr");
  const pkrPerOz = metaNumber(reading, "pkr_per_oz");
  const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-ink">
          {reading.name}
          {selected && (
            <span className="ml-1.5 text-xs font-normal text-forest">in use</span>
          )}
        </span>
        <span className="tabular-nums text-ink">
          {reading.ok && reading.paisa_per_gram !== null
            ? formatPricePerGram(reading.paisa_per_gram)
            : "—"}
        </span>
      </div>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
      {reading.ok ? (
        <>
          {method && <p className="text-xs text-ink-muted">{method}</p>}
          {xau !== null && fx !== null && (
            <p className="text-xs tabular-nums text-ink-muted">
              XAU ${decimal.format(xau)}/oz × {decimal.format(fx)} PKR/USD
            </p>
          )}
          {pkrPerOz !== null && (
            <p className="text-xs tabular-nums text-ink-muted">
              PKR {decimal.format(pkrPerOz)}/oz
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-coral">{reading.error ?? "Not responding"}</p>
      )}
    </div>
  );
}
