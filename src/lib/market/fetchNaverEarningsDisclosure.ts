/**
 * KR earnings actuals from Naver 공정공시 when finance/quarter still shows consensus.
 * Source: m.stock.naver.com `/api/stock/{code}/disclosure` (+ detail HTML contents).
 * Prefer 연결재무제표 영업(잠정)실적. Soft-fail; never invent.
 */
import { toKrItemCode } from "@/lib/market/fetchInvestorFlow";
import {
  fiscalQuarterEndKeyFromEarningsDate,
  type NaverOpConsensus,
} from "@/lib/market/fetchNaverOpConsensus";
import { kstCalendarDay } from "@/lib/events/upcomingRetention";
import type { MarketRegion } from "@/lib/types";

const KR_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
  Accept: "application/json",
} as const;

/** 억원 → 원 */
const KRW_EOK_TO_WON = 100_000_000;

/** Order-of-magnitude gate vs prior consensus (reject unit/별도 mix-ups). */
const MAGNITUDE_MIN = 0.25;
const MAGNITUDE_MAX = 4;

type DisclosureListItem = {
  itemCode?: string;
  disclosureId?: number;
  title?: string;
  datetime?: string;
  author?: string;
};

type DisclosureDetail = {
  itemCode?: string;
  disclosure?: {
    disclosureId?: number;
    title?: string;
    datetime?: string;
    contents?: string;
    comment?: string;
  };
};

/** Only 연결 — 별도 잠정실적은 네이버 finance 컨센서스(연결 규모)와 단위가 어긋나 거부. */
const CONSOLIDATED_EARNINGS_TITLE_RE =
  /연결재무제표.*영업\s*\(?\s*잠정\s*\)?\s*실적|연결.*영업\s*\(?\s*잠정\s*\)?\s*실적.*공정공시/;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEokAmount(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/,/g, "").replace(/^\+/, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Period end YYYYMM from disclosure 당기실적 date range. */
export function periodKeyFromDisclosureText(text: string): string | null {
  const m = text.match(
    /당기실적\s*(\d{4})-(\d{2})-(\d{2})\s*~\s*(\d{4})-(\d{2})-(\d{2})/,
  );
  if (!m) return null;
  return `${m[4]}${m[5]}`;
}

/**
 * High-confidence parse: 억원 unit + 매출액/영업이익 당해실적 both present.
 * Caller must supply 연결재무제표 잠정실적 contents (별도 거부).
 */
export function parseNaverEarningsDisclosureActual(
  contentsHtml: string,
  opts: {
    expectedPeriodKey: string;
    consensus?: Pick<NaverOpConsensus, "operatingProfitAvg" | "revenueAvg"> | null;
  },
): NaverOpConsensus | null {
  const text = stripHtml(contentsHtml);
  if (!/단위\s*:\s*억원/.test(text)) return null;

  const periodKey = periodKeyFromDisclosureText(text);
  if (!periodKey || periodKey !== opts.expectedPeriodKey) return null;

  const revM = text.match(/매출액\s*당해실적\s*([+-]?[\d,]+)/);
  const opM = text.match(/영업이익\s*당해실적\s*([+-]?[\d,]+)/);
  const revEok = parseEokAmount(revM?.[1]);
  const opEok = parseEokAmount(opM?.[1]);
  // Both required — single-metric headlines / partial tables are rejected.
  if (revEok == null || opEok == null) return null;

  const revenueAvg = revEok * KRW_EOK_TO_WON;
  const operatingProfitAvg = opEok * KRW_EOK_TO_WON;

  if (!isPlausibleVsConsensus(operatingProfitAvg, opts.consensus?.operatingProfitAvg)) {
    return null;
  }
  if (!isPlausibleVsConsensus(revenueAvg, opts.consensus?.revenueAvg)) {
    return null;
  }

  return {
    operatingProfitAvg,
    revenueAvg,
    periodKey,
    source: "naver",
  };
}

export function isPlausibleVsConsensus(
  actual: number,
  consensus: number | undefined | null,
): boolean {
  if (consensus == null || !Number.isFinite(consensus) || consensus === 0) {
    // No consensus to check — still accept when both metrics parsed (caller gates).
    return Number.isFinite(actual);
  }
  if (!Number.isFinite(actual)) return false;
  // Same sign preferred for OP; allow small negative actual vs positive consensus
  // only if magnitude still in band (e.g. miss into loss).
  const ratio = Math.abs(actual) / Math.abs(consensus);
  return ratio >= MAGNITUDE_MIN && ratio <= MAGNITUDE_MAX;
}

export function rankEarningsDisclosureCandidates(
  items: DisclosureListItem[],
  opts: { earningsDateISO: string },
): DisclosureListItem[] {
  const earnDay = kstCalendarDay(new Date(opts.earningsDateISO));
  const scored = items
    .filter((it) => it.disclosureId != null && it.title)
    .map((it) => {
      const title = it.title!;
      if (!CONSOLIDATED_EARNINGS_TITLE_RE.test(title)) return null;
      let score = 3;
      if (it.datetime) {
        const day = kstCalendarDay(new Date(it.datetime));
        if (day === earnDay) score += 2;
        else {
          const diff = Math.abs(
            new Date(it.datetime).getTime() - new Date(opts.earningsDateISO).getTime(),
          );
          if (diff <= 36 * 60 * 60 * 1000) score += 1;
          else return null; // too far from earnings window
        }
      }
      return { it, score };
    })
    .filter((x): x is { it: DisclosureListItem; score: number } => x != null);

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.it);
}

async function fetchDisclosureList(code: string): Promise<DisclosureListItem[]> {
  const res = await fetch(
    `https://m.stock.naver.com/api/stock/${code}/disclosure`,
    {
      headers: {
        ...KR_HEADERS,
        Referer: `https://m.stock.naver.com/domestic/stock/${code}`,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as DisclosureListItem[];
  return Array.isArray(data) ? data : [];
}

async function fetchDisclosureDetail(
  code: string,
  disclosureId: number,
): Promise<DisclosureDetail | null> {
  const res = await fetch(
    `https://m.stock.naver.com/api/stock/${code}/disclosure/${disclosureId}`,
    {
      headers: {
        ...KR_HEADERS,
        Referer: `https://m.stock.naver.com/domestic/stock/${code}`,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as DisclosureDetail;
}

/**
 * When finance/quarter is still consensus-only, try Naver 공정공시 잠정실적.
 * Soft-fail on network/parse/period/magnitude miss.
 */
export async function fetchNaverDisclosureOpActual(opts: {
  symbol: string;
  region: MarketRegion;
  earningsDateISO: string;
  consensus?: Pick<NaverOpConsensus, "operatingProfitAvg" | "revenueAvg"> | null;
}): Promise<NaverOpConsensus | null> {
  if (opts.region !== "KR") return null;
  const code = toKrItemCode(opts.symbol);
  if (!code) return null;
  const expectedPeriodKey = fiscalQuarterEndKeyFromEarningsDate(opts.earningsDateISO);
  if (!expectedPeriodKey) return null;

  try {
    const list = await fetchDisclosureList(code);
    const candidates = rankEarningsDisclosureCandidates(list, {
      earningsDateISO: opts.earningsDateISO,
    });
    for (const cand of candidates.slice(0, 3)) {
      const id = cand.disclosureId;
      if (id == null) continue;
      const detail = await fetchDisclosureDetail(code, id);
      const html = detail?.disclosure?.contents;
      if (!html) continue;
      const hit = parseNaverEarningsDisclosureActual(html, {
        expectedPeriodKey,
        consensus: opts.consensus,
      });
      if (hit) return hit;
    }
    return null;
  } catch {
    return null;
  }
}
