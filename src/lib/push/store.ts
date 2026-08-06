import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { PipelineSlot } from "@/lib/pipeline/types";
import {
  defaultSlotsForMarket,
  isPushSubscriptionOn,
  type PushMarket,
  type PushSubscriptionRecord,
} from "@/lib/push/types";

const INDEX_KEY = "push:subs:index";
/** Approximate ON endpoint count — source of truth is index + reaggregate. */
const ON_COUNT_KEY = "push:on:count";
const ON_REAGGREGATED_AT_KEY = "push:on:reaggregatedAt";

function subKey(endpoint: string): string {
  const hash = createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
  return `push:sub:${hash}`;
}

/** Vercel Upstash 연결은 KV_REST_API_* 로, 직접 설정은 UPSTASH_REDIS_REST_* 로 들어온다.
 *  REST URL만 유효 (https://…). redis:// / rediss:// (KV_URL) 는 거부.
 */
function pickHttpsUrl(...candidates: Array<string | undefined | null>): string | null {
  for (const raw of candidates) {
    const url = raw?.trim();
    if (url?.startsWith("https://")) return url;
  }
  return null;
}

function redisCredentials(): { url: string; token: string } | null {
  const url = pickHttpsUrl(
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.KV_REST_API_URL,
  );
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    ""
  ).trim();
  if (!url || !token) return null;
  return { url, token };
}

function getRedis(): Redis | null {
  const creds = redisCredentials();
  if (!creds) return null;
  try {
    return new Redis(creds);
  } catch (error) {
    console.warn("[push] invalid Upstash Redis config", error);
    return null;
  }
}

export function pushStoreConfigured(): boolean {
  return Boolean(redisCredentials());
}

async function adjustOnCount(redis: Redis, wasOn: boolean, isOn: boolean): Promise<void> {
  if (wasOn === isOn) return;
  if (isOn) {
    await redis.incr(ON_COUNT_KEY);
    return;
  }
  const next = await redis.decr(ON_COUNT_KEY);
  if (typeof next === "number" && next < 0) {
    await redis.set(ON_COUNT_KEY, 0);
  }
}

export type PushOnStats = {
  configured: boolean;
  /** Active ON endpoints (one per subscription record). */
  count: number;
  reaggregatedAt: string | null;
};

/**
 * Reconcile counter from Redis index / listPushSubscriptions.
 * Call on /ops load so drift is corrected without exposing endpoints.
 */
export async function reaggregatePushOnCount(): Promise<PushOnStats> {
  const redis = getRedis();
  if (!redis) {
    return { configured: false, count: 0, reaggregatedAt: null };
  }

  const subs = await listPushSubscriptions();
  const count = subs.filter(isPushSubscriptionOn).length;
  const reaggregatedAt = new Date().toISOString();
  await redis.set(ON_COUNT_KEY, count);
  await redis.set(ON_REAGGREGATED_AT_KEY, reaggregatedAt);
  return { configured: true, count, reaggregatedAt };
}

export async function getPushOnStats(): Promise<PushOnStats> {
  const redis = getRedis();
  if (!redis) {
    return { configured: false, count: 0, reaggregatedAt: null };
  }

  const [rawCount, reaggregatedAt] = await Promise.all([
    redis.get<number | string>(ON_COUNT_KEY),
    redis.get<string>(ON_REAGGREGATED_AT_KEY),
  ]);
  const count = Math.max(0, Number(rawCount ?? 0) || 0);
  return {
    configured: true,
    count,
    reaggregatedAt: typeof reaggregatedAt === "string" ? reaggregatedAt : null,
  };
}

export async function upsertPushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  market: PushMarket;
  /** 지정 시 해당 시장 슬롯 목록을 교체. 없으면 기존 유지, 신규면 전체 ON */
  slots?: PipelineSlot[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const redis = getRedis();
  if (!redis) return { ok: false, error: "push store not configured" };

  const key = subKey(input.endpoint);
  const existing = (await redis.get<PushSubscriptionRecord>(key)) ?? null;
  const wasOn = existing ? isPushSubscriptionOn(existing) : false;
  const now = new Date().toISOString();
  const markets = new Set<PushMarket>(existing?.markets ?? []);
  markets.add(input.market);

  const slots: NonNullable<PushSubscriptionRecord["slots"]> = {
    ...(existing?.slots ?? {}),
  };
  if (input.slots) {
    slots[input.market] = input.slots;
  } else if (!slots[input.market]) {
    slots[input.market] = defaultSlotsForMarket(input.market);
  }

  const record: PushSubscriptionRecord = {
    endpoint: input.endpoint,
    keys: input.keys,
    markets: [...markets],
    slots,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await redis.set(key, record);
  await redis.sadd(INDEX_KEY, key);
  await adjustOnCount(redis, wasOn, isPushSubscriptionOn(record));
  return { ok: true };
}

export async function removePushMarket(input: {
  endpoint: string;
  market: PushMarket;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const redis = getRedis();
  if (!redis) return { ok: false, error: "push store not configured" };

  const key = subKey(input.endpoint);
  const existing = (await redis.get<PushSubscriptionRecord>(key)) ?? null;
  if (!existing) return { ok: true };

  const wasOn = isPushSubscriptionOn(existing);
  const markets = existing.markets.filter((m) => m !== input.market);
  if (markets.length === 0) {
    await redis.del(key);
    await redis.srem(INDEX_KEY, key);
    await adjustOnCount(redis, wasOn, false);
  } else {
    const next: PushSubscriptionRecord = {
      ...existing,
      markets,
      updatedAt: new Date().toISOString(),
    };
    await redis.set(key, next);
    await adjustOnCount(redis, wasOn, isPushSubscriptionOn(next));
  }
  return { ok: true };
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const redis = getRedis();
  if (!redis) return [];

  const keys = (await redis.smembers(INDEX_KEY)) as string[];
  if (!keys.length) return [];

  const rows = await Promise.all(keys.map((k) => redis.get<PushSubscriptionRecord>(k)));
  return rows.filter((r): r is PushSubscriptionRecord => Boolean(r?.endpoint && r.keys));
}
