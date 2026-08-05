import type { IndexQuote } from "@/lib/types";
import type { ChartPeriodId } from "@/lib/market/chartPeriods";
import { INDEX_DEFINITIONS } from "@/lib/market/map";

export type ChartPoint = {
  t: string;
  v: number;
  /** 거래량 (1일 차트용) */
  vol?: number;
  /** epoch ms — 1일 차트 시간축용 */
  ms?: number;
};

export type IndexChartSeries = {
  id: string;
  name: string;
  symbol: string;
  points: ChartPoint[];
  /** 차트 메타 부가 문구 (예: 최근 월간) */
  periodLabel?: string;
  period?: ChartPeriodId;
  source?: "yahoo" | "fred";
  transform?: "raw" | "mom" | "yoy";
  hasVolume?: boolean;
  /** 1일 정규장 시작·종료 (축 고정용) */
  sessionStartMs?: number;
  sessionEndMs?: number;
};

const SYMBOL_BY_ID: Record<string, string> = Object.fromEntries(
  INDEX_DEFINITIONS.map((d) => [d.id, d.symbol]),
);

export function chartsForQuotes(
  charts: Record<string, IndexChartSeries>,
  quotes: IndexQuote[],
): IndexChartSeries[] {
  return quotes.map((q) => {
    const hit = charts[q.id];
    if (hit && hit.points.length >= 1) return hit;
    // SSR에서 차트 포인트를 비워 두므로, 펼칠 때 /api/chart 가 쓰도록 stub 제공
    return {
      id: q.id,
      name: q.name,
      symbol: hit?.symbol ?? SYMBOL_BY_ID[q.id] ?? q.id,
      points: hit?.points ?? [],
      period: "1d" as const,
      source: "yahoo" as const,
      periodLabel: hit?.periodLabel,
      hasVolume: hit?.hasVolume,
      sessionStartMs: hit?.sessionStartMs,
      sessionEndMs: hit?.sessionEndMs,
    };
  });
}
