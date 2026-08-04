import type { IndexQuote } from "@/lib/types";
import type { ChartPeriodId } from "@/lib/market/chartPeriods";

export type ChartPoint = {
  t: string;
  v: number;
  /** 거래량 (1일 차트용) */
  vol?: number;
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
};

export function chartsForQuotes(
  charts: Record<string, IndexChartSeries>,
  quotes: IndexQuote[],
): IndexChartSeries[] {
  return quotes
    .map((q) => charts[q.id])
    .filter((s): s is IndexChartSeries => Boolean(s && s.points.length >= 2));
}
