import type { LiveMarketBundle } from "@/lib/market/fetchLiveMarket";
import { emptyRetailScan, type RetailScanBundle } from "@/lib/market/retailScan";
import type { MarketScope } from "@/lib/market/scope";

function slimRetailForScope(
  scan: RetailScanBundle,
  scope: MarketScope,
): RetailScanBundle {
  if (scope === "all") {
    return emptyRetailScan();
  }

  if (scope === "kr") {
    return {
      ...scan,
      topCaps: scan.topCapsKr,
      topCapsUs: [],
      signals: scan.signals.filter((s) => s.id !== "top5-us-avg"),
      flow: {
        ...scan.flow,
        byStock: {},
      },
      summaries: {
        ...scan.summaries,
        topCapsUs: "",
      },
    };
  }

  return {
    ...scan,
    ks200: null,
    topCaps: [],
    topCapsKr: [],
    signals: scan.signals.filter(
      (s) => s.id !== "ks200-vs-kospi" && s.id !== "top5-kr-avg",
    ),
    flow: {
      status: "pending",
      summary: "",
      note: "",
      asOfLabel: "",
      kospi: null,
      kosdaq: null,
      kospiHistory: [],
      kosdaqHistory: [],
      byStock: {},
    },
    summaries: {
      ...scan.summaries,
      ks200: "",
      topCaps: "",
      topCapsKr: "",
      flow: "",
    },
  };
}

/** Trim market payload before client hydration for the active tab. */
export function slimMarketForScope(
  market: LiveMarketBundle,
  scope: MarketScope,
): LiveMarketBundle {
  return {
    ...market,
    charts: {},
    retailScan: slimRetailForScope(market.retailScan, scope),
  };
}
