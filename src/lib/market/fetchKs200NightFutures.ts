/**
 * 코스피200 야간선물 시세 (공개 JSON 프록시).
 * 주문/매매 판단용이 아닌 야간 온도 참고용.
 */

const NIGHT_FUTURES_URL =
  "https://yagan.picjjang.com/api/quotes.php?action=nightfutures";

const CACHE_TTL_MS = 30_000;

export type Ks200NightChartPoint = {
  /** unix ms */
  t: number;
  v: number;
};

export type Ks200NightFuturesQuote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  /** 원본 업데이트 시각 문자열 (예: 2026-08-05 03:03:00) */
  updated: string;
  fetchedAt: string;
  source: "yagan.picjjang.com";
  note: string;
  /** 야간 세션 가격 시계열 (공개 API points) */
  points: Ks200NightChartPoint[];
  sessionDate: string | null;
};

type NightFuturesRaw = {
  symbol?: string;
  updated?: string;
  open?: number;
  prevClose?: number;
  price?: number;
  change?: number;
  changePct?: number;
  high?: number;
  low?: number;
  points?: Array<{ t?: number; v?: number }>;
  sessionDate?: string;
};

let cache: { at: number; quote: Ks200NightFuturesQuote } | null = null;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parsePoints(raw: NightFuturesRaw["points"]): Ks200NightChartPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: Ks200NightChartPoint[] = [];
  for (const p of raw) {
    const t = num(p?.t);
    const v = num(p?.v);
    if (t == null || v == null) continue;
    out.push({ t, v });
  }
  return out.sort((a, b) => a.t - b.t);
}

async function fetchFresh(): Promise<Ks200NightFuturesQuote> {
  const res = await fetch(NIGHT_FUTURES_URL, {
    headers: {
      Accept: "application/json",
      Referer: "https://yagan.picjjang.com/",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`nightfutures HTTP ${res.status}`);
  }

  const raw = (await res.json()) as NightFuturesRaw;
  const price = num(raw.price);
  if (price == null) {
    throw new Error("nightfutures: missing price");
  }

  const change = num(raw.change) ?? 0;
  const changePercent = num(raw.changePct) ?? 0;

  return {
    symbol: typeof raw.symbol === "string" && raw.symbol ? raw.symbol : "KOSPI200 야간선물",
    price,
    change,
    changePercent,
    open: num(raw.open),
    high: num(raw.high),
    low: num(raw.low),
    prevClose: num(raw.prevClose),
    updated: typeof raw.updated === "string" ? raw.updated : "",
    fetchedAt: new Date().toISOString(),
    source: "yagan.picjjang.com",
    note: "야간 온도 참고 · 주문·매매 판단용 아님 · 예측 아님",
    points: parsePoints(raw.points),
    sessionDate: typeof raw.sessionDate === "string" ? raw.sessionDate : null,
  };
}

export async function fetchKs200NightFutures(): Promise<Ks200NightFuturesQuote> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.quote;
  }

  const quote = await fetchFresh();
  cache = { at: now, quote };
  return quote;
}
