import {
  DECISION_SYSTEM_PROMPT,
  buildDecisionUserPrompt,
  isDecisionDraft,
} from "@/lib/pipeline/decision";
import { completeJson } from "@/lib/pipeline/llm";
import { seedDecision } from "@/lib/pipeline/seed";
import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  MarketScope,
} from "@/lib/pipeline/types";
import type { AgentRunResult } from "@/lib/pipeline/runBriefingAgent";

export async function runDecisionAgent(
  snapshot: CollectorSnapshot,
  briefing: BriefingDraft,
  scope: MarketScope,
  repairHints?: string[],
): Promise<AgentRunResult<DecisionDraft>> {
  try {
    const json = await completeJson(
      DECISION_SYSTEM_PROMPT,
      buildDecisionUserPrompt(snapshot, briefing, scope, repairHints),
    );
    if (!isDecisionDraft(json)) {
      throw new Error("Decision JSON shape invalid");
    }
    if (json.scenarios.length !== 2) {
      throw new Error("Decision must include exactly 2 scenarios");
    }
    if (json.checkItems.length < 3) {
      throw new Error("Decision checklist too short");
    }
    json.checkItems = json.checkItems.slice(0, 5);
    return { data: json, source: "llm" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: seedDecision(snapshot, scope),
      source: "seed",
      error: message,
    };
  }
}
