import "server-only";

import { cache } from "react";
import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";
import type { IndexChartSeries } from "@/lib/market/chartTypes";
import {
  INDEX_DEFINITIONS,
  MACRO_DEFINITIONS,
  buildMood,
  buildTemperature,
  formatAsOfLabel,
  parseYahooTime,
  toIndexQuote,
  toMacroChip,
  type YahooQuoteLike,
} from "@/lib/market/map";
import { fetchInvestorFlow, type InvestorFlowBundle } from "@/lib/market/fetchInvestorFlow";
import {
  KS200_SYMBOL,
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
  buildRetailScan,
  emptyRetailScan,
  type RetailScanBundle,
} from "@/lib/market/retailScan";
import type { MarketScope } from "@/lib/market/scope";
import type { IndexQuote, MacroChip, MarketMood } from "@/lib/types";
import {
  indexQuotes as fallbackIndexes,
  macroChips as fallbackMacros,
} from "@/data/mock";

export type LiveMarketBundle = {
  indexes: IndexQuote[];
  macros: MacroChip[];
  temperature: string;
  mood: MarketMood;
  moodLabel: string;
  asOfLabel: string;
  source: "live" | "fallback";
  retailScan: RetailScanBundle;
  charts: Record<string, IndexChartSeries>;
};

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

/** 시장 단위 수급만 캐시 (종목별 byStock 없음). SSR TTFB 완화. */
const getCachedMarketFlow = unstable_cache(
  async (): Promise<InvestorFlowBundle> => fetchInvestorFlow([]),
  ["investor-flow-market-v1"],
  { revalidate: 120 },
);

function asQuoteMap(result: unknown): Record<string, YahooQuoteLike> {
  if (!result || typeof result !== "object") return {};
  return result as Record<string, YahooQuoteLike>;
}

function trimFlow(flow: InvestorFlowBundle): InvestorFlowBundle {
  return {
    ...flow,
    kospiHistory: flow.kospiHistory.slice(0, 7),
    kosdaqHistory: flow.kosdaqHistory.slice(0, 7),
    byStock: {},
  };
}

type CoreMarket = {
  indexes: IndexQuote[];
  macros: MacroChip[];
  temperature: string;
  mood: MarketMood;
  moodLabel: string;
  asOfLabel: string;
};

const CORE_SYMBOLS = [
  ...INDEX_DEFINITIONS.map((d) => d.symbol),
  ...MACRO_DEFINITIONS.map((d) => d.symbol),
];

function retailExtraSymbols(scope: MarketScope): string[] {
  if (scope === "kr") {
    return [KS200_SYMBOL, ...MEGA_CAP_CANDIDATES_KR.map((d) => d.symbol)];
  }
  if (scope === "us") {
    return MEGA_CAP_CANDIDATES_US.map((d) => d.symbol);
  }
  return [];
}

/** Shared across tabs so overview vs US/KR cannot diverge on index mood/temp. */
async function fetchCoreMarketUncached(): Promise<CoreMarket> {
  const rawResult = await yahooFinance.quote(CORE_SYMBOLS, { return: "object" });
  const quotes = asQuoteMap(rawResult);

  const indexes = INDEX_DEFINITIONS.map((def) => toIndexQuote(def, quotes[def.symbol])).filter(
    (q): q is IndexQuote => Boolean(q),
  );

  const macros = MACRO_DEFINITIONS.map((def) => {
    const hit =
      quotes[def.symbol] ?? (def.symbol === "USDKRW=X" ? quotes["KRW=X"] : undefined);
    return toMacroChip(def, hit);
  }).filter((q): q is MacroChip => Boolean(q));

  if (indexes.length === 0) {
    throw new Error("No index quotes returned");
  }

  const times = Object.values(quotes).map((q) => parseYahooTime(q?.regularMarketTime));
  const { mood, moodLabel } = buildMood(indexes);

  return {
    indexes,
    macros: macros.length > 0 ? macros : fallbackMacros,
    temperature: buildTemperature(indexes),
    mood,
    moodLabel,
    asOfLabel: formatAsOfLabel(times),
  };
}

const getCachedCoreMarket = unstable_cache(
  () => fetchCoreMarketUncached(),
  ["live-market-core-v1"],
  { revalidate: 60 },
);

async function fetchRetailExtras(
  scope: MarketScope,
  core: CoreMarket,
): Promise<RetailScanBundle> {
  const needFlow = scope === "kr";
  const needRetailScan = scope === "kr" || scope === "us";
  if (!needRetailScan) return emptyRetailScan();

  const extraSymbols = retailExtraSymbols(scope);
  let extraQuotes: Record<string, YahooQuoteLike> = {};
  try {
    if (extraSymbols.length > 0) {
      const raw = await yahooFinance.quote(extraSymbols, { return: "object" });
      extraQuotes = asQuoteMap(raw);
    }
  } catch (error) {
    console.error("[market] retail extra quotes failed; indexes kept", error);
  }

  const investorFlow = needFlow ? await getCachedMarketFlow() : null;

  if (investorFlow) {
    const slim = trimFlow(investorFlow);
    return buildRetailScan(extraQuotes, core.indexes, core.macros, {
      status: slim.status,
      summary: slim.summary,
      note: slim.note,
      asOfLabel: slim.asOfLabel,
      kospi: slim.kospi,
      kosdaq: slim.kosdaq,
      kospiHistory: slim.kospiHistory,
      kosdaqHistory: slim.kosdaqHistory,
      byStock: {},
    });
  }

  return buildRetailScan(extraQuotes, core.indexes, core.macros);
}

function fallbackBundle(): LiveMarketBundle {
  return {
    indexes: fallbackIndexes,
    macros: fallbackMacros,
    temperature: "국내 보합 · 미국 보합",
    mood: "mixed",
    moodLabel: "혼조",
    asOfLabel: "시세 일시 오류 · 목 데이터",
    source: "fallback",
    retailScan: emptyRetailScan(),
    charts: {},
  };
}

/**
 * Per-request dedupe. Core indexes are cached once for all tabs;
 * fallback is never written into unstable_cache (avoids poisoning US/KR tabs).
 */
export const fetchLiveMarket = cache(
  async (scope: MarketScope = "all"): Promise<LiveMarketBundle> => {
    try {
      const core = await getCachedCoreMarket();
      const retailScan = await fetchRetailExtras(scope, core);
      return {
        indexes: core.indexes,
        macros: core.macros,
        temperature: core.temperature,
        mood: core.mood,
        moodLabel: core.moodLabel,
        asOfLabel: core.asOfLabel,
        source: "live",
        retailScan,
        charts: {},
      };
    } catch (error) {
      console.error("[market] live fetch failed, using fallback", error);
      return fallbackBundle();
    }
  },
);
