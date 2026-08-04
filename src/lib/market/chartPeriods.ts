import type { ChartPoint } from "@/lib/market/chartTypes";

export type ChartPeriodId =
  | "1d"
  | "1w"
  | "3m"
  | "6m"
  | "1y"
  | "3y"
  | "10y";

export type ChartPeriodDef = {
  id: ChartPeriodId;
  label: string;
  /** Yahoo chart interval */
  yahooInterval: "5m" | "30m" | "1d" | "1wk" | "1mo";
  /** lookback in calendar days for Yahoo period1 */
  yahooDaysBack: number;
  /** FRED: how many transformed points to keep (monthly-ish) */
  fredPoints: number;
};

/** 주식·지수: 네이버 검색 차트와 같은 기간 */
export const STOCK_CHART_PERIODS: ChartPeriodDef[] = [
  { id: "1d", label: "1일", yahooInterval: "5m", yahooDaysBack: 2, fredPoints: 6 },
  { id: "1w", label: "1주", yahooInterval: "30m", yahooDaysBack: 8, fredPoints: 12 },
  { id: "3m", label: "3개월", yahooInterval: "1d", yahooDaysBack: 100, fredPoints: 6 },
  { id: "6m", label: "6개월", yahooInterval: "1d", yahooDaysBack: 200, fredPoints: 9 },
  { id: "1y", label: "1년", yahooInterval: "1d", yahooDaysBack: 380, fredPoints: 14 },
  { id: "3y", label: "3년", yahooInterval: "1wk", yahooDaysBack: 365 * 3 + 14, fredPoints: 40 },
  { id: "10y", label: "10년", yahooInterval: "1mo", yahooDaysBack: 365 * 10 + 60, fredPoints: 130 },
];

/** 경제지표(월간): 1일·1주 제외 */
export const INDICATOR_CHART_PERIODS: ChartPeriodDef[] = STOCK_CHART_PERIODS.filter(
  (p) => p.id !== "1d" && p.id !== "1w",
);

export function getPeriodDef(
  id: ChartPeriodId,
  set: "stock" | "indicator" = "stock",
): ChartPeriodDef {
  const list = set === "indicator" ? INDICATOR_CHART_PERIODS : STOCK_CHART_PERIODS;
  return list.find((p) => p.id === id) ?? list[0];
}

export function defaultPeriodFor(set: "stock" | "indicator"): ChartPeriodId {
  return set === "indicator" ? "1y" : "1d";
}

export function formatChartTime(
  raw: Date | string | number,
  period: ChartPeriodId,
): string {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  if (period === "1d") return `${get("hour")}:${get("minute")}`;
  if (period === "1w") return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
  if (period === "3y" || period === "10y") return `${get("year")}.${get("month")}`;
  return `${get("month")}.${get("day")}`;
}

export function downsamplePoints(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  if (points.length <= maxPoints) return points;
  const out: ChartPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.round(i * step);
    out.push(points[idx]);
  }
  return out;
}
