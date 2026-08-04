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
export type PipelineSlot = "kr-pre" | "kr-post" | "us-pre" | "us-post";

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
};

export type PublishedBundle = {
  version: 2;
  slot: PipelineSlot;
  publishedAt: string;
  source: "pipeline";
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
