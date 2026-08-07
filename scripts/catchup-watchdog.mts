/**
 * Catch-up watchdog — detect stale briefing slots and emit a dispatch target.
 *
 * Usage:
 *   npx tsx scripts/catchup-watchdog.mts
 *   npx tsx scripts/catchup-watchdog.mts --mark morning
 *
 * Outputs (stdout + GITHUB_OUTPUT when set):
 *   target=morning|noon|kr-post|us-pre|us-mid|  (empty = nothing to do)
 *   reason=...
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideCatchUp,
  markCatchUpDispatched,
  type CatchUpState,
  type CatchUpTarget,
} from "../src/lib/pipeline/catchup";
import type { PublishedBundle } from "../src/lib/pipeline/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = join(root, "src/data/published/latest.json");
const catchupPath = join(root, "src/data/published/catchup.json");

const TARGETS: CatchUpTarget[] = ["morning", "noon", "kr-post", "us-pre", "us-mid"];

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeCatchup(state: CatchUpState) {
  mkdirSync(dirname(catchupPath), { recursive: true });
  writeFileSync(catchupPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function emit(key: string, value: string) {
  console.log(`${key}=${value}`);
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  writeFileSync(out, `${key}=${value}\n`, { flag: "a" });
}

function parseMarkArg(argv: string[]): CatchUpTarget | null {
  const idx = argv.indexOf("--mark");
  if (idx < 0) return null;
  const value = argv[idx + 1];
  if (!value || !(TARGETS as string[]).includes(value)) {
    console.error(`--mark requires one of ${TARGETS.join(", ")}`);
    process.exit(1);
  }
  return value as CatchUpTarget;
}

function main() {
  const mark = parseMarkArg(process.argv.slice(2));
  const now = new Date();

  if (mark) {
    const prev = readJson<CatchUpState>(catchupPath);
    const next = markCatchUpDispatched(prev, mark, now);
    writeCatchup(next);
    console.log(`[catchup] marked ${mark} on ${next.date}`);
    emit("target", mark);
    emit("reason", `marked:${mark}`);
    emit("catchup_path", catchupPath);
    return;
  }

  const bundle = readJson<PublishedBundle>(latestPath);
  const state = readJson<CatchUpState>(catchupPath);
  const decision = decideCatchUp({ now, bundle, state });

  console.log(`[catchup] ${decision.reason}`);
  if (decision.staleSlots.length) {
    console.log(`[catchup] staleSlots=${decision.staleSlots.join(",")}`);
  }

  emit("target", decision.target ?? "");
  emit("reason", decision.reason.replace(/\n/g, " "));
}

main();
