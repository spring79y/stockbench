import YahooFinance from "yahoo-finance2";
import { INDEX_DEFINITIONS } from "@/lib/market/map";
import type { IndexChartSeries } from "@/lib/market/chartTypes";
import {
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
} from "@/lib/market/retailScan";
import { fetchChartData, toIndexChartSeries } from "@/lib/market/fetchChartData";

export async function fetchIndexCharts(
  _yf: InstanceType<typeof YahooFinance>,
): Promise<Record<string, IndexChartSeries>> {
  const defs = [
    ...INDEX_DEFINITIONS.map((d) => ({ id: d.id, symbol: d.symbol, name: d.name })),
    ...MEGA_CAP_CANDIDATES_KR.map((d) => ({ id: d.id, symbol: d.symbol, name: d.name })),
    ...MEGA_CAP_CANDIDATES_US.map((d) => ({ id: d.id, symbol: d.symbol, name: d.name })),
  ];

  const entries = await Promise.all(
    defs.map(async (def) => {
      try {
        const data = await fetchChartData({
          id: def.id,
          name: def.name,
          symbol: def.symbol,
          period: "1d",
          source: "yahoo",
          periodSet: "stock",
        });
        return [
          def.id,
          toIndexChartSeries(data, { source: "yahoo", period: "1d" }),
        ] as const;
      } catch (error) {
        console.error(`[market] chart failed for ${def.symbol}`, error);
        return [
          def.id,
          {
            id: def.id,
            name: def.name,
            symbol: def.symbol,
            points: [],
            source: "yahoo" as const,
            period: "1d" as const,
          },
        ] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}
