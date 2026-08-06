import type {
  CheckItem,
  DailyBriefing,
  IndexQuote,
  MacroChip,
  MarketEvent,
  Scenario,
} from "@/lib/types";
import type { MarketScope } from "@/lib/market/scope";
import type { EvidencePack } from "@/lib/pipeline/evidencePack";

export type { MarketScope };
export type PipelineSlot =
  | "kr-pre"
  | "kr-post"
  | "kr-mid"
  | "us-pre"
  | "us-post"
  | "us-mid"
  /** 12:30 KST — 미국 탭 낮 공백 메움 (미 정규장 중 아님) */
  | "us-noon";

/** full = Briefing+Decision, refresh = Briefing만(시나리오·점검 유지) */
export type PipelineMode = "full" | "refresh";

export type CollectorSnapshot = {
  collectedAt: string;
  slot: PipelineSlot;
  indexes: IndexQuote[];
  macros: MacroChip[];
  temperature: string;
  mood: DailyBriefing["mood"];
  moodLabel: string;
  asOfLabel: string;
  /** @deprecated evidence.pack 우선 — 하위호환 */
  retailScan?: {
    ks200?: { label: string; value: number; changePercent: number };
    topCapsSummary?: string;
    signalSummary?: string;
    flowSummary?: string;
  };
  /** LLM 입력용 구조화 증거 팩 */
  evidence?: EvidencePack;
  events?: MarketEvent[];
};

export type BriefingDraft = {
  headline: string;
  bullets: string[];
  evidenceIds: string[];
  eventOneLiners?: Array<Pick<MarketEvent, "id" | "oneLiner">>;
};

export type DecisionDraft = {
  scenarios: Scenario[];
  checkItems: CheckItem[];
};

export type GuardFinding = {
  severity: "block" | "warn";
  code: string;
  message: string;
};

export type GuardReport = {
  ok: boolean;
  findings: GuardFinding[];
};

export type EditorialView = {
  briefing: Pick<DailyBriefing, "headline" | "bullets" | "evidenceIds">;
  scenarios: Scenario[];
  checkItems: CheckItem[];
  /** 이 탭 브리핑이 마지막으로 갱신된 시각 */
  publishedAt?: string;
  /** 이 탭을 갱신한 슬롯 */
  slot?: PipelineSlot;
  /** full | refresh — refresh면 시나리오·점검은 직전 풀 발행 유지 */
  mode?: PipelineMode;
  /** 직전 발행 대비 짧은 변화 (최대 3) */
  changeLines?: string[];
};

export type PublishedBundle = {
  version: 2;
  slot: PipelineSlot;
  publishedAt: string;
  source: "pipeline";
  /** 이번 발행이 full인지 장중 refresh인지 */
  mode?: PipelineMode;
  market: {
    temperature: string;
    mood: DailyBriefing["mood"];
    moodLabel: string;
    asOfLabel: string;
  };
  /** 탭별 동일 흐름, 초점만 다른 발행분 */
  views: Record<MarketScope, EditorialView>;
  events: MarketEvent[];
  guard: GuardReport;
};
