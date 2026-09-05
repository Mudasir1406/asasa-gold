import { Pill } from "@/components/ui/Pill";
import { bpsToPercent } from "@/lib/money";
import { formatAge } from "@/lib/time";
import type { PriceView } from "@/lib/types";

/**
 * TrustBanner
 *
 * One sentence about why the price is not fully trusted. Renders nothing
 * while `LIVE`; amber (gold tint) for `DEGRADED`, coral for `PAUSED`. The
 * text is the API's `trading.reason`, with a spec-§4.4 fallback derived from
 * the snapshot when the API sends none, and the source in use is named.
 *
 * Props
 * - `price` — the current `PriceView`.
 */
export interface TrustBannerProps {
  price: PriceView;
}

/** Name of the source backing the price, or null when none is selected. */
export function selectedSourceName(price: PriceView): string | null {
  if (price.source.selected === "pakgold") return price.source.primary.name;
  if (price.source.selected === "goldprice") return price.source.fallback.name;
  return null;
}

function fallbackReason(price: PriceView): string {
  const name = selectedSourceName(price);
  switch (price.trading.code) {
    case "PRICE_STALE":
      return price.age_seconds === null
        ? "Price data is stale"
        : `Price is ${formatAge(price.age_seconds)} old`;
    case "PRICE_DISPUTED":
      return price.source.divergence_bps === null
        ? "Sources disagree"
        : `Sources disagree by ${bpsToPercent(price.source.divergence_bps)}`;
    case "PRICE_UNAVAILABLE":
      return "Neither price source is responding";
    default:
      return price.source.selected === "goldprice"
        ? "Primary source down — using GoldPrice.org"
        : `Cross-check unavailable — using ${name ?? "one source"} only`;
  }
}

export function TrustBanner({ price }: TrustBannerProps) {
  if (price.status === "LIVE") return null;

  const reason = price.trading.reason ?? fallbackReason(price);
  const source = selectedSourceName(price);
  const paused = price.status === "PAUSED";
  const showSource = source !== null && !reason.includes(source);

  return (
    <div
      role={paused ? "alert" : "status"}
      className={
        paused
          ? "flex items-center justify-between gap-3 rounded-card border border-coral/50 bg-coral/12 px-4 py-3 text-sm text-ink"
          : "flex items-center justify-between gap-3 rounded-card border border-gold bg-gold-soft/40 px-4 py-3 text-sm text-ink"
      }
    >
      <p className="min-w-0">
        <span className="font-semibold">
          {paused ? "Trading paused." : "Reduced confidence."}
        </span>{" "}
        {reason}
      </p>
      {showSource && (
        <Pill tone={paused ? "coral" : "gold"} dot className="shrink-0">
          {source}
        </Pill>
      )}
    </div>
  );
}
