import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cache } from "react";
import {
  assessOpsSlotHealth,
  type CatchUpState,
  type OpsSlotHealth,
} from "@/lib/pipeline/catchup";
import type { PipelineStatus } from "@/lib/pipeline/pipelineStatus";
import type { PublishedBundle } from "@/lib/pipeline/types";

export type OpsSnapshot = {
  published: {
    slot: PublishedBundle["slot"] | null;
    publishedAt: string | null;
    mode: PublishedBundle["mode"] | null;
    source: string | null;
    ageMinutes: number | null;
  };
  guard: {
    ok: boolean | null;
    blocked: boolean;
    summary: string;
    findings: Array<{ severity: string; code: string; message: string }>;
  };
  lastRun: PipelineStatus | null;
  /** Slot freshness vs today's schedule (stale / missed badge). */
  slotHealth: OpsSlotHealth;
  catchUp: CatchUpState | null;
};

function ageMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / 60_000);
}

function guardSummary(
  guard: PublishedBundle["guard"] | undefined,
): OpsSnapshot["guard"] {
  if (!guard) {
    return { ok: null, blocked: false, summary: "no guard data", findings: [] };
  }
  const blocks = guard.findings.filter((f) => f.severity === "block");
  const warns = guard.findings.filter((f) => f.severity === "warn");
  if (!guard.ok || blocks.length) {
    const codes = blocks.map((f) => f.code).slice(0, 3).join(", ") || "block";
    return {
      ok: false,
      blocked: true,
      summary: `blocked: ${codes}`,
      findings: guard.findings.slice(0, 8),
    };
  }
  if (warns.length) {
    return {
      ok: true,
      blocked: false,
      summary: `ok · ${warns.length} warn`,
      findings: warns.slice(0, 5),
    };
  }
  return { ok: true, blocked: false, summary: "ok", findings: [] };
}

async function loadOpsSnapshotUncached(): Promise<OpsSnapshot> {
  const cwd = process.cwd();
  let published: OpsSnapshot["published"] = {
    slot: null,
    publishedAt: null,
    mode: null,
    source: null,
    ageMinutes: null,
  };
  let guard: OpsSnapshot["guard"] = {
    ok: null,
    blocked: false,
    summary: "missing latest.json",
    findings: [],
  };
  let bundle: PublishedBundle | null = null;

  try {
    const raw = await readFile(join(cwd, "src/data/published/latest.json"), "utf8");
    bundle = JSON.parse(raw) as PublishedBundle;
    published = {
      slot: bundle.slot ?? null,
      publishedAt: bundle.publishedAt ?? null,
      mode: bundle.mode ?? null,
      source: bundle.source ?? null,
      ageMinutes: ageMinutes(bundle.publishedAt ?? null),
    };
    guard = guardSummary(bundle.guard);
  } catch {
    // keep defaults
  }

  let lastRun: PipelineStatus | null = null;
  try {
    const raw = await readFile(join(cwd, "src/data/published/status.json"), "utf8");
    lastRun = JSON.parse(raw) as PipelineStatus;
  } catch {
    lastRun = null;
  }

  let catchUp: CatchUpState | null = null;
  try {
    const raw = await readFile(join(cwd, "src/data/published/catchup.json"), "utf8");
    catchUp = JSON.parse(raw) as CatchUpState;
  } catch {
    catchUp = null;
  }

  const slotHealth = assessOpsSlotHealth({
    bundle,
    state: catchUp,
  });

  return { published, guard, lastRun, slotHealth, catchUp };
}

export const loadOpsSnapshot = cache(loadOpsSnapshotUncached);
