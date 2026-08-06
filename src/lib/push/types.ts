import type { PipelineSlot } from "@/lib/pipeline/types";

export type PushMarket = "kr" | "us";

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

/** 시장별 선택 가능한 슬롯 */
export const PUSH_SLOTS_BY_MARKET: Record<PushMarket, PipelineSlot[]> = {
  kr: ["kr-pre", "kr-mid", "kr-post"],
  us: ["us-pre", "us-mid", "us-noon", "us-post"],
};

export const PUSH_SLOT_SHORT_LABEL: Partial<Record<PipelineSlot, string>> = {
  "kr-pre": "장전",
  "kr-mid": "장중",
  "kr-post": "장후",
  "us-pre": "장전",
  "us-mid": "장중",
  "us-noon": "점검",
  "us-post": "장후",
};

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: PushSubscriptionKeys;
  /** 구독한 시장 — 해당 시장 슬롯 발행 시에만 알림 */
  markets: PushMarket[];
  /**
   * 시장별 알림 슬롯. 없으면 해당 시장 전체 슬롯 ON.
   * 빈 배열이면 그 시장 알림 없음(시장은 markets에 남을 수 있음).
   */
  slots?: Partial<Record<PushMarket, PipelineSlot[]>>;
  createdAt: string;
  updatedAt: string;
};

export function defaultSlotsForMarket(market: PushMarket): PipelineSlot[] {
  return [...PUSH_SLOTS_BY_MARKET[market]];
}

export function slotsForMarket(
  record: PushSubscriptionRecord,
  market: PushMarket,
): PipelineSlot[] {
  if (!record.markets.includes(market)) return [];
  const chosen = record.slots?.[market];
  if (chosen == null) return defaultSlotsForMarket(market);
  return chosen.filter((s) => PUSH_SLOTS_BY_MARKET[market].includes(s));
}

export function recordWantsSlot(
  record: PushSubscriptionRecord,
  market: PushMarket,
  slot: PipelineSlot,
): boolean {
  return slotsForMarket(record, market).includes(slot);
}

export function marketsForSlot(slot: PipelineSlot): PushMarket[] {
  return slot.startsWith("kr-") ? ["kr"] : ["us"];
}

export function landingPathForMarket(market: PushMarket): string {
  return market === "kr" ? "/?view=kr#briefing" : "/?view=us#briefing";
}
