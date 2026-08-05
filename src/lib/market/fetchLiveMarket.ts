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

function symbolsForScope(scope: MarketScope): string[] {
  const symbols: string[] = [
    ...INDEX_DEFINITIONS.map((d) => d.symbol),
    ...MACRO_DEFINITIONS.map((d) => d.symbol),
  ];
  if (scope === "kr") {
    symbols.push(KS200_SYMBOL, ...MEGA_CAP_CANDIDATES_KR.map((d) => d.symbol));
  } else if (scope === "us") {
    symbols.push(...MEGA_CAP_CANDIDATES_US.map((d) => d.symbol));
  }
  // overview: 지수·매크로만 (시총·수급은 탭 전환 시 해당 scope SSR)
  return symbols;
}

function trimFlow(flow: InvestorFlowBundle): InvestorFlowBundle {
  return {
    ...flow,
    kospiHistory: flow.kospiHistory.slice(0, 7),
    kosdaqHistory: flow.kosdaqHistory.slice(0, 7),
    byStock: {},
  };
}

async function fetchLiveMarketUncached(
  scope: MarketScope,
): Promise<LiveMarketBundle> {
  const symbols = symbolsForScope(scope);
  const needFlow = scope === "kr";
  const needRetailScan = scope === "kr" || scope === "us";

  try {
    // 차트·종목별 수급은 펼칠 때 /api 로 로드. overview는 수급 HTML 스크랩도 생략.
    const [rawResult, investorFlow] = await Promise.all([
      yahooFinance.quote(symbols, { return: "object" }),
      needFlow ? getCachedMarketFlow() : Promise.resolve(null),
    ]);
    const quotes = asQuoteMap(rawResult);

    const indexes = INDEX_DEFINITIONS.map((def) => toIndexQuote(def, quotes[def.symbol])).filter(
      (q): q is IndexQuote => Boolean(q),
    );

    const macros = MACRO_DEFINITIONS.map((def) => {
      const hit =
        quotes[def.symbol] ??
        (def.symbol === "USDKRW=X" ? quotes["KRW=X"] : undefined);
      return toMacroChip(def, hit);
    }).filter((q): q is MacroChip => Boolean(q));

    if (indexes.length === 0) {
      throw new Error("No index quotes returned");
    }

    const times = Object.values(quotes).map((q) => parseYahooTime(q?.regularMarketTime));
    const { mood, moodLabel } = buildMood(indexes);

    let retailScan: RetailScanBundle;
    if (!needRetailScan) {
      retailScan = emptyRetailScan();
    } else if (investorFlow) {
      const slim = trimFlow(investorFlow);
      retailScan = buildRetailScan(quotes, indexes, macros, {
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
    } else {
      retailScan = buildRetailScan(quotes, indexes, macros);
    }

    return {
      indexes,
      macros: macros.length > 0 ? macros : fallbackMacros,
      temperature: buildTemperature(indexes),
      mood,
      moodLabel,
      asOfLabel: formatAsOfLabel(times),
      source: "live",
      retailScan,
      charts: {},
    };
  } catch (error) {
    console.error("[market] live fetch failed, using fallback", error);
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
}

/** Per-request dedupe + short ISR cache for live quotes. */
export const fetchLiveMarket = cache(
  async (scope: MarketScope = "all"): Promise<LiveMarketBundle> => {
    return unstable_cache(
      () => fetchLiveMarketUncached(scope),
      ["live-market-v2", scope],
      { revalidate: 60 },
    )();
  },
);
