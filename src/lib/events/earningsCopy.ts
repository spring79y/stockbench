/**
 * Plain-language earnings presentation (UI / oneLiner / briefing).
 * Collector numeric values stay unchanged — labels and fact phrasing only.
 * Revenue/EPS/OP display units: `@/lib/market/earningsFormat` (Event UI · Evidence pack).
 */

export {
  formatEps,
  formatRevenue,
  epsDisplayLabel,
  revenueDisplayLabel,
  operatingProfitDisplayLabel,
} from "@/lib/market/earningsFormat";

/** Primary scan: company scale */
export const LABEL_REVENUE_EXPECTED = "시장 예상 매출";

/** Primary when available: same company-scale unit as revenue */
export const LABEL_OP_EXPECTED = "시장 예상 영업이익";

/** Secondary: always keep 주당; EPS as gloss (folded when OP present) */
export const LABEL_EPS_EXPECTED = "주당 순이익(EPS) 시장 예상";

/** 「컨센서스」 plain gloss; jargon secondary when needed */
export const GLOSS_CONSENSUS = "시장·애널리스트 평균 예상";

export const NOTE_CONSENSUS_UI =
  "시장·애널리스트 평균 예상(컨센서스) · Yahoo 참고 · 발표 전 추정치 · 매매 신호 아님";

export const NOTE_CONSENSUS_UI_WITH_OP =
  "시장·애널리스트 평균 예상(컨센서스) · 매출·영업이익 네이버 금융 참고 · EPS Yahoo 참고 · 발표 전 추정치 · 매매 신호 아님";

export const NOTE_CONSENSUS_UI_POST =
  "시장·애널리스트 평균 예상(컨센서스) · Yahoo 참고 · 발표 후 참고용 · 매매 신호 아님";

export const NOTE_CONSENSUS_UI_WITH_OP_POST =
  "시장·애널리스트 평균 예상(컨센서스) · 매출·영업이익 네이버 금융 참고 · EPS Yahoo 참고 · 발표 후 참고용 · 매매 신호 아님";

export function consensusNoteFor(opts: {
  operatingProfitLabel?: string;
  sources?: Array<"yahoo" | "naver">;
  /** When true, drop 「발표 전」 wording so post-print UI is not misleading. */
  postReport?: boolean;
}): string {
  const withOp = Boolean(opts.operatingProfitLabel || opts.sources?.includes("naver"));
  if (opts.postReport) {
    return withOp ? NOTE_CONSENSUS_UI_WITH_OP_POST : NOTE_CONSENSUS_UI_POST;
  }
  return withOp ? NOTE_CONSENSUS_UI_WITH_OP : NOTE_CONSENSUS_UI;
}

/** Minimal EventList / Collector oneLiner fact prefix (not a friendly essay). */
export function epsFactPhrase(actualFormatted: string, estimateFormatted: string): string {
  return `주당순이익(EPS) ${actualFormatted} vs 예상 ${estimateFormatted}`;
}

/** Pre-report oneLiner when OP present — company-scale facts only. */
export function revenueOpFactPhrase(revenueLabel: string, opLabel: string): string {
  return `시장 예상 매출 ${revenueLabel} · 영업이익 ${opLabel}`;
}

/** Post-report oneLiner from structured company-scale actuals (Collector only). */
export function revenueOpActualFactPhrase(
  opts: { revenueLabel?: string; opLabel?: string },
): string | null {
  if (opts.revenueLabel && opts.opLabel) {
    return `발표됨 · 매출 ${opts.revenueLabel} · 영업이익 ${opts.opLabel}`;
  }
  if (opts.opLabel) return `발표됨 · 영업이익 ${opts.opLabel}`;
  if (opts.revenueLabel) return `발표됨 · 매출 ${opts.revenueLabel}`;
  return null;
}
