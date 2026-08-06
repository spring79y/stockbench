/**
 * Poll production until /api/published matches local latest.json publishedAt.
 * Used after git push so slot push fires only once clients can see the bundle.
 *
 * Env: PRODUCTION_URL (default https://www.stock-bench.com)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublishedBundle } from "../src/lib/pipeline/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = join(root, "src/data/published/latest.json");
const PRODUCTION_URL = (process.env.PRODUCTION_URL ?? "https://www.stock-bench.com").replace(
  /\/$/,
  "",
);
const TIMEOUT_MS = Number(process.env.WAIT_PUBLISHED_TIMEOUT_MS ?? 10 * 60 * 1000);
const POLL_MS = Number(process.env.WAIT_PUBLISHED_POLL_MS ?? 15_000);
const FALLBACK_SLEEP_MS = Number(process.env.WAIT_PUBLISHED_FALLBACK_MS ?? 90_000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!existsSync(latestPath)) {
    console.warn("[wait] skipped — latest.json missing");
    process.exit(0);
  }

  const local = JSON.parse(readFileSync(latestPath, "utf8")) as PublishedBundle;
  const expected = local.publishedAt;
  if (!expected) {
    console.warn("[wait] skipped — local publishedAt missing");
    process.exit(0);
  }

  const url = `${PRODUCTION_URL}/api/published`;
  console.log(`[wait] expecting publishedAt=${expected} at ${url}`);

  const deadline = Date.now() + TIMEOUT_MS;
  let sawEndpoint = false;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) {
        console.warn("[wait] /api/published not on production yet");
        if (!sawEndpoint) {
          console.warn(`[wait] fallback sleep ${FALLBACK_SLEEP_MS}ms then proceed`);
          await sleep(FALLBACK_SLEEP_MS);
          process.exit(0);
        }
      } else if (res.ok) {
        sawEndpoint = true;
        const data = (await res.json()) as { publishedAt?: string | null };
        if (data.publishedAt === expected) {
          console.log(`[wait] production live publishedAt=${expected}`);
          process.exit(0);
        }
        console.log(
          `[wait] not yet — remote=${data.publishedAt ?? "null"} want=${expected}`,
        );
      } else {
        console.warn(`[wait] HTTP ${res.status}`);
      }
    } catch (error) {
      console.warn("[wait] fetch error", error instanceof Error ? error.message : error);
    }
    await sleep(POLL_MS);
  }

  console.warn(
    `[wait] timeout after ${TIMEOUT_MS}ms — proceeding (deploy may still be rolling)`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.warn("[wait] non-blocking error", error);
  process.exit(0);
});
