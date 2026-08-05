import webpush from "web-push";
import type { PipelineMode, PipelineSlot, PublishedBundle } from "@/lib/pipeline/types";
import { SLOT_SCHEDULE } from "@/lib/pipeline/schedule";
import {
  landingPathForMarket,
  marketsForSlot,
  type PushMarket,
  type PushSubscriptionRecord,
} from "@/lib/push/types";

export function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function configureWebPush(): boolean {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

export type SlotPushPayload = {
  title: string;
  body: string;
  url: string;
  slot: PipelineSlot;
  market: PushMarket;
};

export function buildSlotPushPayload(
  bundle: PublishedBundle,
  slot: PipelineSlot,
  market: PushMarket,
): SlotPushPayload | null {
  const view = bundle.views[market];
  if (!view?.briefing?.headline) return null;

  const label = SLOT_SCHEDULE[slot]?.label ?? slot;
  const mode: PipelineMode = view.mode ?? bundle.mode ?? "full";
  const headline = view.briefing.headline.trim();
  const change = (view.changeLines ?? []).slice(0, 2).join(" · ");

  const bodyParts = [
    mode === "refresh" ? "헤드라인만 갱신" : null,
    headline.length > 72 ? `${headline.slice(0, 72)}…` : headline,
    change || null,
  ].filter(Boolean);

  return {
    title: `${label} 브리핑`,
    body: bodyParts.join("\n"),
    url: landingPathForMarket(market),
    slot,
    market,
  };
}

export async function sendSlotPushToSubscribers(input: {
  slot: PipelineSlot;
  bundle: PublishedBundle;
  subscriptions: PushSubscriptionRecord[];
}): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!configureWebPush()) {
    return { sent: 0, failed: 0, skipped: input.subscriptions.length };
  }

  const markets = marketsForSlot(input.slot);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const market of markets) {
    const payload = buildSlotPushPayload(input.bundle, input.slot, market);
    if (!payload) {
      skipped += 1;
      continue;
    }

    const targets = input.subscriptions.filter((s) => s.markets.includes(market));
    for (const sub of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const status = (error as { statusCode?: number })?.statusCode;
        console.warn(`[push] send failed status=${status ?? "?"} endpoint=${sub.endpoint.slice(0, 48)}…`);
      }
    }
  }

  return { sent, failed, skipped };
}
