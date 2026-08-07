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
  /**
   * 영업이익 시장 예상 (절대 통화 단위: KR 원 / US $).
   * Collector만 설정 — Naver Finance quarter consensus 등. 없으면 생략(창작 금지).
   */
  operatingProfitAvg?: number;
  operatingProfitLabel?: string;
  /** Attribution for UI footer (e.g. yahoo / naver / yahoo+naver) */
  sources?: Array<"yahoo" | "naver">;
  isEstimate?: boolean;
}

export interface EarningsActual {
  epsActual?: number;
  epsEstimate?: number;
  surprisePct?: number;
  /**
   * 주당 순이익(EPS) 시장 예상 대비 결과(Collector `resolveEarningsBeat`만 설정).
   * 이중 출처 확인 실패·thin Yahoo path면 생략 — LLM/UI가 채우지 않음.
   */
  beatLabel?: "서프라이즈" | "미스";
  reportedDateISO?: string;
  /**
   * 영업이익 실제 (절대 통화 단위). Collector만 — 네이버 금융 non-consensus 분기 열 등.
   * 컨센서스 열·뉴스 헤드라인 파싱으로 채우지 않음.
   */
  operatingProfitActual?: number;
  operatingProfitActualLabel?: string;
  /** 매출 실제 (절대 통화 단위) — OP와 같은 출처·분기일 때만 */
  revenueActual?: number;
  revenueActualLabel?: string;
}

/**
 * Collector가 실적 due/bridge에 붙인 헤드라인 Evidence.
 * 본문 덤프 금지 — title·publisher·시간·짧은 snippet만.
 * LLM은 이 필드가 있을 때만 가이던스·반응 1줄을 해석할 수 있음 (창작 금지).
 */
export interface EarningsContextNewsItem {
  title: string;
  publisher: string;
  publishedAt: string;
  /** title 기반 짧은 참고 문구 (원문 전문 아님) */
  snippet: string;
}

/**
 * Event detail scan-board fields (Collector / pipeline only).
 * Sparse optional strings — never invent results or buy/sell tone.
 * 의미·반응은 불릿 최대 2개(개행 구분)까지.
 */
export interface EventDetailSummary {
  /** 발표 전 시장 기대(숫자·컨센서스 사실) */
  expectation?: string;
  /** 이 일정의 의미 (템플릿/유형 · ≤2줄) */
  meaning?: string;
  /** 발표 후 결과 숫자 */
  result?: string;
  /** 시장 반응 — Evidence 뉴스 있을 때만; 없으면 「반응 근거 부족」 */
  reaction?: string;
  /** 이 결과가 의미하는 것 — Evidence 있을 때만 */
  implication?: string;
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
  /** 임박·직후 실적용 추가 뉴스 Evidence (Collector) */
  contextNews?: EarningsContextNewsItem[];
  /** 상세 스캔 보드용 짧은 필드 (파이프라인 부착) */
  detailSummary?: EventDetailSummary;
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
