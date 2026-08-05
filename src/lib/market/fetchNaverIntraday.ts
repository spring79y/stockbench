/**
 * 네이버 증권 국내 분봉 (장중 1일 차트).
 * Yahoo ^KS11 분봉이 장중에도 전일에 머무는 경우가 있어 KR 1일은 여기로 보강.
 */

export type NaverIntradayBar = {
  ms: number;
  price: number;
  volume?: number;
};

export type NaverIntradaySeries = {
  bars: NaverIntradayBar[];
  openTimeMs: number;
  closeTimeMs: number;
  lastClosePrice: number | null;
};

function parseNaverLocalDateTime(raw: string): number | null {
  // 20260805091700
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Asia/Seoul = UTC+9 (KRX, DST 없음)
  const utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h) - 9,
    Number(mi),
    Number(s),
  );
  return utc;
}

/** Yahoo 심볼 → 네이버 chart path */
export function naverChartPathForYahooSymbol(symbol: string): string | null {
  if (symbol === "^KS11") return "domestic/index/KOSPI";
  if (symbol === "^KQ11") return "domestic/index/KOSDAQ";
  const stock = symbol.match(/^(\d{6})\.(KS|KQ)$/i);
  if (stock) return `domestic/item/${stock[1]}`;
  return null;
}

type NaverChartJson = {
  openTime?: string;
  closeTime?: string;
  lastClosePrice?: number;
  priceInfos?: Array<{
    localDateTime?: string;
    currentPrice?: number;
    accumulatedTradingVolume?: number;
  }>;
};

export async function fetchNaverIntraday(
  yahooSymbol: string,
): Promise<NaverIntradaySeries | null> {
  const path = naverChartPathForYahooSymbol(yahooSymbol);
  if (!path) return null;

  const url = `https://api.stock.naver.com/chart/${path}?periodType=day&candleCount=400`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
      Referer: "https://m.stock.naver.com/",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as NaverChartJson;
  const openTimeMs = json.openTime ? parseNaverLocalDateTime(json.openTime) : null;
  const closeTimeMs = json.closeTime ? parseNaverLocalDateTime(json.closeTime) : null;
  if (openTimeMs == null || closeTimeMs == null) return null;

  const bars: NaverIntradayBar[] = [];
  for (const row of json.priceInfos ?? []) {
    if (!row.localDateTime || row.currentPrice == null) continue;
    const ms = parseNaverLocalDateTime(row.localDateTime);
    if (ms == null || !Number.isFinite(row.currentPrice)) continue;
    bars.push({
      ms,
      price: Number(row.currentPrice),
      volume:
        row.accumulatedTradingVolume != null &&
        Number.isFinite(row.accumulatedTradingVolume)
          ? Number(row.accumulatedTradingVolume)
          : undefined,
    });
  }

  if (bars.length === 0) return null;

  // 누적거래량 → 봉별 증분
  let prevVol = 0;
  const withDelta = bars.map((b) => {
    const acc = b.volume ?? 0;
    const delta = Math.max(0, acc - prevVol);
    prevVol = acc;
    return { ...b, volume: delta };
  });

  return {
    bars: withDelta,
    openTimeMs,
    closeTimeMs,
    lastClosePrice:
      typeof json.lastClosePrice === "number" && Number.isFinite(json.lastClosePrice)
        ? json.lastClosePrice
        : null,
  };
}
