import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { PushMarket, PushSubscriptionRecord } from "@/lib/push/types";

const INDEX_KEY = "push:subs:index";

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

export async function upsertPushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  market: PushMarket;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const redis = getRedis();
  if (!redis) return { ok: false, error: "push store not configured" };

  const key = subKey(input.endpoint);
  const existing = (await redis.get<PushSubscriptionRecord>(key)) ?? null;
  const now = new Date().toISOString();
  const markets = new Set<PushMarket>(existing?.markets ?? []);
  markets.add(input.market);

  const record: PushSubscriptionRecord = {
    endpoint: input.endpoint,
    keys: input.keys,
    markets: [...markets],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await redis.set(key, record);
  await redis.sadd(INDEX_KEY, key);
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

  const markets = existing.markets.filter((m) => m !== input.market);
  if (markets.length === 0) {
    await redis.del(key);
    await redis.srem(INDEX_KEY, key);
  } else {
    await redis.set(key, {
      ...existing,
      markets,
      updatedAt: new Date().toISOString(),
    } satisfies PushSubscriptionRecord);
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
