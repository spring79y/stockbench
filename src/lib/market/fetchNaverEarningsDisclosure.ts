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

export type DisclosureSoftFailReason =
  | "title"
  | "window"
  | "no_contents"
  | "no_unit"
  | "period_mismatch"
  | "partial_metrics"
  | "magnitude_op"
  | "magnitude_rev"
  | "parse_null";

/** Process-local counters for diagnosable soft-fails (tests / ops logs). */
export const disclosureSoftFailCounts: Record<DisclosureSoftFailReason, number> = {
  title: 0,
  window: 0,
  no_contents: 0,
  no_unit: 0,
  period_mismatch: 0,
  partial_metrics: 0,
  magnitude_op: 0,
  magnitude_rev: 0,
  parse_null: 0,
};

export function resetDisclosureSoftFailCounts(): void {
  for (const k of Object.keys(disclosureSoftFailCounts) as DisclosureSoftFailReason[]) {
    disclosureSoftFailCounts[k] = 0;
  }
}

function bumpSoftFail(reason: DisclosureSoftFailReason): void {
  disclosureSoftFailCounts[reason] += 1;
}

/**
 * 연결 only — 별도 잠정실적은 네이버 finance 컨센서스(연결 규모)와 단위가 어긋나 거부.
 * Slightly looser title variants; 억원 + period + magnitude gates still apply in parse.
 */
const CONSOLIDATED_EARNINGS_TITLE_RE =
  /연결재무제표.*영업\s*\(?\s*잠정\s*\)?\s*실적|연결.*영업\s*\(?\s*잠정\s*\)?\s*실적.*공정공시|연결재무제표.*잠정\s*실적|연결.*공정공시.*영업.*실적|연결재무제표기준\s*영업/;

export function isConsolidatedEarningsDisclosureTitle(title: string): boolean {
  if (/별도\s*재무|^\s*별도|별도\s*\(?\s*잠정/.test(title) && !/연결/.test(title)) {
    return false;
  }
  if (/별도/.test(title) && !/연결/.test(title)) return false;
  return CONSOLIDATED_EARNINGS_TITLE_RE.test(title);
}

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

export type DisclosureParseDiagnosis = {
  ok: NaverOpConsensus | null;
  reject?: Exclude<
    DisclosureSoftFailReason,
    "title" | "window" | "no_contents" | "parse_null"
  >;
};

/**
 * High-confidence parse: 억원 unit + 매출액/영업이익 당해실적 both present.
 * Caller must supply 연결재무제표 잠정실적 contents (별도 거부).
 */
export function diagnoseNaverEarningsDisclosureActual(
  contentsHtml: string,
  opts: {
    expectedPeriodKey: string;
    consensus?: Pick<NaverOpConsensus, "operatingProfitAvg" | "revenueAvg"> | null;
  },
): DisclosureParseDiagnosis {
  const text = stripHtml(contentsHtml);
  if (!/단위\s*:\s*억원/.test(text)) return { ok: null, reject: "no_unit" };

  const periodKey = periodKeyFromDisclosureText(text);
  if (!periodKey || periodKey !== opts.expectedPeriodKey) {
    return { ok: null, reject: "period_mismatch" };
  }

  const revM = text.match(/매출액\s*당해실적\s*([+-]?[\d,]+)/);
  const opM = text.match(/영업이익\s*당해실적\s*([+-]?[\d,]+)/);
  const revEok = parseEokAmount(revM?.[1]);
  const opEok = parseEokAmount(opM?.[1]);
  // Both required — single-metric headlines / partial tables are rejected.
  if (revEok == null || opEok == null) return { ok: null, reject: "partial_metrics" };

  const revenueAvg = revEok * KRW_EOK_TO_WON;
  const operatingProfitAvg = opEok * KRW_EOK_TO_WON;

  if (!isPlausibleVsConsensus(operatingProfitAvg, opts.consensus?.operatingProfitAvg)) {
    return { ok: null, reject: "magnitude_op" };
  }
  if (!isPlausibleVsConsensus(revenueAvg, opts.consensus?.revenueAvg)) {
    return { ok: null, reject: "magnitude_rev" };
  }

  return {
    ok: {
      operatingProfitAvg,
      revenueAvg,
      periodKey,
      source: "naver",
    },
  };
}

export function parseNaverEarningsDisclosureActual(
  contentsHtml: string,
  opts: {
    expectedPeriodKey: string;
    consensus?: Pick<NaverOpConsensus, "operatingProfitAvg" | "revenueAvg"> | null;
  },
): NaverOpConsensus | null {
  return diagnoseNaverEarningsDisclosureActual(contentsHtml, opts).ok;
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
      if (!isConsolidatedEarningsDisclosureTitle(title)) {
        // Near-window earnings-ish titles that fail the 연결 gate — diagnosable.
        if (
          it.datetime &&
          /영업|실적|잠정/.test(title) &&
          Math.abs(
            new Date(it.datetime).getTime() - new Date(opts.earningsDateISO).getTime(),
          ) <= 36 * 60 * 60 * 1000
        ) {
          bumpSoftFail("title");
        }
        return null;
      }
      let score = 3;
      if (it.datetime) {
        const day = kstCalendarDay(new Date(it.datetime));
        if (day === earnDay) score += 2;
        else {
          const diff = Math.abs(
            new Date(it.datetime).getTime() - new Date(opts.earningsDateISO).getTime(),
          );
          if (diff <= 36 * 60 * 60 * 1000) score += 1;
          else {
            bumpSoftFail("window");
            return null; // too far from earnings window
          }
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
 * Soft-fail on network/parse/period/magnitude miss — with counters/logs when candidates exist.
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
    const rejectTallies: Partial<Record<DisclosureSoftFailReason, number>> = {};
    const noteReject = (reason: DisclosureSoftFailReason) => {
      bumpSoftFail(reason);
      rejectTallies[reason] = (rejectTallies[reason] ?? 0) + 1;
    };

    for (const cand of candidates.slice(0, 3)) {
      const id = cand.disclosureId;
      if (id == null) continue;
      const detail = await fetchDisclosureDetail(code, id);
      const html = detail?.disclosure?.contents;
      if (!html) {
        noteReject("no_contents");
        continue;
      }
      const diag = diagnoseNaverEarningsDisclosureActual(html, {
        expectedPeriodKey,
        consensus: opts.consensus,
      });
      if (diag.ok) return diag.ok;
      noteReject(diag.reject ?? "parse_null");
    }

    if (candidates.length > 0 || Object.keys(rejectTallies).length > 0) {
      console.warn(
        `[disclosure] soft-fail code=${code} candidates=${candidates.length} expectedPeriod=${expectedPeriodKey} rejects=${JSON.stringify(rejectTallies)} counts=${JSON.stringify(disclosureSoftFailCounts)}`,
      );
    }
    return null;
  } catch {
    return null;
  }
}
