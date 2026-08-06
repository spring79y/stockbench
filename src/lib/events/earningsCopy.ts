/**
 * Plain-language earnings presentation (UI / oneLiner / briefing).
 * Collector numeric values stay unchanged — labels and fact phrasing only.
 */

/** Primary scan: company scale */
export const LABEL_REVENUE_EXPECTED = "시장 예상 매출";

/** Secondary: always keep 주당; EPS as gloss */
export const LABEL_EPS_EXPECTED = "주당 순이익(EPS) 시장 예상";

/** 「컨센서스」 plain gloss; jargon secondary when needed */
export const GLOSS_CONSENSUS = "시장·애널리스트 평균 예상";

export const NOTE_CONSENSUS_UI =
  "시장·애널리스트 평균 예상(컨센서스) · Yahoo 참고 · 발표 전 추정치 · 매매 신호 아님";

/** Minimal EventList / Collector oneLiner fact prefix (not a friendly essay). */
export function epsFactPhrase(actualFormatted: string, estimateFormatted: string): string {
  return `주당순이익(EPS) ${actualFormatted} vs 예상 ${estimateFormatted}`;
}
