import type { PipelineSlot } from "@/lib/pipeline/types";

export type PushMarket = "kr" | "us";

export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: PushSubscriptionKeys;
  /** 구독한 시장 — 해당 시장 슬롯 발행 시에만 알림 */
  markets: PushMarket[];
  createdAt: string;
  updatedAt: string;
};

export function marketsForSlot(slot: PipelineSlot): PushMarket[] {
  return slot.startsWith("kr-") ? ["kr"] : ["us"];
}

export function landingPathForMarket(market: PushMarket): string {
  return market === "kr" ? "/?view=kr#briefing" : "/?view=us#briefing";
}
