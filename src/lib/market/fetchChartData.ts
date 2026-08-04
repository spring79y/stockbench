import YahooFinance from "yahoo-finance2";
import type { ChartPoint, IndexChartSeries } from "@/lib/market/chartTypes";
import {
  downsamplePoints,
  formatChartTime,
  getPeriodDef,
  type ChartPeriodId,
} from "@/lib/market/chartPeriods";

export type ChartDataRequest = {
  symbol: string;
  name?: string;
  id?: string;
  period: ChartPeriodId;
  source?: "yahoo" | "fred";
  transform?: "raw" | "mom" | "yoy";
  periodSet?: "stock" | "indicator";
};

export type ChartDataResult = {
  id: string;
  name: string;
  symbol: string;
  period: ChartPeriodId;
  periodLabel: string;
  points: ChartPoint[];
  hasVolume: boolean;
};

function periodStartDate(daysBack: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

async function fetchFredCsv(seriesId: string): Promise<Array<{ date: string; value: number }>> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
      Accept: "text/csv,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const text = await res.text();
  const rows: Array<{ date: string; value: number }> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("DATE") || trimmed.startsWith("observation")) continue;
    const [date, raw] = trimmed.split(",");
    if (!date || raw == null || raw === "." || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    rows.push({ date, value });
  }
  return rows;
}

function applyTransform(
  rows: Array<{ date: string; value: number }>,
  transform: "raw" | "mom" | "yoy",
): Array<{ date: string; value: number }> {
  if (transform === "raw") return rows;
  if (transform === "mom") {
    const out: Array<{ date: string; value: number }> = [];
    for (let i = 1; i < rows.length; i += 1) {
      out.push({
        date: rows[i].date,
        value: Number((rows[i].value - rows[i - 1].value).toFixed(2)),
      });
    }
    return out;
  }
  const byDate = new Map(rows.map((r) => [r.date, r.value]));
  const out: Array<{ date: string; value: number }> = [];
  for (const row of rows) {
    const d = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    const prevKey = d.toISOString().slice(0, 10);
    const prev = byDate.get(prevKey) ?? byDate.get(`${prevKey.slice(0, 8)}01`);
    if (prev == null || prev === 0) continue;
    out.push({
      date: row.date,
      value: Number((((row.value - prev) / prev) * 100).toFixed(2)),
    });
  }
  return out;
}

function formatFredLabel(isoDate: string, period: ChartPeriodId): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})/);
  if (!m) return isoDate;
  if (period === "3y" || period === "10y") return `${m[1].slice(2)}.${m[2]}`;
  return `${m[1].slice(2)}.${m[2]}`;
}

async function fetchYahooSeries(
  yf: InstanceType<typeof YahooFinance>,
  req: ChartDataRequest,
): Promise<ChartDataResult> {
  const periodSet = req.periodSet ?? "stock";
  const def = getPeriodDef(req.period, periodSet);
  const result = await yf.chart(req.symbol, {
    period1: periodStartDate(def.yahooDaysBack),
    interval: def.yahooInterval,
  });

  const rawPoints: ChartPoint[] = (result.quotes ?? [])
    .filter((q) => q.close != null && Number.isFinite(Number(q.close)))
    .map((q) => ({
      t: formatChartTime(q.date, req.period),
      v: Number(q.close),
      vol:
        q.volume != null && Number.isFinite(Number(q.volume))
          ? Number(q.volume)
          : undefined,
    }))
    .filter((p) => p.t);

  const maxPoints = req.period === "1d" ? 120 : req.period === "1w" ? 100 : 160;
  const points = downsamplePoints(rawPoints, maxPoints);
  const hasVolume =
    req.period === "1d" && points.some((p) => typeof p.vol === "number" && p.vol > 0);

  return {
    id: req.id ?? req.symbol,
    name: req.name ?? req.symbol,
    symbol: req.symbol,
    period: req.period,
    periodLabel: def.label,
    points,
    hasVolume,
  };
}

async function fetchFredSeries(req: ChartDataRequest): Promise<ChartDataResult> {
  const periodSet = req.periodSet ?? "indicator";
  const def = getPeriodDef(req.period, periodSet);
  const transform = req.transform ?? "raw";
  const rows = applyTransform(await fetchFredCsv(req.symbol), transform);
  const slice = rows.slice(-def.fredPoints);
  const points: ChartPoint[] = slice.map((r) => ({
    t: formatFredLabel(r.date, req.period),
    v: r.value,
  }));

  return {
    id: req.id ?? req.symbol,
    name: req.name ?? req.symbol,
    symbol: req.symbol,
    period: req.period,
    periodLabel: `${def.label}${transform === "yoy" ? " · 전년비" : transform === "mom" ? " · 전월차" : ""}`,
    points,
    hasVolume: false,
  };
}

export async function fetchChartData(req: ChartDataRequest): Promise<ChartDataResult> {
  const source = req.source ?? "yahoo";
  if (source === "fred") return fetchFredSeries(req);
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return fetchYahooSeries(yf, req);
}

/** SSR용: 기본 기간 시리즈를 IndexChartSeries 형태로 */
export function toIndexChartSeries(
  data: ChartDataResult,
  extra?: Partial<IndexChartSeries>,
): IndexChartSeries {
  return {
    id: data.id,
    name: data.name,
    symbol: data.symbol,
    points: data.points,
    periodLabel: data.periodLabel,
    period: data.period,
    source: extra?.source,
    transform: extra?.transform,
    hasVolume: data.hasVolume,
    ...extra,
  };
}
