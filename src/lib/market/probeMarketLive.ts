import "server-only";

import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

/**
 * Cheap live/fallback probe for footers that only need a disclaimer flag.
 * One symbol, cached — not a full market bundle.
 */
export async function probeMarketLive(): Promise<boolean> {
  return getCachedProbe();
}

const getCachedProbe = unstable_cache(
  async (): Promise<boolean> => {
    try {
      const raw = await yahooFinance.quote("^KS11");
      const price =
        raw && typeof raw === "object" && "regularMarketPrice" in raw
          ? (raw as { regularMarketPrice?: number }).regularMarketPrice
          : undefined;
      return typeof price === "number" && Number.isFinite(price);
    } catch {
      return false;
    }
  },
  ["market-live-probe-v1"],
  { revalidate: 120 },
);
