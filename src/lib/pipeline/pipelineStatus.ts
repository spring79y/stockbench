import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PipelineMode, PipelineSlot } from "@/lib/pipeline/types";

/** Committed ops signal — last pipeline attempt (success or fail). */
export type PipelineStatus = {
  updatedAt: string;
  slot: PipelineSlot | null;
  ok: boolean;
  mode?: PipelineMode;
  /** One-line last error when ok=false */
  error?: string;
  guardOk?: boolean;
  /** Short guard summary, e.g. "ok" or "blocked: code1, code2" */
  guardSummary?: string;
  /**
   * true = slot published with demoted continuity soft (or thin evidence).
   * false/omit on clean pass or keep-previous block.
   */
  degraded?: boolean;
  /** Target scopes that kept the previous view (hard-block / LLM fail). */
  keepPreviousScopes?: string[];
  /** Guard codes that forced keep-previous (last attempt). */
  keepPreviousCodes?: string[];
};

export function pipelineStatusPath(cwd: string): string {
  return join(cwd, "src/data/published/status.json");
}

export function writePipelineStatus(cwd: string, status: PipelineStatus): void {
  const path = pipelineStatusPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

export function readPipelineStatusSync(cwd: string): PipelineStatus | null {
  try {
    const path = pipelineStatusPath(cwd);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as PipelineStatus;
  } catch {
    return null;
  }
}
