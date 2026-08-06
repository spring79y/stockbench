import type { ChangeDirection, IndexQuote, MacroChip, MarketMood } from "@/lib/types";

export const INDEX_DEFINITIONS = [
  { id: "kospi", symbol: "^KS11", name: "코스피", shortName: "KOSPI", region: "KR" as const },
  { id: "kosdaq", symbol: "^KQ11", name: "코스닥", shortName: "KOSDAQ", region: "KR" as const },
  { id: "nasdaq", symbol: "^IXIC", name: "나스닥", shortName: "NASDAQ", region: "US" as const },
  { id: "sp500", symbol: "^GSPC", name: "S&P 500", shortName: "S&P", region: "US" as const },
  { id: "dow", symbol: "^DJI", name: "다우", shortName: "DOW", region: "US" as const },
  { id: "sox", symbol: "^SOX", name: "반도체", shortName: "SOX", region: "US" as const },
] as const;

export const MACRO_DEFINITIONS = [
  {
    id: "usdkkrw",
    symbol: "USDKRW=X",
    name: "원/달러",
    format: "fx" as const,
  },
  {
    id: "us10y",
    symbol: "^TNX",
    name: "미 10년물",
    format: "yield" as const,
  },
  {
    id: "wti",
    symbol: "CL=F",
    name: "WTI",
    format: "oil" as const,
  },
  {
    id: "vix",
    symbol: "^VIX",
    name: "VIX",
    format: "plain" as const,
  },
] as const;

export type YahooQuoteLike = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
  marketState?: string;
  regularMarketTime?: Date | string | number;
  marketCap?: number;
};

export function marketStateLabel(state: string | undefined, region: "KR" | "US"): string {
  switch (state) {
    case "REGULAR":
      return "장중";
    case "PRE":
      return region === "US" ? "프리" : "장전";
    case "PREPRE":
      // 미국 심야·조기 프리 (현금 정규장 전). 완전 마감이 아님.
      return region === "US" ? "프리" : "장전";
    case "POST":
      return region === "US" ? "애프터" : "마감후";
    case "POSTPOST":
      return region === "US" ? "애프터" : "마감후";
    case "CLOSED":
      return "마감";
    default:
      return "참고";
  }
}

export function directionFromNumber(value: number): ChangeDirection {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

export function toneWord(avgChangePercent: number): string {
  if (avgChangePercent >= 0.4) return "강세";
  if (avgChangePercent <= -0.4) return "약세";
  return "보합";
}

export function buildTemperature(quotes: IndexQuote[]): string {
  const kr = quotes.filter((q) => q.region === "KR");
  const us = quotes.filter((q) => q.region === "US");
  const avg = (list: IndexQuote[]) =>
    list.length === 0
      ? 0
      : list.reduce((sum, q) => sum + q.changePercent, 0) / list.length;

  return `국내 ${toneWord(avg(kr))} · 미국 ${toneWord(avg(us))}`;
}

export function buildMood(quotes: IndexQuote[]): { mood: MarketMood; moodLabel: string } {
  const avg =
    quotes.length === 0
      ? 0
      : quotes.reduce((sum, q) => sum + q.changePercent, 0) / quotes.length;

  if (avg <= -1) return { mood: "risk-off", moodLabel: "위험" };
  if (avg <= -0.3) return { mood: "caution", moodLabel: "주의" };
  if (avg >= 0.5) return { mood: "risk-on", moodLabel: "위험선호" };
  return { mood: "mixed", moodLabel: "혼조" };
}

export function formatAsOfLabel(dates: Array<Date | undefined>): string {
  const valid = dates.filter((d): d is Date => Boolean(d));
  const latest = valid.sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();
  const formatted = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(latest);

  return `${formatted} · Yahoo 참고`;
}

export function toIndexQuote(
  def: (typeof INDEX_DEFINITIONS)[number],
  raw: YahooQuoteLike | undefined,
): IndexQuote | null {
  if (!raw?.regularMarketPrice && raw?.regularMarketPrice !== 0) return null;

  return {
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    region: def.region,
    value: Number(raw.regularMarketPrice),
    change: Number(raw.regularMarketChange ?? 0),
    changePercent: Number(raw.regularMarketChangePercent ?? 0),
    status: marketStateLabel(raw.marketState, def.region),
    marketState: raw.marketState,
  };
}

export function toMacroChip(
  def: (typeof MACRO_DEFINITIONS)[number],
  raw: YahooQuoteLike | undefined,
): MacroChip | null {
  if (raw?.regularMarketPrice == null) return null;

  const price = Number(raw.regularMarketPrice);
  const change = Number(raw.regularMarketChange ?? 0);
  const changePercent = Number(raw.regularMarketChangePercent ?? 0);
  const direction = directionFromNumber(change);

  if (def.format === "fx") {
    return {
      id: def.id,
      name: def.name,
      value: price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      changeLabel: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`,
      direction,
    };
  }

  if (def.format === "yield") {
    return {
      id: def.id,
      name: def.name,
      value: `${price.toFixed(2)}%`,
      changeLabel: `${change >= 0 ? "+" : ""}${change.toFixed(3)}%p`,
      direction,
    };
  }

  if (def.format === "oil") {
    return {
      id: def.id,
      name: def.name,
      value: `$${price.toFixed(2)}`,
      changeLabel: `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`,
      direction: directionFromNumber(changePercent),
    };
  }

  return {
    id: def.id,
    name: def.name,
    value: price.toFixed(2),
    changeLabel: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`,
    direction,
  };
}

export function parseYahooTime(value: YahooQuoteLike["regularMarketTime"]): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
