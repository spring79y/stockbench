/**
 * 슬롯 푸시 발송. CI에서는 latest.json 커밋·프로덕션 반영 대기 뒤에 호출한다.
 * 실행: npm run push:slot -- kr-post
 * 환경: VAPID_* + UPSTASH_REDIS_REST_*
 * 미설정·구독 0·발송 실패는 경고만 (파이프라인 성공 유지)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PIPELINE_SLOTS, isPushQuietHours } from "../src/lib/pipeline/schedule";
import type { PipelineSlot, PublishedBundle } from "../src/lib/pipeline/types";
import { listPushSubscriptions, pushStoreConfigured } from "../src/lib/push/store";
import { sendSlotPushToSubscribers, vapidConfigured } from "../src/lib/push/send";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = join(root, "src/data/published/latest.json");

async function main() {
  const slot = process.argv[2] as PipelineSlot;
  if (!ALL_PIPELINE_SLOTS.includes(slot)) {
    console.error(`[push] unknown slot: ${slot}`);
    process.exit(0);
  }

  if (isPushQuietHours()) {
    console.warn("[push] skipped — quiet hours (KST 00:00–07:00)");
    process.exit(0);
  }

  if (!vapidConfigured() || !pushStoreConfigured()) {
    console.warn("[push] skipped — VAPID or Upstash Redis env missing");
    process.exit(0);
  }

  if (!existsSync(latestPath)) {
    console.warn("[push] skipped — latest.json missing");
    process.exit(0);
  }

  const bundle = JSON.parse(readFileSync(latestPath, "utf8")) as PublishedBundle;
  if (bundle.guard?.ok === false) {
    console.warn("[push] skipped — guard blocked bundle");
    process.exit(0);
  }

  const subscriptions = await listPushSubscriptions();
  if (subscriptions.length === 0) {
    console.warn("[push] skipped — no subscribers");
    process.exit(0);
  }

  const result = await sendSlotPushToSubscribers({
    slot,
    bundle,
    subscriptions,
  });

  console.log(
    `[push] slot=${slot} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.warn("[push] non-blocking error", error);
  process.exit(0);
});
