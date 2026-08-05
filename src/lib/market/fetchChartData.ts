import YahooFinance from "yahoo-finance2";
import type { ChartPoint, IndexChartSeries } from "@/lib/market/chartTypes";
import {
  downsamplePoints,
  formatChartTime,
  getPeriodDef,
  type ChartPeriodId,
} from "@/lib/market/chartPeriods";
import {
  isQuoteInIntradaySession,
  resolveIntradaySession,
} from "@/lib/market/intradaySession";
import { fetchNaverIntraday } from "@/lib/market/fetchNaverIntraday";

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
  sessionStartMs?: number;
  sessionEndMs?: number;
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

  // KR 1일: 네이버 분봉 우선 (Yahoo 장중 지연·전일 잔상 방지)
  if (req.period === "1d") {
    try {
      const naver = await fetchNaverIntraday(req.symbol);
      if (naver && naver.bars.length > 0) {
        const points: ChartPoint[] = naver.bars.map((b) => ({
          t: formatChartTime(b.ms, "1d"),
          v: b.price,
          vol: b.volume,
          ms: b.ms,
        }));
        return {
          id: req.id ?? req.symbol,
          name: req.name ?? req.symbol,
          symbol: req.symbol,
          period: req.period,
          periodLabel: def.label,
          points: downsamplePoints(points, 390),
          hasVolume: points.some((p) => typeof p.vol === "number" && p.vol > 0),
          sessionStartMs: naver.openTimeMs,
          sessionEndMs: naver.closeTimeMs,
        };
      }
    } catch (error) {
      console.error("[chart] naver intraday fallback", req.symbol, error);
    }
  }

  const result = await yf.chart(req.symbol, {
    period1: periodStartDate(def.yahooDaysBack),
    interval: def.yahooInterval,
  });

  const session = req.period === "1d" ? resolveIntradaySession(req.symbol) : null;

  let quotes = (result.quotes ?? []).filter(
    (q) => q.close != null && Number.isFinite(Number(q.close)),
  );

  if (session) {
    const inSession = quotes.filter((q) => {
      const d = q.date instanceof Date ? q.date : new Date(q.date as string | number);
      if (Number.isNaN(d.getTime())) return false;
      return isQuoteInIntradaySession(d, session);
    });
    // 당일 바가 아직 없으면(지연) 응답 안 최근 거래일만 남김 — 이틀 HH:mm 섞임 방지
    if (inSession.length > 0) {
      quotes = inSession;
    } else {
      const byDay = new Map<string, typeof quotes>();
      for (const q of quotes) {
        const d = q.date instanceof Date ? q.date : new Date(q.date as string | number);
        const key = new Intl.DateTimeFormat("en-CA", {
          timeZone: session.timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
        const list = byDay.get(key) ?? [];
        list.push(q);
        byDay.set(key, list);
      }
      const lastDay = [...byDay.keys()].sort().at(-1);
      quotes = lastDay ? (byDay.get(lastDay) ?? []) : quotes;
    }
  }

  const rawPoints: ChartPoint[] = quotes
    .map((q) => {
      const d = q.date instanceof Date ? q.date : new Date(q.date as string | number);
      return {
        t: formatChartTime(d, req.period),
        v: Number(q.close),
        vol:
          q.volume != null && Number.isFinite(Number(q.volume))
            ? Number(q.volume)
            : undefined,
        ms: Number.isNaN(d.getTime()) ? undefined : d.getTime(),
      };
    })
    .filter((p) => p.t);

  const maxPoints = req.period === "1d" ? 120 : req.period === "1w" ? 100 : 160;
  const points = downsamplePoints(rawPoints, maxPoints);
  const hasVolume =
    req.period === "1d" && points.some((p) => typeof p.vol === "number" && p.vol > 0);

  // 세션 축: 당일 필터 성공 시 정규장 창, 아니면 데이터 첫·끝
  let sessionStartMs = session?.startMs;
  let sessionEndMs = session?.endMs;
  if (req.period === "1d" && points.length > 0) {
    const firstMs = points[0].ms;
    const lastMs = points[points.length - 1].ms;
    if (session && quotes.length > 0) {
      const sample = quotes[0].date instanceof Date
        ? quotes[0].date
        : new Date(quotes[0].date as string | number);
      const inToday = isQuoteInIntradaySession(sample, session);
      if (!inToday && firstMs != null && lastMs != null) {
        sessionStartMs = firstMs;
        // 축은 해당일 정규장 길이 유지 어려우면 데이터 범위
        sessionEndMs = lastMs;
      }
    } else if (firstMs != null && lastMs != null) {
      sessionStartMs = firstMs;
      sessionEndMs = lastMs;
    }
  }

  return {
    id: req.id ?? req.symbol,
    name: req.name ?? req.symbol,
    symbol: req.symbol,
    period: req.period,
    periodLabel: def.label,
    points,
    hasVolume,
    sessionStartMs,
    sessionEndMs,
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
    sessionStartMs: data.sessionStartMs,
    sessionEndMs: data.sessionEndMs,
    ...extra,
  };
}
