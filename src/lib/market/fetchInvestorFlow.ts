import { formatDayLine, formatFlowAmount } from "@/lib/market/flowFormat";

/** 네이버 금융 일자별 시장/종목 수급. 장중 실시간 아님. */

export type InvestorFlowDay = {
  dateLabel: string;
  personal: number;
  foreign: number;
  institution: number;
};

export type InvestorFlowBundle = {
  status: "live" | "pending";
  asOfLabel: string;
  note: string;
  kospi: InvestorFlowDay | null;
  kosdaq: InvestorFlowDay | null;
  kospiHistory: InvestorFlowDay[];
  kosdaqHistory: InvestorFlowDay[];
  /** 국내 종목별 최근 수급 (id → 일별, 단위: 주) */
  byStock: Record<string, InvestorFlowDay[]>;
  summary: string;
};

const PENDING_NOTE =
  "시장 단위 수급(외국인·기관·개인) 요약은 연동 준비 중. 종목별 매매 신호로 쓰지 않습니다.";

const LIVE_NOTE =
  "일별·장후 집계 성격입니다. 장중 실시간 호가가 아니며, 종목 매매 신호가 아닙니다.";

function emptyFlow(summary = PENDING_NOTE): InvestorFlowBundle {
  return {
    status: "pending",
    asOfLabel: "",
    note: LIVE_NOTE,
    kospi: null,
    kosdaq: null,
    kospiHistory: [],
    kosdaqHistory: [],
    byStock: {},
    summary,
  };
}

function parseSignedQuant(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return raw;
  if (raw == null) return Number.NaN;
  return Number(String(raw).replace(/,/g, "").replace(/^\+/, "").trim());
}

function formatBizdate(bizdate: string): string {
  const m = bizdate.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return bizdate;
  return `${m[2]}.${m[3]}`;
}

/** Yahoo 심볼 → 네이버 종목코드 (005930.KS → 005930) */
export function toKrItemCode(symbol: string): string | null {
  const m = symbol.match(/^(\d{6})\.(KS|KQ)$/i);
  return m ? m[1] : null;
}

type NaverStockTrendRow = {
  bizdate?: string;
  foreignerPureBuyQuant?: string;
  organPureBuyQuant?: string;
  individualPureBuyQuant?: string;
};

async function fetchOneStockTrend(code: string): Promise<InvestorFlowDay[]> {
  const url = `https://m.stock.naver.com/api/stock/${code}/trend`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
      Accept: "application/json",
      Referer: `https://m.stock.naver.com/domestic/stock/${code}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NaverStockTrendRow[];
  if (!Array.isArray(data)) return [];

  const days: InvestorFlowDay[] = [];
  for (const row of data) {
    if (!row.bizdate) continue;
    const personal = parseSignedQuant(row.individualPureBuyQuant);
    const foreign = parseSignedQuant(row.foreignerPureBuyQuant);
    const institution = parseSignedQuant(row.organPureBuyQuant);
    if ([personal, foreign, institution].some((n) => Number.isNaN(n))) continue;
    days.push({
      dateLabel: formatBizdate(row.bizdate),
      personal,
      foreign,
      institution,
    });
  }
  return days;
}

/** 국내 종목 수급(순매매량·주). items.id 키로 반환 */
export async function fetchStockInvestorFlows(
  items: ReadonlyArray<{ id: string; symbol: string }>,
): Promise<Record<string, InvestorFlowDay[]>> {
  const jobs = items.map(async (item) => {
    const code = toKrItemCode(item.symbol);
    if (!code) return [item.id, [] as InvestorFlowDay[]] as const;
    try {
      const days = await fetchOneStockTrend(code);
      return [item.id, days] as const;
    } catch (error) {
      console.error(`[market] stock flow failed for ${item.symbol}`, error);
      return [item.id, [] as InvestorFlowDay[]] as const;
    }
  });
  const pairs = await Promise.all(jobs);
  return Object.fromEntries(pairs);
}

function parseSigned(raw: string): number {
  return Number(raw.replace(/,/g, "").trim());
}

function yyyymmddKst(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}${m}${day}`;
}

function candidateBizdates(count = 5): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(yyyymmddKst(d));
  }
  return out;
}

function parseFlowDays(html: string): InvestorFlowDay[] {
  const matches = [
    ...html.matchAll(
      /<td class="date2">([^<]+)<\/td>\s*<td class="rate_[^"]+">([^<]*)<\/td>\s*<td class="rate_[^"]+">([^<]*)<\/td>\s*<td class="rate_[^"]+">([^<]*)<\/td>/g,
    ),
  ];

  const days: InvestorFlowDay[] = [];
  for (const match of matches) {
    const personal = parseSigned(match[2]);
    const foreign = parseSigned(match[3]);
    const institution = parseSigned(match[4]);
    if ([personal, foreign, institution].some((n) => Number.isNaN(n))) continue;
    days.push({
      dateLabel: match[1].trim().replace(/^(\d{2})\.(\d{2})\.(\d{2})$/, "$2.$3"),
      personal,
      foreign,
      institution,
    });
  }
  return days;
}

async function fetchMarketPage(
  sosok: "01" | "02",
  bizdate: string,
  page: number,
): Promise<InvestorFlowDay[]> {
  const url = `https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=${bizdate}&sosok=${sosok}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
      Referer: "https://finance.naver.com/sise/sise_deal_trend.naver",
      Accept: "text/html,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const buf = Buffer.from(await res.arrayBuffer());
  return parseFlowDays(buf.toString("latin1"));
}

function mergeUnique(days: InvestorFlowDay[]): InvestorFlowDay[] {
  const seen = new Set<string>();
  const out: InvestorFlowDay[] = [];
  for (const day of days) {
    if (seen.has(day.dateLabel)) continue;
    seen.add(day.dateLabel);
    out.push(day);
  }
  return out;
}

async function fetchMarketHistory(sosok: "01" | "02"): Promise<InvestorFlowDay[]> {
  for (const bizdate of candidateBizdates()) {
    try {
      const [page1, page2] = await Promise.all([
        fetchMarketPage(sosok, bizdate, 1),
        fetchMarketPage(sosok, bizdate, 2),
      ]);
      if (page1.length === 0 && page2.length === 0) continue;
      return mergeUnique([...page1, ...page2]);
    } catch {
      // try older bizdate
    }
  }
  return [];
}

export function formatInvestorFlowSummary(bundle: InvestorFlowBundle): string {
  if (bundle.status !== "live") return bundle.summary;
  const lines = [
    bundle.kospi ? formatDayLine("코스피", bundle.kospi) : null,
    bundle.kosdaq ? formatDayLine("코스닥", bundle.kosdaq) : null,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join(" / ") : PENDING_NOTE;
}

export async function fetchInvestorFlow(
  stockItems: ReadonlyArray<{ id: string; symbol: string }> = [],
): Promise<InvestorFlowBundle> {
  try {
    const [kospiHistory, kosdaqHistory, byStock] = await Promise.all([
      fetchMarketHistory("01"),
      fetchMarketHistory("02"),
      stockItems.length > 0
        ? fetchStockInvestorFlows(stockItems)
        : Promise.resolve({} as Record<string, InvestorFlowDay[]>),
    ]);

    const kospi = kospiHistory[0] ?? null;
    const kosdaq = kosdaqHistory[0] ?? null;
    const hasStock = Object.values(byStock).some((days: InvestorFlowDay[]) => days.length > 0);

    if (!kospi && !kosdaq && !hasStock) {
      return emptyFlow("수급 데이터를 불러오지 못했습니다. 연동 재시도 전입니다.");
    }

    const asOfLabel =
      kospi?.dateLabel ??
      kosdaq?.dateLabel ??
      Object.values(byStock).find((d) => d[0])?.[0]?.dateLabel ??
      "";
    const bundle: InvestorFlowBundle = {
      status: "live",
      asOfLabel,
      note: LIVE_NOTE,
      kospi,
      kosdaq,
      kospiHistory,
      kosdaqHistory,
      byStock,
      summary: "",
    };
    bundle.summary = formatInvestorFlowSummary(bundle);
    return bundle;
  } catch (error) {
    console.error("[market] investor flow fetch failed", error);
    return emptyFlow();
  }
}

export { formatFlowAmount, formatDayLine, PENDING_NOTE, LIVE_NOTE };
