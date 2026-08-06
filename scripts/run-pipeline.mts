/**
 * Collector → Briefing(LLM) → Decision(LLM) → Guard → Publisher
 * 실행: npm run pipeline -- kr-post
 *
 * 슬롯별로 갱신하는 탭이 다름:
 * - kr-* → all + kr
 * - us-* → all + us
 * mid 슬롯(kr-mid/us-mid)은 refresh: Briefing만, 시나리오·점검 유지
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectSnapshot,
  defaultPipelineEvents,
} from "../src/lib/pipeline/collectSnapshot";
import { nextCarryStreaks } from "../src/lib/pipeline/carryForward";
import {
  findingsToRepairHints,
  patchBriefingForGuardRetry,
  runBriefingOnlyGuard,
  runGuard,
} from "../src/lib/pipeline/guard";
import { resolveLlmConfig } from "../src/lib/pipeline/llm";
import { writePipelineStatus } from "../src/lib/pipeline/pipelineStatus";
import { runBriefingAgent } from "../src/lib/pipeline/runBriefingAgent";
import { runDecisionAgent } from "../src/lib/pipeline/runDecisionAgent";
import { ALL_PIPELINE_SLOTS, modeForSlot, scopesForSlot } from "../src/lib/pipeline/schedule";
import { buildChangeLines } from "../src/lib/pipeline/briefingDelta";
import type {
  EditorialView,
  MarketScope,
  PipelineMode,
  PipelineSlot,
  PublishedBundle,
} from "../src/lib/pipeline/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = join(root, "src/data/published/latest.json");
const previousPath = join(root, "src/data/published/previous.json");

function summarizeGuard(guard: PublishedBundle["guard"]): string {
  if (!guard.ok) {
    const codes = guard.findings
      .filter((f) => f.severity === "block")
      .map((f) => f.code)
      .slice(0, 3);
    return `blocked: ${codes.join(", ") || "unknown"}`;
  }
  const warns = guard.findings.filter((f) => f.severity === "warn").length;
  return warns ? `ok · ${warns} warn` : "ok";
}

function recordStatus(
  partial: Omit<Parameters<typeof writePipelineStatus>[1], "updatedAt"> & {
    updatedAt?: string;
  },
): void {
  writePipelineStatus(root, {
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    slot: partial.slot,
    ok: partial.ok,
    mode: partial.mode,
    error: partial.error,
    guardOk: partial.guardOk,
    guardSummary: partial.guardSummary,
  });
}

function loadPreviousBundle(): PublishedBundle | null {
  try {
    if (!existsSync(latestPath)) return null;
    const raw = JSON.parse(readFileSync(latestPath, "utf8")) as PublishedBundle;
    if (raw.version === 2 && raw.views) return raw;
  } catch {
    // ignore
  }
  return null;
}

const MAX_GUARD_ATTEMPTS = 5;

async function generateFullView(
  snapshot: Awaited<ReturnType<typeof collectSnapshot>>,
  scope: MarketScope,
  publishedAt: string,
  slot: PipelineSlot,
  previousView?: EditorialView,
): Promise<{
  view: EditorialView | null;
  findings: PublishedBundle["guard"]["findings"];
  blocked: boolean;
}> {
  let repairHints: string[] | undefined;
  const findings: PublishedBundle["guard"]["findings"] = [];

  for (let attempt = 1; attempt <= MAX_GUARD_ATTEMPTS; attempt++) {
    console.log(
      `[pipeline] Briefing scope=${scope}${attempt > 1 ? ` retry=${attempt}/${MAX_GUARD_ATTEMPTS}` : ""}`,
    );
    const briefingResult = await runBriefingAgent(snapshot, scope, repairHints, "full");
    console.log(
      `  briefing source=${briefingResult.source}${briefingResult.error ? ` (${briefingResult.error})` : ""}`,
    );

    console.log(`[pipeline] Decision scope=${scope}`);
    const decisionResult = await runDecisionAgent(
      snapshot,
      briefingResult.data,
      scope,
      repairHints,
    );
    console.log(
      `  decision source=${decisionResult.source}${decisionResult.error ? ` (${decisionResult.error})` : ""}`,
    );

    let briefing = briefingResult.data;
    const decision = decisionResult.data;
    let guard = runGuard({
      snapshot,
      briefing,
      decision,
      scope,
    });

    if (!guard.ok && attempt === MAX_GUARD_ATTEMPTS) {
      const patched = patchBriefingForGuardRetry(briefing, snapshot, scope);
      if (patched !== briefing) {
        console.log(`  patch: repair earnings mentions for ${scope}`);
        briefing = patched;
        guard = runGuard({ snapshot, briefing, decision, scope });
      }
    }

    if (guard.ok) {
      findings.push(
        ...guard.findings.map((f) => ({ ...f, message: `[${scope}] ${f.message}` })),
      );
      const continuity = snapshot.evidence?.previous.continuity?.[scope] ?? null;
      const draftView: EditorialView = {
        briefing: {
          headline: briefing.headline,
          bullets: briefing.bullets,
          evidenceIds: briefing.evidenceIds,
        },
        scenarios: decision.scenarios,
        checkItems: decision.checkItems,
        publishedAt,
        slot,
        mode: "full",
      };
      return {
        view: {
          ...draftView,
          carryStreaks: nextCarryStreaks(previousView, draftView, continuity),
        },
        findings,
        blocked: false,
      };
    }

    repairHints = findingsToRepairHints(guard.findings);
    console.log(
      `  guard blocked → ${attempt < MAX_GUARD_ATTEMPTS ? "retry" : "give up"}: ${repairHints.join("; ")}`,
    );
    if (attempt === MAX_GUARD_ATTEMPTS) {
      findings.push(
        ...guard.findings.map((f) => ({ ...f, message: `[${scope}] ${f.message}` })),
      );
      return { view: null, findings, blocked: true };
    }
  }

  return { view: null, findings, blocked: true };
}

async function generateRefreshView(
  snapshot: Awaited<ReturnType<typeof collectSnapshot>>,
  scope: MarketScope,
  publishedAt: string,
  slot: PipelineSlot,
  previous: EditorialView | undefined,
): Promise<{
  view: EditorialView | null;
  findings: PublishedBundle["guard"]["findings"];
  blocked: boolean;
}> {
  if (!previous?.scenarios?.length || !previous.checkItems?.length) {
    console.log(`[pipeline] refresh fallback → full (no prior view for ${scope})`);
    return generateFullView(snapshot, scope, publishedAt, slot, previous);
  }

  let repairHints: string[] | undefined;
  const findings: PublishedBundle["guard"]["findings"] = [];
  const frozenDecision = {
    scenarios: previous.scenarios,
    checkItems: previous.checkItems,
  };

  for (let attempt = 1; attempt <= MAX_GUARD_ATTEMPTS; attempt++) {
    console.log(
      `[pipeline] Refresh Briefing scope=${scope}${attempt > 1 ? ` retry=${attempt}/${MAX_GUARD_ATTEMPTS}` : ""}`,
    );
    const briefingResult = await runBriefingAgent(snapshot, scope, repairHints, "refresh");
    console.log(
      `  briefing source=${briefingResult.source}${briefingResult.error ? ` (${briefingResult.error})` : ""}`,
    );

    let briefing = briefingResult.data;
    let guard = runBriefingOnlyGuard({
      snapshot,
      briefing,
      frozenDecision,
      scope,
    });

    if (!guard.ok && attempt === MAX_GUARD_ATTEMPTS) {
      const patched = patchBriefingForGuardRetry(briefing, snapshot, scope);
      if (patched !== briefing) {
        console.log(`  patch: repair earnings mentions for ${scope}`);
        briefing = patched;
        guard = runBriefingOnlyGuard({
          snapshot,
          briefing,
          frozenDecision,
          scope,
        });
      }
    }

    if (guard.ok) {
      findings.push(
        ...guard.findings.map((f) => ({ ...f, message: `[${scope}] ${f.message}` })),
      );
      return {
        view: {
          briefing: {
            headline: briefing.headline,
            bullets: briefing.bullets,
            evidenceIds: briefing.evidenceIds,
          },
          scenarios: previous.scenarios,
          checkItems: previous.checkItems,
          publishedAt,
          slot,
          mode: "refresh",
        },
        findings,
        blocked: false,
      };
    }

    repairHints = findingsToRepairHints(guard.findings);
    console.log(
      `  guard blocked → ${attempt < MAX_GUARD_ATTEMPTS ? "retry" : "keep previous"}: ${repairHints.join("; ")}`,
    );
    if (attempt === MAX_GUARD_ATTEMPTS) {
      findings.push(
        ...guard.findings.map((f) => ({
          ...f,
          severity: "warn" as const,
          message: `[${scope}] refresh skipped: ${f.message}`,
        })),
      );
      return { view: { ...previous }, findings, blocked: false };
    }
  }

  return { view: { ...previous }, findings, blocked: false };
}

async function main() {
  const slot = (process.argv[2] as PipelineSlot) || "kr-post";
  if (!ALL_PIPELINE_SLOTS.includes(slot)) {
    console.error(`Unknown slot: ${slot}. Expected one of ${ALL_PIPELINE_SLOTS.join(", ")}`);
    process.exit(1);
  }

  const mode: PipelineMode = modeForSlot(slot);
  try {
    const llm = resolveLlmConfig();
    console.log(
      `[pipeline] mode=${mode} llm=${llm.provider}${llm.provider === "none" ? " (seed fallback)" : ` model=${llm.model}`}`,
    );

    console.log(`[pipeline] 1) Collector(+EvidencePack+Risk) slot=${slot}`);
    const snapshot = await collectSnapshot(slot, { cwd: root });
    if (snapshot.evidence) {
      console.log(
        `  evidence: decoupling=${snapshot.evidence.temperature.decouplingPct}% · risk elevated=${snapshot.evidence.risk.elevated} · headlines=${snapshot.evidence.risk.headlines.length}`,
      );
    }

    const previous = loadPreviousBundle();
    const targetScopes = scopesForSlot(slot);
    const publishedAt = new Date().toISOString();
    const views = {
      all: previous?.views.all,
      kr: previous?.views.kr,
      us: previous?.views.us,
    } as PublishedBundle["views"];
    const findings = [...(previous?.guard.findings ?? []).filter((f) => f.severity !== "block")];

    for (const scope of targetScopes) {
      const { view, findings: scopeFindings, blocked } =
        mode === "refresh"
          ? await generateRefreshView(snapshot, scope, publishedAt, slot, views[scope])
          : await generateFullView(snapshot, scope, publishedAt, slot, views[scope]);
      findings.push(...scopeFindings);
      if (blocked || !view) {
        console.error(
          `[pipeline] scope=${scope} blocked after ${MAX_GUARD_ATTEMPTS} attempts — keep previous view`,
        );
        if (!views[scope] && previous?.views?.[scope]) {
          views[scope] = previous.views[scope];
        }
        continue;
      }
      const changeLines = buildChangeLines(previous?.views?.[scope], view, mode);
      views[scope] = { ...view, changeLines };
    }

    (["all", "kr", "us"] as MarketScope[]).forEach((scope) => {
      const v = views[scope];
      if (!v) return;
      if (!v.publishedAt) {
        views[scope] = {
          ...v,
          publishedAt: previous?.publishedAt ?? publishedAt,
          slot: previous?.slot ?? slot,
          mode: previous?.mode ?? mode,
        };
      }
    });

    if (!views.all || !views.kr || !views.us) {
      console.error("[pipeline] missing views — seeding missing scopes with full generation");
      for (const scope of ["all", "kr", "us"] as MarketScope[]) {
        if (!views[scope]) {
          const { view, findings: scopeFindings, blocked } = await generateFullView(
            snapshot,
            scope,
            publishedAt,
            slot,
            previous?.views?.[scope],
          );
          findings.push(...scopeFindings);
          if (blocked || !view) {
            console.error(`[pipeline] cannot seed scope=${scope} — abort publish, keep previous`);
            recordStatus({
              slot,
              ok: false,
              mode,
              guardOk: false,
              guardSummary: summarizeGuard({
                ok: false,
                findings,
              }),
              error: `keep-previous: missing ${scope} after guard blocks`,
            });
            process.exit(0);
          }
          views[scope] = {
            ...view,
            changeLines: buildChangeLines(previous?.views?.[scope], view, "full"),
          };
        }
      }
    }

    const guard = {
      ok: findings.every((f) => f.severity !== "block"),
      findings,
    };
    console.log("[pipeline] Guard", JSON.stringify(guard, null, 2));
    if (!guard.ok) {
      console.error(
        "[pipeline] blocked by guard — keep previous publication (latest.json unchanged)",
      );
      recordStatus({
        slot,
        ok: false,
        mode,
        guardOk: false,
        guardSummary: summarizeGuard(guard),
        error: `keep-previous: ${summarizeGuard(guard)}`,
      });
      // 직전 발행 유지 — 오보로 latest를 덮지 않음
      process.exit(0);
    }

    const bundle: PublishedBundle = {
      version: 2,
      slot,
      publishedAt,
      source: "pipeline",
      mode,
      market: {
        temperature: snapshot.temperature,
        mood: snapshot.mood,
        moodLabel: snapshot.moodLabel,
        asOfLabel: snapshot.asOfLabel,
      },
      views: views as PublishedBundle["views"],
      events: snapshot.events ?? previous?.events ?? defaultPipelineEvents(),
      guard,
    };

    mkdirSync(dirname(latestPath), { recursive: true });
    if (previous) {
      writeFileSync(previousPath, `${JSON.stringify(previous, null, 2)}\n`, "utf8");
    }
    writeFileSync(latestPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    recordStatus({
      updatedAt: publishedAt,
      slot,
      ok: true,
      mode,
      guardOk: true,
      guardSummary: summarizeGuard(guard),
    });
    console.log(`[pipeline] published → ${latestPath}`);
    console.log(`updated scopes: ${targetScopes.join(", ")} · mode=${mode}`);
    console.log(`all@${bundle.views.all.publishedAt}: ${bundle.views.all.briefing.headline}`);
    console.log(`kr@${bundle.views.kr.publishedAt}: ${bundle.views.kr.briefing.headline}`);
    console.log(`us@${bundle.views.us.publishedAt}: ${bundle.views.us.briefing.headline}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordStatus({
      slot,
      ok: false,
      mode,
      error: message.slice(0, 240),
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
