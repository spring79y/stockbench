import type { IndexChartSeries } from "@/lib/market/chartTypes";
import { fetchChartData, toIndexChartSeries } from "@/lib/market/fetchChartData";
import type { ChartPeriodId } from "@/lib/market/chartPeriods";

export type EventChartDef = {
  id: string;
  name: string;
  /** FRED series id or Yahoo symbol */
  symbol: string;
  source: "fred" | "yahoo";
  /** raw: 원본 / mom: 전월차 / yoy: 전년동월비(%) */
  transform?: "raw" | "mom" | "yoy";
  /** @deprecated points now driven by period */
  points?: number;
  periodLabel?: string;
};

export async function fetchEventIndicatorCharts(
  defs: EventChartDef[],
  period: ChartPeriodId = "1y",
): Promise<IndexChartSeries[]> {
  const series = await Promise.all(
    defs.map(async (def) => {
      try {
        const data = await fetchChartData({
          id: def.id,
          name: def.name,
          symbol: def.symbol,
          period,
          source: def.source,
          transform: def.transform ?? "raw",
          periodSet: def.source === "fred" ? "indicator" : "stock",
        });
        return toIndexChartSeries(data, {
          source: def.source,
          transform: def.transform ?? "raw",
          periodLabel: def.periodLabel ?? data.periodLabel,
        });
      } catch (error) {
        console.error(`[market] event chart failed ${def.id}`, error);
        return {
          id: def.id,
          name: def.name,
          symbol: def.symbol,
          points: [],
          source: def.source,
          transform: def.transform ?? "raw",
          periodLabel: def.periodLabel,
          period,
        } satisfies IndexChartSeries;
      }
    }),
  );

  return series.filter((s) => s.points.length >= 2);
}
