import { toKrItemCode } from "@/lib/market/fetchInvestorFlow";
import type { MarketRegion } from "@/lib/types";

/**
 * Naver Finance quarterly consensus — operating profit (영업이익) for KR.
 * Source: m.stock.naver.com `/api/stock/{code}/finance/quarter`
 * Units: KR columns are 억원 → convert to 원 (×1e8). Never invent; omit on parse/match miss.
 * Reported actuals: only `isConsensus≠Y` columns here. When still consensus-only after print,
 * Collector falls back to 공정공시 (`fetchNaverEarningsDisclosure.ts`).
 */

export type NaverOpConsensus = {
  /** Absolute currency units (원 for KR, $ for US if ever present) */
  operatingProfitAvg: number;
  /** Same-period 매출액 in absolute units (when parseable) */
  revenueAvg?: number;
  /** Fiscal period key YYYYMM */
  periodKey: string;
  source: "naver";
};

type NaverColumn = { value?: string; cx?: string | null };
type NaverRow = { title?: string; columns?: Record<string, NaverColumn> };
type NaverTitle = { isConsensus?: string; title?: string; key?: string };

type NaverFinanceQuarter = {
  unit?: string;
  financeInfo?: {
    trTitleList?: NaverTitle[];
    rowList?: NaverRow[];
  };
  trTitleList?: NaverTitle[];
  rowList?: NaverRow[];
};

const KR_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
  Accept: "application/json",
} as const;

/** 억원 → 원 */
const KRW_EOK_TO_WON = 100_000_000;
/** USD millions → dollars */
const USD_M_TO_USD = 1_000_000;

function parseSignedAmount(raw: string | undefined, cx?: string | null): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/,/g, "").replace(/^\+/, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const signed = cx === "minus" || n < 0 ? -Math.abs(n) : n;
  return signed;
}

/** Normalize Naver period keys: `202606` | `2026.06.` | `2026.06.27` → `202606` */
export function normalizeNaverPeriodKey(key: string): string | null {
  const compact = key.replace(/\./g, "");
  const m = compact.match(/^(\d{6})/);
  return m ? m[1] : null;
}

/**
 * Fiscal quarter-end YYYYMM implied by an earnings announcement date.
 * Back up ~20d for post-close announce lag, then snap to Mar/Jun/Sep/Dec end.
 */
export function fiscalQuarterEndKeyFromEarningsDate(dateISO: string): string | null {
  const t = new Date(dateISO).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - 20 * 24 * 60 * 60 * 1000);
  let y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0–11
  const ends = [2, 5, 8, 11];
  let qEnd = [...ends].reverse().find((e) => e <= m);
  if (qEnd == null) {
    y -= 1;
    qEnd = 11;
  }
  return `${y}${String(qEnd + 1).padStart(2, "0")}`;
}

function scaleForUnit(unit: string | undefined, region: MarketRegion): number | null {
  if (region === "KR") {
    // Domestic API omits unit; columns match 억원 historical prints (e.g. 삼성 79조 ≈ 791,405).
    return KRW_EOK_TO_WON;
  }
  if (region === "US") {
    if (unit && /USD.*백만|USD\(백만\)/i.test(unit)) return USD_M_TO_USD;
    return null;
  }
  return null;
}

function pickOpRow(rows: NaverRow[]): NaverRow | undefined {
  // Prefer explicit 영업이익 — do not fall back to EBIT/EBITDA (not the same fact).
  return rows.find((r) => r.title === "영업이익");
}

function pickRevenueRow(rows: NaverRow[]): NaverRow | undefined {
  return rows.find((r) => r.title === "매출액");
}

function readOpRevenueForKey(
  payload: NaverFinanceQuarter,
  opts: { periodKey: string; columnKey: string; region: MarketRegion },
): NaverOpConsensus | null {
  const info = payload.financeInfo ?? payload;
  const rows = info.rowList ?? [];
  const scale = scaleForUnit(payload.unit, opts.region);
  if (scale == null) return null;

  const opRow = pickOpRow(rows);
  if (!opRow?.columns) return null;

  const opRaw = parseSignedAmount(
    opRow.columns[opts.columnKey]?.value,
    opRow.columns[opts.columnKey]?.cx,
  );
  if (opRaw == null) return null;

  const revRow = pickRevenueRow(rows);
  const revRaw = revRow?.columns
    ? parseSignedAmount(
        revRow.columns[opts.columnKey]?.value,
        revRow.columns[opts.columnKey]?.cx,
      )
    : null;

  return {
    operatingProfitAvg: opRaw * scale,
    revenueAvg: revRaw != null ? revRaw * scale : undefined,
    periodKey: opts.periodKey,
    source: "naver",
  };
}

export function parseNaverOpConsensus(
  payload: NaverFinanceQuarter,
  opts: { expectedPeriodKey: string; region: MarketRegion },
): NaverOpConsensus | null {
  const info = payload.financeInfo ?? payload;
  const titles = info.trTitleList ?? [];
  if (titles.length === 0) return null;

  const consensusCols = titles.filter((t) => t.isConsensus === "Y" && t.key);
  const matched =
    consensusCols.find((t) => normalizeNaverPeriodKey(t.key!) === opts.expectedPeriodKey) ??
    null;
  if (!matched?.key) return null;

  const periodKey = normalizeNaverPeriodKey(matched.key);
  if (!periodKey) return null;

  return readOpRevenueForKey(payload, {
    periodKey,
    columnKey: matched.key,
    region: opts.region,
  });
}

/**
 * Reported (non-consensus) OP+매출 for the fiscal period.
 * Only when Naver has flipped the quarter off `isConsensus=Y` — never treat consensus as actual.
 */
export function parseNaverOpActual(
  payload: NaverFinanceQuarter,
  opts: { expectedPeriodKey: string; region: MarketRegion },
): NaverOpConsensus | null {
  const info = payload.financeInfo ?? payload;
  const titles = info.trTitleList ?? [];
  if (titles.length === 0) return null;

  const reportedCols = titles.filter((t) => t.isConsensus !== "Y" && t.key);
  const matched =
    reportedCols.find((t) => normalizeNaverPeriodKey(t.key!) === opts.expectedPeriodKey) ??
    null;
  if (!matched?.key) return null;

  const periodKey = normalizeNaverPeriodKey(matched.key);
  if (!periodKey) return null;

  return readOpRevenueForKey(payload, {
    periodKey,
    columnKey: matched.key,
    region: opts.region,
  });
}

function naverKrUrl(code: string): string {
  return `https://m.stock.naver.com/api/stock/${code}/finance/quarter`;
}

async function fetchNaverFinanceQuarter(
  symbol: string,
  region: MarketRegion,
): Promise<NaverFinanceQuarter | null> {
  if (region !== "KR") return null;
  const code = toKrItemCode(symbol);
  if (!code) return null;
  try {
    const res = await fetch(naverKrUrl(code), {
      headers: {
        ...KR_HEADERS,
        Referer: `https://m.stock.naver.com/domestic/stock/${code}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as NaverFinanceQuarter;
  } catch {
    return null;
  }
}

/**
 * Fetch KR operating-profit consensus for the fiscal quarter implied by `earningsDateISO`.
 * Soft-fail: network/parse/quarter mismatch → null (omit OP).
 */
export async function fetchNaverOpConsensus(opts: {
  symbol: string;
  region: MarketRegion;
  earningsDateISO: string;
}): Promise<NaverOpConsensus | null> {
  const expectedPeriodKey = fiscalQuarterEndKeyFromEarningsDate(opts.earningsDateISO);
  if (!expectedPeriodKey) return null;

  const payload = await fetchNaverFinanceQuarter(opts.symbol, opts.region);
  if (!payload) return null;
  return parseNaverOpConsensus(payload, {
    expectedPeriodKey,
    region: opts.region,
  });
}

/**
 * Single Naver finance/quarter fetch → consensus and/or reported OP for the period.
 * Prefer this in Collector to avoid duplicate network calls.
 * When the quarter column is still consensus-only, Collector may also call
 * `fetchNaverDisclosureOpActual` (공정공시) as a secondary source.
 */
export async function fetchNaverOpForEarnings(opts: {
  symbol: string;
  region: MarketRegion;
  earningsDateISO: string;
}): Promise<{ consensus: NaverOpConsensus | null; actual: NaverOpConsensus | null }> {
  const empty = { consensus: null, actual: null };
  const expectedPeriodKey = fiscalQuarterEndKeyFromEarningsDate(opts.earningsDateISO);
  if (!expectedPeriodKey) return empty;

  const payload = await fetchNaverFinanceQuarter(opts.symbol, opts.region);
  if (!payload) return empty;
  return {
    consensus: parseNaverOpConsensus(payload, {
      expectedPeriodKey,
      region: opts.region,
    }),
    actual: parseNaverOpActual(payload, {
      expectedPeriodKey,
      region: opts.region,
    }),
  };
}
