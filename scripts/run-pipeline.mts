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
import { nextCarryStreaks, type CarryForwardBlock } from "../src/lib/pipeline/carryForward";
import {
  findingsToRepairHints,
  hasHardPublishBlocks,
  patchBriefingForGuardRetry,
  runBriefingOnlyGuard,
  runGuard,
} from "../src/lib/pipeline/guard";
import { resolveLlmConfig } from "../src/lib/pipeline/llm";
import { writePipelineStatus } from "../src/lib/pipeline/pipelineStatus";
import { runBriefingAgent } from "../src/lib/pipeline/runBriefingAgent";
import { runDecisionAgent } from "../src/lib/pipeline/runDecisionAgent";
import { ALL_PIPELINE_SLOTS, modeForSlot, scopesForSlot } from "../src/lib/pipeline/schedule";
import {
  TRANSIENT_RETRY_INTERVAL_MS,
  shouldRetryTransientKeepPrevious,
} from "../src/lib/pipeline/transientLlm";
import { buildChangeLines } from "../src/lib/pipeline/briefingDelta";
import {
  briefingHasForbiddenSeedVoice,
  briefingHasForbiddenUserMeta,
  isFactsOnlyStyleView,
  isRicherLlmStyleView,
  sanitizeEditorialView,
  sanitizePublishedBundle,
  seedBriefing,
  seedDecision,
} from "../src/lib/pipeline/seed";
import type {
  BriefingDraft,
  DecisionDraft,
  EditorialView,
  MarketScope,
  PipelineMode,
  PipelineSlot,
  PublishedBundle,
} from "../src/lib/pipeline/types";

/**
 * Prefer any prior board body over a fresh facts-only list.
 * Good prior = has bullets, not banned seed voice, not thin facts-only style.
 */
function isGoodPriorView(view: EditorialView | undefined): view is EditorialView {
  if (!view?.briefing?.bullets?.length) return false;
  if (briefingHasForbiddenSeedVoice(view.briefing)) return false;
  if (isFactsOnlyStyleView(view)) return false;
  return true;
}

/**
 * LLM missing/failed after retries: quietly keep previous (same market).
 * Facts-only is cold-start / ops bootstrap only — never the visible briefing body
 * when a prior view exists.
 */
function resolveNonLlmBriefingView(input: {
  snapshot: Awaited<ReturnType<typeof collectSnapshot>>;
  scope: MarketScope;
  publishedAt: string;
  slot: PipelineSlot;
  previousView?: EditorialView;
  mode: PipelineMode;
  reason: string;
}): {
  view: EditorialView;
  findings: PublishedBundle["guard"]["findings"];
  blocked: boolean;
} {
  const { snapshot, scope, publishedAt, slot, previousView, mode, reason } = input;

  // Quiet keep-previous whenever the same-market view has any board body.
  if (previousView?.briefing?.bullets?.length) {
    const quality = isGoodPriorView(previousView) ? "good prior" : "prior board";
    console.log(`  ${reason} → keep previous ${scope} (${quality})`);
    return {
      view: sanitizeEditorialView({ ...previousView }),
      findings: [
        {
          severity: "warn",
          code: "llm-seed-suppressed",
          message: `[${scope}] ${reason}: kept previous briefing (facts-only not published to board)`,
        },
      ],
      blocked: false,
    };
  }

  const facts = seedBriefing(snapshot, scope);
  const decision = seedDecision(snapshot, scope);

  console.log(`  ${reason} → facts-only ${scope} (cold start / ops only)`);
  return {
    view: sanitizeEditorialView({
      briefing: {
        headline: facts.headline,
        bullets: facts.bullets,
        evidenceIds: facts.evidenceIds,
      },
      scenarios: decision.scenarios,
      checkItems: decision.checkItems,
      publishedAt,
      slot,
      mode,
      degraded: true,
      degradedLabel: "사실만",
    }),
    findings: [
      {
        severity: "warn",
        code: "facts-only-fallback",
        message: `[${scope}] ${reason}: cold-start facts-only anchors (no prior view)`,
      },
    ],
    blocked: false,
  };
}

/** If latest scope is facts-only and archived previous.json is richer LLM-style, restore (same market). */
function restoreRicherViewsFromArchive(
  current: PublishedBundle,
  archived: PublishedBundle | null,
): PublishedBundle {
  if (!archived?.views) return current;
  const views = { ...current.views };
  let changed = false;
  for (const scope of ["all", "kr", "us"] as MarketScope[]) {
    const cur = views[scope];
    const arch = archived.views[scope];
    if (
      cur &&
      arch &&
      isFactsOnlyStyleView(cur) &&
      isRicherLlmStyleView(arch)
    ) {
      console.log(
        `  restore ${scope} from previous.json (richer LLM-style, same market)`,
      );
      views[scope] = sanitizeEditorialView({ ...arch });
      changed = true;
    }
  }
  if (!changed) return current;
  return { ...current, views };
}

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

function loadBundleAt(path: string): PublishedBundle | null {
  try {
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8")) as PublishedBundle;
    if (raw.version === 2 && raw.views) return raw;
  } catch {
    // ignore
  }
  return null;
}

/** Working prior for this run = current latest (before overwrite). */
function loadPreviousBundle(): PublishedBundle | null {
  return loadBundleAt(latestPath);
}

const MAX_GUARD_ATTEMPTS = 3;

type GenerateViewResult = {
  view: EditorialView | null;
  findings: PublishedBundle["guard"]["findings"];
  blocked: boolean;
  keptPrevious?: boolean;
  hardBlockCodes?: string[];
};

function hardBlockCodesFrom(
  findings: PublishedBundle["guard"]["findings"],
): string[] {
  return [
    ...new Set(
      findings
        .filter((f) => f.severity === "block" && hasHardPublishBlocks([f]))
        .map((f) => f.code),
    ),
  ];
}

function keepPreviousResult(
  local: PublishedBundle["guard"]["findings"],
  fallback: GenerateViewResult,
  extra?: { hardBlockCodes?: string[] },
): GenerateViewResult {
  return {
    ...fallback,
    findings: [...local, ...fallback.findings],
    keptPrevious: true,
    hardBlockCodes: extra?.hardBlockCodes ?? fallback.hardBlockCodes,
  };
}

function buildPublishableView(input: {
  briefing: BriefingDraft;
  decision: DecisionDraft;
  publishedAt: string;
  slot: PipelineSlot;
  mode: PipelineMode;
  previousView?: EditorialView;
  continuity: CarryForwardBlock | null;
}): EditorialView | null {
  const draftView: EditorialView = sanitizeEditorialView({
    briefing: {
      headline: input.briefing.headline,
      bullets: input.briefing.bullets,
      evidenceIds: input.briefing.evidenceIds,
    },
    scenarios: input.decision.scenarios,
    checkItems: input.decision.checkItems,
    publishedAt: input.publishedAt,
    slot: input.slot,
    mode: input.mode,
  });
  if (isFactsOnlyStyleView(draftView)) return null;
  if (briefingHasForbiddenSeedVoice(draftView.briefing)) return null;
  if (briefingHasForbiddenUserMeta(draftView.briefing)) return null;
  if (!draftView.briefing.bullets.length) return null;
  return {
    ...draftView,
    carryStreaks: nextCarryStreaks(input.previousView, draftView, input.continuity),
  };
}

async function generateFullView(
  snapshot: Awaited<ReturnType<typeof collectSnapshot>>,
  scope: MarketScope,
  publishedAt: string,
  slot: PipelineSlot,
  previousView?: EditorialView,
): Promise<GenerateViewResult> {
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

    // Full publish body = LLM only. Seed is never concatenated into user bullets.
    if (briefingResult.source !== "llm") {
      const fallback = resolveNonLlmBriefingView({
        snapshot,
        scope,
        publishedAt,
        slot,
        previousView,
        mode: "full",
        reason: `briefing LLM unavailable (${briefingResult.error ?? "seed"})`,
      });
      return {
        ...fallback,
        keptPrevious: Boolean(previousView?.briefing?.bullets?.length),
      };
    }

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
    // Prefer prior Decision over seed Decision essays when LLM decision fails.
    const decision =
      decisionResult.source === "llm"
        ? decisionResult.data
        : previousView?.scenarios?.length && previousView.checkItems?.length
          ? {
              scenarios: previousView.scenarios,
              checkItems: previousView.checkItems,
            }
          : decisionResult.data;
    let guard = runGuard({
      snapshot,
      briefing,
      decision,
      scope,
    });

    if (!guard.ok && attempt === MAX_GUARD_ATTEMPTS) {
      // Facts-only earnings anchors only — no instructional prose patches.
      const patched = patchBriefingForGuardRetry(briefing, snapshot, scope);
      if (patched !== briefing) {
        console.log(`  patch: facts-only earnings anchors for ${scope}`);
        briefing = patched;
        guard = runGuard({ snapshot, briefing, decision, scope });
      }
    }

    if (guard.ok) {
      findings.push(
        ...guard.findings.map((f) => ({ ...f, message: `[${scope}] ${f.message}` })),
      );
      const continuity = snapshot.evidence?.previous.continuity?.[scope] ?? null;
      const view = buildPublishableView({
        briefing,
        decision,
        publishedAt,
        slot,
        mode: "full",
        previousView,
        continuity,
      });
      if (!view) {
        const fallback = resolveNonLlmBriefingView({
          snapshot,
          scope,
          publishedAt,
          slot,
          previousView,
          mode: "full",
          reason: "guard ok but draft not publishable",
        });
        return keepPreviousResult(findings, fallback);
      }
      return { view, findings, blocked: false };
    }

    repairHints = findingsToRepairHints(guard.findings);
    console.log(
      `  guard blocked → ${attempt < MAX_GUARD_ATTEMPTS ? "retry" : "give up"}: ${repairHints.join("; ")}`,
    );
    if (attempt === MAX_GUARD_ATTEMPTS) {
      findings.push(
        ...guard.findings.map((f) => ({
          ...f,
          severity: "warn" as const,
          message: `[${scope}] guard rejected draft: ${f.message}`,
        })),
      );

      // Soft blocks only → publish last LLM draft so tab stamps stay fresh.
      // Hard integrity blocks → keep previous.
      if (hasHardPublishBlocks(guard.findings)) {
        const fallback = resolveNonLlmBriefingView({
          snapshot,
          scope,
          publishedAt,
          slot,
          previousView,
          mode: "full",
          reason: "guard hard-block after retries",
        });
        return keepPreviousResult(findings, fallback, {
          hardBlockCodes: hardBlockCodesFrom(guard.findings),
        });
      }

      const continuity = snapshot.evidence?.previous.continuity?.[scope] ?? null;
      const view = buildPublishableView({
        briefing,
        decision,
        publishedAt,
        slot,
        mode: "full",
        previousView,
        continuity,
      });
      if (!view) {
        const fallback = resolveNonLlmBriefingView({
          snapshot,
          scope,
          publishedAt,
          slot,
          previousView,
          mode: "full",
          reason: "guard soft-block but draft not publishable",
        });
        return keepPreviousResult(findings, fallback);
      }
      console.log(
        `  publish last draft after soft guard fails (${scope}) — stamps refresh`,
      );
      findings.push({
        severity: "warn",
        code: "guard-soft-publish",
        message: `[${scope}] soft guard blocks after ${MAX_GUARD_ATTEMPTS} retries — published last LLM draft`,
      });
      return { view, findings, blocked: false };
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
): Promise<GenerateViewResult> {
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

    if (briefingResult.source !== "llm") {
      console.log(`  refresh seed suppressed → keep previous ${scope}`);
      findings.push({
        severity: "warn",
        code: "llm-seed-suppressed",
        message: `[${scope}] refresh LLM unavailable — kept previous briefing`,
      });
      return { view: { ...previous }, findings, blocked: false };
    }

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
        console.log(`  patch: facts-only earnings anchors for ${scope}`);
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
      `  guard blocked → ${attempt < MAX_GUARD_ATTEMPTS ? "retry" : "soft-publish or keep"}: ${repairHints.join("; ")}`,
    );
    if (attempt === MAX_GUARD_ATTEMPTS) {
      findings.push(
        ...guard.findings.map((f) => ({
          ...f,
          severity: "warn" as const,
          message: `[${scope}] refresh skipped: ${f.message}`,
        })),
      );
      if (hasHardPublishBlocks(guard.findings)) {
        return {
          view: { ...previous },
          findings,
          blocked: false,
          keptPrevious: true,
          hardBlockCodes: hardBlockCodesFrom(guard.findings),
        };
      }
      const draft = sanitizeEditorialView({
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
      });
      if (
        isFactsOnlyStyleView(draft) ||
        briefingHasForbiddenSeedVoice(draft.briefing) ||
        briefingHasForbiddenUserMeta(draft.briefing)
      ) {
        return { view: { ...previous }, findings, blocked: false };
      }
      console.log(`  refresh soft-publish last draft (${scope})`);
      findings.push({
        severity: "warn",
        code: "guard-soft-publish",
        message: `[${scope}] refresh soft guard fails — published last LLM draft`,
      });
      return { view: draft, findings, blocked: false };
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

    const archivedPrevious = loadBundleAt(previousPath);
    let previous = loadPreviousBundle();
    if (previous) {
      previous = sanitizePublishedBundle(
        restoreRicherViewsFromArchive(previous, archivedPrevious),
      );
    }
    const targetScopes = scopesForSlot(slot);
    const retryStarted = Date.now();
    let attempt = 0;

    while (true) {
      attempt += 1;
      const publishedAt = new Date().toISOString();
      const views = {
        all: previous?.views.all,
        kr: previous?.views.kr,
        us: previous?.views.us,
      } as PublishedBundle["views"];
      const findings: PublishedBundle["guard"]["findings"] = [];

      const keptScopes: MarketScope[] = [];
      const keptCodes: string[] = [];

      for (const scope of targetScopes) {
        const generated =
          mode === "refresh"
            ? await generateRefreshView(snapshot, scope, publishedAt, slot, views[scope])
            : await generateFullView(snapshot, scope, publishedAt, slot, views[scope]);
        findings.push(...generated.findings);
        if (generated.keptPrevious) {
          keptScopes.push(scope);
          keptCodes.push(...(generated.hardBlockCodes ?? []));
        }
        const { view, blocked } = generated;
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
      console.log(
        "[pipeline] Guard",
        summarizeGuard(guard),
        `findings=${findings.length} attempt=${attempt}`,
      );
      const notable = findings.filter(
        (f) =>
          f.severity === "block" ||
          f.code === "llm-seed-suppressed" ||
          f.code === "guard-soft-publish",
      );
      for (const f of notable.slice(-8)) {
        console.log(`  ${f.severity} ${f.code}: ${f.message.slice(0, 180)}`);
      }
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

      const uniqueKeptCodes = [...new Set(keptCodes)];
      const tabFrozen = keptScopes.length > 0;
      if (
        shouldRetryTransientKeepPrevious({
          tabFrozen,
          hardBlockCodes: uniqueKeptCodes,
          findings,
          elapsedMs: Date.now() - retryStarted,
          attempt,
        })
      ) {
        console.log(
          `[pipeline] transient LLM fail — retry in ${TRANSIENT_RETRY_INTERVAL_MS / 1000}s (attempt ${attempt})`,
        );
        await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_INTERVAL_MS));
        continue;
      }

      const bundle = sanitizePublishedBundle({
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
      });

      mkdirSync(dirname(latestPath), { recursive: true });
      if (previous) {
        writeFileSync(
          previousPath,
          `${JSON.stringify(sanitizePublishedBundle(previous), null, 2)}\n`,
          "utf8",
        );
      }
      writeFileSync(latestPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
      recordStatus({
        updatedAt: publishedAt,
        slot,
        ok: !tabFrozen,
        mode,
        guardOk: !tabFrozen,
        guardSummary: tabFrozen
          ? `keep-previous ${keptScopes.join(",")}: ${uniqueKeptCodes.join(", ") || "unknown"}`
          : summarizeGuard(guard),
        error: tabFrozen
          ? `keep-previous ${keptScopes.join(",")}: ${uniqueKeptCodes.join(", ") || "unknown"}`
          : undefined,
        degraded: tabFrozen,
        keepPreviousScopes: tabFrozen ? keptScopes : undefined,
        keepPreviousCodes: tabFrozen ? uniqueKeptCodes : undefined,
      });
      console.log(`[pipeline] published → ${latestPath}`);
      console.log(`updated scopes: ${targetScopes.join(", ")} · mode=${mode}`);
      console.log(`all@${bundle.views.all.publishedAt}: ${bundle.views.all.briefing.headline}`);
      console.log(`kr@${bundle.views.kr.publishedAt}: ${bundle.views.kr.briefing.headline}`);
      console.log(`us@${bundle.views.us.publishedAt}: ${bundle.views.us.briefing.headline}`);
      break;
    }
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
