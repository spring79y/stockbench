/**
 * Collector → Briefing(LLM) → Decision(LLM) → Guard → Publisher
 * 실행: npm run pipeline -- kr-post
 *
 * 슬롯별로 갱신하는 탭이 다름:
 * - kr-* → all + kr
 * - us-* → all + us
 * mid 슬롯(kr-mid/us-mid)은 refresh: Briefing만, 시나리오·점검 유지
 *
 * Guard 최종(5회) 시도:
 * - continuity soft만 → demote warn + degraded publish (「제한 연속성」)
 * - 사실 hard만 남음 → Evidence 앵커 thin publish (슬롯 스탬프 갱신)
 * - thin도 실패 / 생성 불가 → keep-previous
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
import {
  appendDegradedAsOf,
  blockingCodes,
  buildDegradedEditorialView,
  buildThinEvidenceDrafts,
  classifyFinalAttempt,
  demoteFinalAttemptFindings,
  filterThinGuardFindings,
  hasHardBlocks,
  summarizeDegradedPublish,
} from "../src/lib/pipeline/degradedPublish";
import { resolveLlmConfig } from "../src/lib/pipeline/llm";
import { writePipelineStatus } from "../src/lib/pipeline/pipelineStatus";
import { runBriefingAgent } from "../src/lib/pipeline/runBriefingAgent";
import { runDecisionAgent } from "../src/lib/pipeline/runDecisionAgent";
import { ALL_PIPELINE_SLOTS, modeForSlot, scopesForSlot } from "../src/lib/pipeline/schedule";
import { buildChangeLines } from "../src/lib/pipeline/briefingDelta";
import type {
  BriefingDraft,
  DecisionDraft,
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
    ...(partial.degraded != null ? { degraded: partial.degraded } : {}),
  });
}

function scopePrefixFindings(
  scope: MarketScope,
  findings: PublishedBundle["guard"]["findings"],
): PublishedBundle["guard"]["findings"] {
  return findings.map((f) => ({ ...f, message: `[${scope}] ${f.message}` }));
}

function keepPreviousWarnFindings(
  scope: MarketScope,
  findings: PublishedBundle["guard"]["findings"],
): PublishedBundle["guard"]["findings"] {
  return findings.map((f) => ({
    ...f,
    severity: "warn" as const,
    message: `[${scope}] keep-previous: ${f.message}`,
  }));
}

type ScopeGenResult = {
  view: EditorialView | null;
  findings: PublishedBundle["guard"]["findings"];
  blocked: boolean;
  degraded: boolean;
  thin: boolean;
};

function resolveFinalAttemptView(input: {
  snapshot: Awaited<ReturnType<typeof collectSnapshot>>;
  scope: MarketScope;
  publishedAt: string;
  slot: PipelineSlot;
  mode: PipelineMode;
  briefing: BriefingDraft;
  decision: DecisionDraft;
  guard: ReturnType<typeof runGuard>;
  previousView?: EditorialView;
}): ScopeGenResult {
  const { kind, findings: classified } = classifyFinalAttempt(input.guard);
  const continuity = input.snapshot.evidence?.previous.continuity?.[input.scope] ?? null;

  if (kind === "degraded-draft") {
    console.log(
      `  final-attempt demote → degraded publish (${summarizeDegradedPublish({
        degraded: true,
        findings: classified,
      })})`,
    );
    const draft = buildDegradedEditorialView({
      briefing: input.briefing,
      decision: input.decision,
      publishedAt: input.publishedAt,
      slot: input.slot,
      mode: input.mode,
      kind: "degraded-draft",
    });
    return {
      view: {
        ...draft,
        carryStreaks: nextCarryStreaks(input.previousView, draft, continuity),
      },
      findings: scopePrefixFindings(input.scope, classified),
      blocked: false,
      degraded: true,
      thin: false,
    };
  }

  const thin = buildThinEvidenceDrafts(input.snapshot, input.scope);
  const thinRaw = runGuard({
    snapshot: input.snapshot,
    briefing: thin.briefing,
    decision: thin.decision,
    scope: input.scope,
  });
  const thinFindings = demoteFinalAttemptFindings(
    filterThinGuardFindings(thinRaw.findings),
  );
  const thinOk = !hasHardBlocks(thinFindings);

  if (thinOk) {
    console.log(
      `  final-attempt thin Evidence → degraded publish (hard left: ${blockingCodes(classified).join(", ") || "n/a"})`,
    );
    const draft = buildDegradedEditorialView({
      briefing: thin.briefing,
      decision: thin.decision,
      publishedAt: input.publishedAt,
      slot: input.slot,
      mode: input.mode,
      kind: "thin-evidence",
    });
    return {
      view: {
        ...draft,
        carryStreaks: nextCarryStreaks(input.previousView, draft, continuity),
      },
      findings: scopePrefixFindings(input.scope, [
        ...classified.map((f) =>
          f.severity === "block"
            ? {
                ...f,
                severity: "warn" as const,
                message: `LLM draft blocked → thin: ${f.message}`,
              }
            : f,
        ),
        ...thinFindings,
        {
          severity: "warn" as const,
          code: "thin-evidence-publish",
          message: "사실 hard 잔존 → Evidence 앵커 최소 브리핑으로 슬롯 스탬프 갱신",
        },
      ]),
      blocked: false,
      degraded: true,
      thin: true,
    };
  }

  console.error(
    `  final-attempt blocked (thin also hard): ${blockingCodes(thinFindings).join(", ")} — keep-previous`,
  );
  return {
    view: null,
    findings: keepPreviousWarnFindings(input.scope, [
      ...classified,
      ...thinFindings,
    ]),
    blocked: true,
    degraded: false,
    thin: false,
  };
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
): Promise<ScopeGenResult> {
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
      findings.push(...scopePrefixFindings(scope, guard.findings));
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
        degraded: false,
        thin: false,
      };
    }

    repairHints = findingsToRepairHints(guard.findings);
    console.log(
      `  guard blocked → ${attempt < MAX_GUARD_ATTEMPTS ? "retry" : "final demote/thin"}: ${repairHints.join("; ")}`,
    );
    if (attempt === MAX_GUARD_ATTEMPTS) {
      return resolveFinalAttemptView({
        snapshot,
        scope,
        publishedAt,
        slot,
        mode: "full",
        briefing,
        decision,
        guard,
        previousView,
      });
    }
  }

  return { view: null, findings, blocked: true, degraded: false, thin: false };
}

async function generateRefreshView(
  snapshot: Awaited<ReturnType<typeof collectSnapshot>>,
  scope: MarketScope,
  publishedAt: string,
  slot: PipelineSlot,
  previous: EditorialView | undefined,
): Promise<ScopeGenResult> {
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
      findings.push(...scopePrefixFindings(scope, guard.findings));
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
        degraded: false,
        thin: false,
      };
    }

    repairHints = findingsToRepairHints(guard.findings);
    console.log(
      `  guard blocked → ${attempt < MAX_GUARD_ATTEMPTS ? "retry" : "final demote/thin"}: ${repairHints.join("; ")}`,
    );
    if (attempt === MAX_GUARD_ATTEMPTS) {
      return resolveFinalAttemptView({
        snapshot,
        scope,
        publishedAt,
        slot,
        mode: "refresh",
        briefing,
        decision: frozenDecision,
        guard,
        previousView: previous,
      });
    }
  }

  return { view: null, findings, blocked: true, degraded: false, thin: false };
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
    let publishedAny = false;
    let anyDegraded = false;
    let anyThin = false;

    for (const scope of targetScopes) {
      const { view, findings: scopeFindings, blocked, degraded, thin } =
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
      publishedAny = true;
      if (degraded) anyDegraded = true;
      if (thin) anyThin = true;
      const deltaLines = buildChangeLines(previous?.views?.[scope], view, mode);
      const changeLines = [
        ...(view.changeLines ?? []).filter((l) => !deltaLines.includes(l)),
        ...deltaLines,
      ].slice(0, 3);
      views[scope] = { ...view, changeLines };
    }

    if (!publishedAny) {
      console.error(
        "[pipeline] all target scopes blocked — keep previous publication (latest.json unchanged)",
      );
      recordStatus({
        slot,
        ok: false,
        mode,
        degraded: false,
        guardOk: false,
        guardSummary: summarizeGuard({
          ok: findings.every((f) => f.severity !== "block"),
          findings,
        }),
        error: `keep-previous: hard blocks after thin — ${blockingCodes(findings).join(", ") || "unknown"}`,
      });
      process.exit(0);
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
          const { view, findings: scopeFindings, blocked, degraded, thin } =
            await generateFullView(
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
              degraded: false,
              guardOk: false,
              guardSummary: summarizeGuard({
                ok: false,
                findings,
              }),
              error: `keep-previous: missing ${scope} after guard blocks`,
            });
            process.exit(0);
          }
          if (degraded) anyDegraded = true;
          if (thin) anyThin = true;
          const deltaLines = buildChangeLines(previous?.views?.[scope], view, "full");
          const changeLines = [
            ...(view.changeLines ?? []).filter((l) => !deltaLines.includes(l)),
            ...deltaLines,
          ].slice(0, 3);
          views[scope] = { ...view, changeLines };
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
        degraded: false,
        guardOk: false,
        guardSummary: summarizeGuard(guard),
        error: `keep-previous: ${summarizeGuard(guard)}`,
      });
      process.exit(0);
    }

    const asOfLabel = appendDegradedAsOf(snapshot.asOfLabel, anyDegraded);
    const guardSummary = anyDegraded
      ? summarizeDegradedPublish({
          degraded: true,
          findings,
          thin: anyThin,
        })
      : summarizeGuard(guard);

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
        asOfLabel,
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
      degraded: anyDegraded || undefined,
      guardOk: true,
      guardSummary,
    });
    console.log(`[pipeline] published → ${latestPath}${anyDegraded ? " (degraded)" : ""}`);
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
      degraded: false,
      error: message.slice(0, 240),
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
