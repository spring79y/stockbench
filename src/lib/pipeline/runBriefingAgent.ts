import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingUserPrompt,
  isBriefingDraft,
} from "@/lib/pipeline/briefing";
import { completeJson } from "@/lib/pipeline/llm";
import { seedBriefing } from "@/lib/pipeline/seed";
import type { BriefingDraft, CollectorSnapshot, MarketScope } from "@/lib/pipeline/types";

export type AgentRunResult<T> = {
  data: T;
  source: "llm" | "seed";
  error?: string;
};

export async function runBriefingAgent(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  repairHints?: string[],
): Promise<AgentRunResult<BriefingDraft>> {
  try {
    const json = await completeJson(
      BRIEFING_SYSTEM_PROMPT,
      buildBriefingUserPrompt(snapshot, scope, repairHints),
    );
    if (!isBriefingDraft(json)) {
      throw new Error("Briefing JSON shape invalid");
    }
    if (json.bullets.length < 2) {
      throw new Error("Briefing bullets too few");
    }
    return { data: json, source: "llm" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: seedBriefing(snapshot, scope),
      source: "seed",
      error: message,
    };
  }
}
