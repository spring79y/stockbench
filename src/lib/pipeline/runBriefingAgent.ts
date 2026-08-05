import {
  BRIEFING_SYSTEM_PROMPT,
  REFRESH_BRIEFING_SYSTEM_PROMPT,
  buildBriefingUserPrompt,
  isBriefingDraft,
} from "@/lib/pipeline/briefing";
import { completeJson } from "@/lib/pipeline/llm";
import { seedBriefing } from "@/lib/pipeline/seed";
import type {
  BriefingDraft,
  CollectorSnapshot,
  MarketScope,
  PipelineMode,
} from "@/lib/pipeline/types";

export type AgentRunResult<T> = {
  data: T;
  source: "llm" | "seed";
  error?: string;
};

export async function runBriefingAgent(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  repairHints?: string[],
  mode: PipelineMode = "full",
): Promise<AgentRunResult<BriefingDraft>> {
  try {
    const system =
      mode === "refresh" ? REFRESH_BRIEFING_SYSTEM_PROMPT : BRIEFING_SYSTEM_PROMPT;
    const json = await completeJson(
      system,
      buildBriefingUserPrompt(snapshot, scope, repairHints, mode),
    );
    if (!isBriefingDraft(json)) {
      throw new Error("Briefing JSON shape invalid");
    }
    if (json.bullets.length < 3) {
      throw new Error("Briefing bullets too few");
    }
    json.bullets = json.bullets.slice(0, 5);
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
