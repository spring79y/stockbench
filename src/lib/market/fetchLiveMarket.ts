import "server-only";

import YahooFinance from "yahoo-finance2";
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
import { fetchIndexCharts } from "@/lib/market/fetchIndexCharts";
import { fetchInvestorFlow } from "@/lib/market/fetchInvestorFlow";
import {
  KS200_SYMBOL,
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
  buildRetailScan,
  emptyRetailScan,
  type RetailScanBundle,
} from "@/lib/market/retailScan";
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

function asQuoteMap(result: unknown): Record<string, YahooQuoteLike> {
  if (!result || typeof result !== "object") return {};
  return result as Record<string, YahooQuoteLike>;
}

export async function fetchLiveMarket(): Promise<LiveMarketBundle> {
  const symbols = [
    ...INDEX_DEFINITIONS.map((d) => d.symbol),
    ...MACRO_DEFINITIONS.map((d) => d.symbol),
    KS200_SYMBOL,
    ...MEGA_CAP_CANDIDATES_KR.map((d) => d.symbol),
    ...MEGA_CAP_CANDIDATES_US.map((d) => d.symbol),
  ];

  try {
    const [rawResult, charts, investorFlow] = await Promise.all([
      yahooFinance.quote(symbols, { return: "object" }),
      fetchIndexCharts(yahooFinance),
      fetchInvestorFlow(MEGA_CAP_CANDIDATES_KR),
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
    const retailScan = buildRetailScan(quotes, indexes, macros, {
      status: investorFlow.status,
      summary: investorFlow.summary,
      note: investorFlow.note,
      asOfLabel: investorFlow.asOfLabel,
      kospi: investorFlow.kospi,
      kosdaq: investorFlow.kosdaq,
      kospiHistory: investorFlow.kospiHistory,
      kosdaqHistory: investorFlow.kosdaqHistory,
      byStock: investorFlow.byStock,
    });

    return {
      indexes,
      macros: macros.length > 0 ? macros : fallbackMacros,
      temperature: buildTemperature(indexes),
      mood,
      moodLabel,
      asOfLabel: formatAsOfLabel(times),
      source: "live",
      retailScan,
      charts,
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
