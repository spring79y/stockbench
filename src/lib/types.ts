export type MarketRegion = "KR" | "US";

export type ChangeDirection = "up" | "down" | "flat";

export type MarketMood = "risk-on" | "caution" | "mixed" | "risk-off";

export type IndexChangeBasis =
  | "prior-close"
  | "intraday"
  | "premarket"
  | "postmarket"
  | "unknown";

export interface IndexQuote {
  id: string;
  name: string;
  shortName: string;
  region: MarketRegion;
  value: number;
  change: number;
  /** Yahoo 실시간 등락 — 장중이면 당일, 마감이면 직전 세션 */
  changePercent: number;
  status: string;
  /** Yahoo marketState 원문 */
  marketState?: string;
  /** 직전 완료 정규장 세션 등락(전일 마감 요약용). 없으면 null */
  priorSessionChangePercent?: number | null;
  changeBasis?: IndexChangeBasis;
}

export interface MacroChip {
  id: string;
  name: string;
  value: string;
  changeLabel: string;
  direction: ChangeDirection;
}

export type MarketEventKind = "macro" | "earnings";

export interface EarningsConsensus {
  epsAvg?: number;
  epsLow?: number;
  epsHigh?: number;
  epsLabel?: string;
  revenueAvg?: number;
  revenueLabel?: string;
  isEstimate?: boolean;
}

export interface EarningsActual {
  epsActual?: number;
  epsEstimate?: number;
  surprisePct?: number;
  /**
   * EPS 컨센서스 대비 결과(Collector `resolveEarningsBeat`만 설정).
   * 이중 출처 확인 실패·thin Yahoo path면 생략 — LLM/UI가 채우지 않음.
   */
  beatLabel?: "서프라이즈" | "미스";
  reportedDateISO?: string;
}

export interface MarketEvent {
  id: string;
  dateLabel: string;
  region: MarketRegion | "GLOBAL";
  title: string;
  level: "high" | "medium" | "low";
  oneLiner: string;
  kind?: MarketEventKind;
  symbol?: string;
  megaCapId?: string;
  bridgeId?: string;
  dateISO?: string;
  sector?: "memory" | "ai" | "auto";
  bridgeOf?: string;
  relatedMegaCapIds?: string[];
  consensus?: EarningsConsensus;
  actual?: EarningsActual;
}

export interface DailyBriefing {
  asOfLabel: string;
  mood: MarketMood;
  moodLabel: string;
  temperature: string;
  headline: string;
  bullets: string[];
  evidenceIds: string[];
}

export interface Scenario {
  id: string;
  label: string;
  title: string;
  summary: string;
  implication: string;
}

export interface CheckItem {
  id: string;
  text: string;
  why: string;
}
