/**
 * Collector → Briefing(LLM) → Decision(LLM) → Guard → Publisher
 * 실행: npm run pipeline -- kr-post
 *
 * 슬롯별로 갱신하는 탭이 다름:
 * - kr-pre/kr-post → all + kr
 * - us-pre/us-post → all + us
 * 나머지 탭은 직전 latest.json 유지 (탭별 publishedAt 분리)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectSnapshot,
  defaultPipelineEvents,
} from "../src/lib/pipeline/collectSnapshot";
import { runGuard } from "../src/lib/pipeline/guard";
import { resolveLlmConfig } from "../src/lib/pipeline/llm";
import { runBriefingAgent } from "../src/lib/pipeline/runBriefingAgent";
import { runDecisionAgent } from "../src/lib/pipeline/runDecisionAgent";
import { scopesForSlot } from "../src/lib/pipeline/schedule";
import type {
  EditorialView,
  MarketScope,
  PipelineSlot,
  PublishedBundle,
} from "../src/lib/pipeline/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = join(root, "src/data/published/latest.json");

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

async function generateView(
  snapshot: Awaited<ReturnType<typeof collectSnapshot>>,
  scope: MarketScope,
  publishedAt: string,
  slot: PipelineSlot,
): Promise<{ view: EditorialView; findings: PublishedBundle["guard"]["findings"] }> {
  let repairHints: string[] | undefined;
  const findings: PublishedBundle["guard"]["findings"] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(
      `[pipeline] Briefing scope=${scope}${attempt > 1 ? ` retry=${attempt}` : ""}`,
    );
    const briefingResult = await runBriefingAgent(snapshot, scope, repairHints);
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

    const guard = runGuard({
      snapshot,
      briefing: briefingResult.data,
      decision: decisionResult.data,
    });

    if (guard.ok || attempt === 2) {
      findings.push(
        ...guard.findings.map((f) => ({ ...f, message: `[${scope}] ${f.message}` })),
      );
      return {
        view: {
          briefing: {
            headline: briefingResult.data.headline,
            bullets: briefingResult.data.bullets,
            evidenceIds: briefingResult.data.evidenceIds,
          },
          scenarios: decisionResult.data.scenarios,
          checkItems: decisionResult.data.checkItems,
          publishedAt,
          slot,
        },
        findings,
      };
    }

    repairHints = guard.findings.map((f) => f.message);
    console.log(`  guard blocked → retry once: ${repairHints.join("; ")}`);
  }

  throw new Error(`failed to generate view for ${scope}`);
}

async function main() {
  const slot = (process.argv[2] as PipelineSlot) || "kr-post";
  if (!["kr-pre", "kr-post", "us-pre", "us-post"].includes(slot)) {
    console.error(`Unknown slot: ${slot}`);
    process.exit(1);
  }

  const llm = resolveLlmConfig();
  console.log(
    `[pipeline] llm=${llm.provider}${llm.provider === "none" ? " (seed fallback)" : ` model=${llm.model}`}`,
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
    const { view, findings: scopeFindings } = await generateView(
      snapshot,
      scope,
      publishedAt,
      slot,
    );
    views[scope] = view;
    findings.push(...scopeFindings);
  }

  // 이전 탭에 publishedAt이 없으면 번들 시각으로 보정
  (["all", "kr", "us"] as MarketScope[]).forEach((scope) => {
    const v = views[scope];
    if (!v) return;
    if (!v.publishedAt) {
      views[scope] = {
        ...v,
        publishedAt: previous?.publishedAt ?? publishedAt,
        slot: previous?.slot ?? slot,
      };
    }
  });

  if (!views.all || !views.kr || !views.us) {
    console.error("[pipeline] missing views — run once with a full seed first");
    // 첫 발행이면 누락 스코프도 생성
    for (const scope of ["all", "kr", "us"] as MarketScope[]) {
      if (!views[scope]) {
        const { view, findings: scopeFindings } = await generateView(
          snapshot,
          scope,
          publishedAt,
          slot,
        );
        views[scope] = view;
        findings.push(...scopeFindings);
      }
    }
  }

  const guard = {
    ok: findings.every((f) => f.severity !== "block"),
    findings,
  };
  console.log("[pipeline] Guard", JSON.stringify(guard, null, 2));
  if (!guard.ok) {
    console.error("[pipeline] blocked by guard");
    process.exit(1);
  }

  const bundle: PublishedBundle = {
    version: 2,
    slot,
    publishedAt,
    source: "pipeline",
    market: {
      temperature: snapshot.temperature,
      mood: snapshot.mood,
      moodLabel: snapshot.moodLabel,
      asOfLabel: snapshot.asOfLabel,
    },
    views: views as PublishedBundle["views"],
    events: snapshot.events ?? defaultPipelineEvents(),
    guard,
  };

  mkdirSync(dirname(latestPath), { recursive: true });
  writeFileSync(latestPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  console.log(`[pipeline] published → ${latestPath}`);
  console.log(`updated scopes: ${targetScopes.join(", ")}`);
  console.log(`all@${bundle.views.all.publishedAt}: ${bundle.views.all.briefing.headline}`);
  console.log(`kr@${bundle.views.kr.publishedAt}: ${bundle.views.kr.briefing.headline}`);
  console.log(`us@${bundle.views.us.publishedAt}: ${bundle.views.us.briefing.headline}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
