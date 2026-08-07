import type { PipelineSlot, PublishedBundle } from "@/lib/pipeline/types";
import {
  ALL_PIPELINE_SLOTS,
  SLOT_SCHEDULE,
  seoulDateParts,
  slotTargetMins,
} from "@/lib/pipeline/schedule";

/** Minutes after expected KST slot time before a slot is stale enough to catch up once. */
export const CATCHUP_STALE_THRESHOLD_MINS = 45;

/**
 * Stop chasing a slot this many minutes after its expected time.
 * Keeps catch-up tied to the probe window (≈+45/+65m) and avoids
 * re-firing dawn slots when a later probe runs in the afternoon.
 */
export const CATCHUP_MAX_LATENESS_MINS = 180;

/**
 * workflow_dispatch / workflow_call inputs that match Publish briefing bundles.
 * morning/noon mirror the normal cron pairing.
 */
export type CatchUpTarget = "morning" | "noon" | "kr-post" | "us-pre" | "us-mid";

export type CatchUpState = {
  /** Seoul calendar day (YYYY-MM-DD) the markers apply to */
  date: string;
  /** Targets already dispatched today (ISO timestamp) — at most once per day */
  dispatched: Partial<Record<CatchUpTarget, string>>;
};

export type CatchUpDecision = {
  target: CatchUpTarget | null;
  /** Human-readable reason for logs */
  reason: string;
  /** Slots that are past the stale threshold and lack today's publish */
  staleSlots: PipelineSlot[];
};

const TARGET_SLOTS: Record<CatchUpTarget, PipelineSlot[]> = {
  morning: ["us-post", "kr-pre"],
  noon: ["us-noon", "kr-mid"],
  "kr-post": ["kr-post"],
  "us-pre": ["us-pre"],
  "us-mid": ["us-mid"],
};

/** Slot-time order for picking a single catch-up target per tick */
const TARGET_ORDER: CatchUpTarget[] = [
  "us-mid",
  "morning",
  "noon",
  "kr-post",
  "us-pre",
];

export function slotListForTarget(target: CatchUpTarget): PipelineSlot[] {
  return TARGET_SLOTS[target];
}

export function dispatchInputForTarget(target: CatchUpTarget): string {
  return target;
}

type PublishEvidence = { slot: PipelineSlot; at: Date };

function isPipelineSlot(value: string): value is PipelineSlot {
  return (ALL_PIPELINE_SLOTS as string[]).includes(value);
}

/** Collect slot + publishedAt from bundle root and per-view stamps. */
export function collectPublishEvidence(
  bundle: PublishedBundle | null | undefined,
): PublishEvidence[] {
  if (!bundle) return [];
  const out: PublishEvidence[] = [];
  const push = (slot: unknown, at: unknown) => {
    if (typeof slot !== "string" || !isPipelineSlot(slot)) return;
    if (typeof at !== "string") return;
    const t = Date.parse(at);
    if (Number.isNaN(t)) return;
    out.push({ slot, at: new Date(t) });
  };

  push(bundle.slot, bundle.publishedAt);
  for (const view of Object.values(bundle.views ?? {})) {
    if (!view) continue;
    push(view.slot, view.publishedAt);
  }
  return out;
}

/** True if this slot has a publish stamp on the given Seoul calendar day. */
export function slotPublishedOnDay(
  slot: PipelineSlot,
  ymd: string,
  evidence: PublishEvidence[],
): boolean {
  return evidence.some((e) => {
    if (e.slot !== slot) return false;
    return seoulDateParts(e.at).ymd === ymd;
  });
}

/**
 * Minutes elapsed since today's expected KST slot time.
 * Negative if the slot time is still in the future today.
 */
export function minsPastSlot(slot: PipelineSlot, now = new Date()): number {
  const { mins } = seoulDateParts(now);
  return mins - slotTargetMins(slot);
}

export function isSlotStale(
  slot: PipelineSlot,
  now = new Date(),
  thresholdMins = CATCHUP_STALE_THRESHOLD_MINS,
  maxLatenessMins = CATCHUP_MAX_LATENESS_MINS,
): boolean {
  const past = minsPastSlot(slot, now);
  return past >= thresholdMins && past <= maxLatenessMins;
}

/**
 * Pick at most one catch-up target for this tick.
 * Skips weekends, already-dispatched targets, and slots with today's publish.
 */
export function decideCatchUp(options: {
  now?: Date;
  bundle?: PublishedBundle | null;
  state?: CatchUpState | null;
  thresholdMins?: number;
  maxLatenessMins?: number;
}): CatchUpDecision {
  const now = options.now ?? new Date();
  const threshold = options.thresholdMins ?? CATCHUP_STALE_THRESHOLD_MINS;
  const maxLateness = options.maxLatenessMins ?? CATCHUP_MAX_LATENESS_MINS;
  const { ymd, weekend } = seoulDateParts(now);

  if (weekend) {
    return {
      target: null,
      reason: `weekend ${ymd} — skip`,
      staleSlots: [],
    };
  }

  const evidence = collectPublishEvidence(options.bundle);
  const state =
    options.state?.date === ymd
      ? options.state
      : ({ date: ymd, dispatched: {} } satisfies CatchUpState);

  const staleSlots: PipelineSlot[] = [];
  for (const slot of ALL_PIPELINE_SLOTS) {
    if (!isSlotStale(slot, now, threshold, maxLateness)) continue;
    if (slotPublishedOnDay(slot, ymd, evidence)) continue;
    staleSlots.push(slot);
  }

  if (staleSlots.length === 0) {
    return {
      target: null,
      reason: `no stale slots in ${threshold}–${maxLateness}m window · ${ymd}`,
      staleSlots: [],
    };
  }

  for (const target of TARGET_ORDER) {
    const slots = TARGET_SLOTS[target];
    const needs = slots.some((s) => staleSlots.includes(s));
    if (!needs) continue;
    if (state.dispatched[target]) {
      continue;
    }
    const labels = slots
      .filter((s) => staleSlots.includes(s))
      .map((s) => {
        const sch = SLOT_SCHEDULE[s];
        return `${s}(${String(sch.hour).padStart(2, "0")}:${String(sch.minute).padStart(2, "0")}+${threshold}m)`;
      })
      .join(", ");
    return {
      target,
      reason: `stale: ${labels}`,
      staleSlots,
    };
  }

  return {
    target: null,
    reason: `stale slots already catch-up-dispatched today: ${staleSlots.join(", ")}`,
    staleSlots,
  };
}

export function markCatchUpDispatched(
  state: CatchUpState | null | undefined,
  target: CatchUpTarget,
  now = new Date(),
): CatchUpState {
  const { ymd } = seoulDateParts(now);
  const base: CatchUpState =
    state?.date === ymd ? { date: ymd, dispatched: { ...state.dispatched } } : { date: ymd, dispatched: {} };
  base.dispatched[target] = now.toISOString();
  return base;
}
