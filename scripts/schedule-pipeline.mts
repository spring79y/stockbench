/**
 * 한·미 장전·장후 슬롯에 맞춰 pipeline을 자동 실행.
 * 실행: npm run pipeline:schedule
 *
 * 서울 시각 기준 (주말 스킵):
 * - us-mid 02:00 (refresh) · us-post · kr-pre 07:00
 * - kr-mid 11:30 (refresh) · kr-post 15:40 · us-pre 21:50
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SLOT_SCHEDULE,
  dueSlots,
  seoulDateParts,
} from "../src/lib/pipeline/schedule";
import type { PipelineSlot } from "../src/lib/pipeline/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const statePath = join(root, "src/data/published/schedule-state.json");

type DayState = Partial<Record<PipelineSlot, boolean>>;
type StateFile = { date: string; fired: DayState };

function loadState(ymd: string): StateFile {
  try {
    if (!existsSync(statePath)) return { date: ymd, fired: {} };
    const raw = JSON.parse(readFileSync(statePath, "utf8")) as StateFile;
    if (raw.date !== ymd) return { date: ymd, fired: {} };
    return { date: ymd, fired: raw.fired ?? {} };
  } catch {
    return { date: ymd, fired: {} };
  }
}

function saveState(state: StateFile) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function runPipeline(slot: PipelineSlot): Promise<number> {
  return new Promise((resolve) => {
    console.log(`[schedule] ▶ npm run pipeline -- ${slot}`);
    const child = spawn("npm", ["run", "pipeline", "--", slot], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function tick() {
  const now = new Date();
  const { ymd, weekend, hour, minute } = seoulDateParts(now);
  const state = loadState(ymd);

  if (weekend) {
    console.log(`[schedule] ${ymd} 주말 — skip (${hour}:${String(minute).padStart(2, "0")} KST)`);
    return;
  }

  const due = dueSlots(now, state.fired);
  if (due.length === 0) {
    console.log(
      `[schedule] ${ymd} ${hour}:${String(minute).padStart(2, "0")} KST — due 없음 · fired=${JSON.stringify(state.fired)}`,
    );
    return;
  }

  for (const slot of due) {
    const code = await runPipeline(slot);
    if (code === 0) {
      state.fired[slot] = true;
      saveState(state);
      console.log(`[schedule] ✓ ${slot} done`);
    } else {
      console.error(`[schedule] ✗ ${slot} failed (exit ${code}) — will retry next tick`);
    }
  }
}

async function main() {
  console.log("[schedule] started");
  console.log(
    "[schedule] slots:",
    Object.entries(SLOT_SCHEDULE)
      .map(([k, v]) => `${k}=${String(v.hour).padStart(2, "0")}:${String(v.minute).padStart(2, "0")}`)
      .join(" · "),
  );

  await tick();
  setInterval(() => {
    tick().catch((error) => console.error("[schedule] tick error", error));
  }, 60_000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
