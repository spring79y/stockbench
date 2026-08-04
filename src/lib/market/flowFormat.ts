/** 수급 금액 표시 (단위: 억원) — 클라이언트/서버 공용 */

export function formatFlowAmount(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toFixed(1)}조`;
  }
  return `${sign}${abs.toLocaleString("ko-KR")}억`;
}

/** 종목 순매매량 표시 (단위: 주) */
export function formatFlowShares(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}백만주`;
  }
  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toFixed(1)}만주`;
  }
  return `${sign}${abs.toLocaleString("ko-KR")}주`;
}

export function formatDayLine(
  market: string,
  day: { dateLabel: string; personal: number; foreign: number; institution: number },
): string {
  return `${market} ${day.dateLabel} · 외국인 ${formatFlowAmount(day.foreign)} · 기관 ${formatFlowAmount(day.institution)} · 개인 ${formatFlowAmount(day.personal)}`;
}
