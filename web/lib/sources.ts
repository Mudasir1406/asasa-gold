import type { SourceId } from "./types";

/** Display names for the two price sources (spec §4.2). */
export const SOURCE_NAMES: Record<SourceId, string> = {
  pakgold: "PakGold",
  goldprice: "GoldPrice.org",
};

export function sourceName(id: SourceId | null): string {
  return id === null ? "no source" : SOURCE_NAMES[id];
}
