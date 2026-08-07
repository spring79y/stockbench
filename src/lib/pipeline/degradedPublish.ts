import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  EditorialView,
  GuardFinding,
  GuardReport,
  MarketScope,
  PipelineMode,
  PipelineSlot,
} from "@/lib/pipeline/types";
import {
  buildPostCloseFirstBullet,
  buildPostCloseHeadline,
  resolvePostCloseIndexes,
} from "@/lib/pipeline/sessionCloseLead";

/**
 * Final-attempt demote (block→warn): continuity / soft quality only.
 * Attempts 1–4 keep these as hard blocks.
 *
 * `earnings-reaction-omission` blocks are forceCite/mustCover (already fact-hard
 * in Guard) — never demote. Non-forceCite path is warn already.
 */
export const FINAL_ATTEMPT_DEMOTE_CODES = new Set([
  "carry-forward-omission",
  "carry-forward-no-reeval",
]);

/**
 * Never demote — fact integrity, polarity, recommend, empty, tone, etc.
 * Listed for docs/tests / ops readability.
 */
export const HARD_NEVER_DEMOTE_CODES = new Set([
  "invented-event-result",
  "unsupported-earnings-result",
  "earnings-beat-polarity",
  "unsupported-guidance-claim",
  "prior-label-mismatch",
  "prior-session-fact-mismatch",
  "recommendation-or-prediction",
  "pre-session-forecast",
  "fact-mismatch",
  "fx-mismatch",
  "evidence-missing",
  "empty-briefing",
  "slot-tone-mismatch",
  "number-restatement",
  "scope-leakage",
  "pre-missing-prior-recap",
  "pre-missing-observable-watch",
  "prior-session-without-anchor",
  "post-missing-session-recap",
  "post-missing-index-close",
  "missed-earnings",
  "earnings-reaction-omission",
]);

export const DEGRADED_LABEL = "제한 연속성";

export type FinalAttemptKind = "degraded-draft" | "thin-evidence" | "blocked";

export function demoteFinalAttemptFindings(
  findings: GuardFinding[],
): GuardFinding[] {
  return findings.map((f) => {
    if (f.severity === "block" && FINAL_ATTEMPT_DEMOTE_CODES.has(f.code)) {
      return {
        ...f,
        severity: "warn" as const,
        message: `[${DEGRADED_LABEL}] ${f.message}`,
      };
    }
    return f;
  });
}

export function hasHardBlocks(findings: GuardFinding[]): boolean {
  return findings.some((f) => f.severity === "block");
}

export function blockingCodes(findings: GuardFinding[]): string[] {
  return findings.filter((f) => f.severity === "block").map((f) => f.code);
}

/**
 * After max retries (attempt 5): demote soft continuity codes.
 * - only demoteable left → publish last draft as degraded
 * - fact-hard remains → thin Evidence publish
 * - (thin failure handled by caller) → keep-previous
 */
export function classifyFinalAttempt(report: GuardReport): {
  kind: FinalAttemptKind;
  findings: GuardFinding[];
} {
  const demoted = demoteFinalAttemptFindings(report.findings);
  if (!hasHardBlocks(demoted)) {
    return { kind: "degraded-draft", findings: demoted };
  }
  return { kind: "thin-evidence", findings: demoted };
}

function formatPct(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function marketWord(scope: MarketScope): string {
  return scope === "us" ? "미국" : scope === "kr" ? "국내" : "한·미";
}

/**
 * Evidence-anchored thin briefing — numbers/flags/schedule facts only.
 * No invented polarities; scenarios/checkItems may be empty.
 */
export function buildThinEvidenceDrafts(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
): { briefing: BriefingDraft; decision: DecisionDraft } {
  const pack = snapshot.evidence;
  const isPre = snapshot.slot === "kr-pre" || snapshot.slot === "us-pre";
  const isPost = snapshot.slot === "kr-post" || snapshot.slot === "us-post";
  const market = marketWord(scope);

  const packIndexRows =
    scope === "us"
      ? pack?.indexes.us ?? []
      : scope === "kr"
        ? pack?.indexes.kr ?? []
        : [...(pack?.indexes.kr ?? []).slice(0, 2), ...(pack?.indexes.us ?? []).slice(0, 2)];

  const snapIndexRows = (snapshot.indexes ?? [])
    .filter((q) =>
      scope === "us" ? q.region === "US" : scope === "kr" ? q.region === "KR" : true,
    )
    .slice(0, 3)
    .map((q) => ({
      id: q.id,
      name: q.name,
      changePercent: q.changePercent,
      priorSessionChangePercent: q.priorSessionChangePercent ?? null,
    }));

  const indexRows = packIndexRows.length > 0 ? packIndexRows : snapIndexRows;
  const closeRows = isPost ? resolvePostCloseIndexes(snapshot, scope) : [];
  const closeLeadBullet = isPost ? buildPostCloseFirstBullet(closeRows) : null;
  const closeIds = new Set(closeRows.map((r) => r.id));

  const indexBullets = indexRows
    .slice(0, 3)
    .map((q) => {
      const prior = formatPct(q.priorSessionChangePercent);
      const live = formatPct(q.changePercent);
      if (isPre && prior) {
        return `${q.name} 전일세션마감 ${prior} — 장중 숫자를 전일로 쓰지 않음 (Evidence 앵커).`;
      }
      // Post close lead is a dedicated first bullet — skip duplicates already covered
      if (isPost && "id" in q && typeof q.id === "string" && closeIds.has(q.id)) {
        return null;
      }
      if (isPost && live) {
        const pct = q.changePercent ?? 0;
        const dir = pct > 0.05 ? "상승" : pct < -0.05 ? "하락" : "보합";
        return `${q.name} 마감 ${dir} ${live} — Evidence 지수 사실.`;
      }
      if (prior && live) {
        return `${q.name} 전일세션 ${prior} · 현재 ${live} — Evidence 앵커.`;
      }
      if (live) return `${q.name} 현재 ${live} — Evidence 앵커.`;
      if (prior) return `${q.name} 전일세션 ${prior} — Evidence 앵커.`;
      return `${q.name} — Evidence 지수 행 있음(등락 수치 없음).`;
    })
    .filter((b): b is string => Boolean(b));

  const macroSource =
    pack?.macros ??
    (snapshot.macros ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      value: m.value,
      changeLabel: m.changeLabel,
      direction: m.direction,
    }));
  const macroBullets = macroSource
    .filter((m) =>
      scope === "us"
        ? m.id === "us10y" || m.id === "vix" || m.id === "wti"
        : m.id === "usdkkrw" || m.id === "us10y" || m.id === "vix" || m.id === "wti",
    )
    .slice(0, 2)
    .map((m) => `${m.name} ${m.value} (${m.changeLabel}) — Evidence 매크로.`);

  const eventBullets = (pack?.events ?? snapshot.events ?? [])
    .filter((ev) => {
      if (scope === "kr") return ev.region === "KR" || ev.region === "GLOBAL";
      if (scope === "us") return ev.region === "US" || ev.region === "GLOBAL";
      return true;
    })
    .slice(0, 2)
    .map((ev) => {
      const line = (ev.oneLiner || "").trim();
      // Minimal fact only — never invent beat/miss beyond Evidence oneLiner
      return line
        ? `일정 · ${ev.title}: ${line.slice(0, 72)}`
        : `일정 · ${ev.title} (Evidence 일정 앵커).`;
    });

  // KR/all: Korean cue only — never dump English geopolitics headlines.
  const riskBullet = pack?.risk?.elevated
    ? scope === "us"
      ? "리스크 elevated — 유가·VIX 점검 (Evidence · 영문 헤드라인 생략)."
      : "지정학·공급 리스크 플래그(Evidence) — 유가·환율만 짧게 연결 (영문 헤드라인 생략)."
    : null;

  const bullets = [
    ...(closeLeadBullet ? [closeLeadBullet] : []),
    ...indexBullets,
    ...macroBullets,
    ...eventBullets,
    ...(riskBullet ? [riskBullet] : []),
  ]
    .filter(Boolean)
    .slice(0, 5);

  const fallbackBullets = [
    closeLeadBullet ??
      `${market} Evidence 앵커 요약 — 지수·매크로·일정 사실만 남김 (해석 최소).`,
    snapshot.asOfLabel
      ? `수집 시각 기준: ${snapshot.asOfLabel}.`
      : "슬롯 시각 갱신용 최소 브리핑.",
    "시나리오·오늘 볼 것은 이번 슬롯에서 생략(제한 연속성).",
  ];

  const evidenceIds = [
    ...(macroBullets.length
      ? (pack?.macros ?? [])
          .filter((m) => macroBullets.some((b) => b.includes(m.name)))
          .map((m) => m.id)
      : []),
  ].slice(0, 4);

  const headline = isPre
    ? `${market} 전일 앵커 · 최소 Evidence 브리핑`
    : isPost
      ? buildPostCloseHeadline(closeRows, market)
      : `${market} Evidence 앵커 · 최소 브리핑`;

  return {
    briefing: {
      headline,
      bullets: bullets.length >= 2 ? bullets : fallbackBullets,
      evidenceIds:
        evidenceIds.length > 0
          ? evidenceIds
          : scope === "us"
            ? ["us10y", "vix"]
            : ["usdkkrw", "vix"],
    },
    // Locked: scenarios/checkItems may be empty on thin path
    decision: { scenarios: [], checkItems: [] },
  };
}

/** Decision-shape codes ignored when publishing thin Evidence (empty A/B OK). */
export const THIN_IGNORED_DECISION_CODES = new Set([
  "scenario-count",
  "scenario-summary-long",
  "scenario-implication-long",
  "checklist-count",
  "check-why-long",
  "empty-checklist",
]);

export function filterThinGuardFindings(findings: GuardFinding[]): GuardFinding[] {
  return findings.filter((f) => !THIN_IGNORED_DECISION_CODES.has(f.code));
}

export function markDegradedView(
  view: EditorialView,
  kind: "degraded-draft" | "thin-evidence",
): EditorialView {
  const note =
    kind === "thin-evidence"
      ? `${DEGRADED_LABEL} · Evidence 앵커`
      : DEGRADED_LABEL;
  const changeLines = [note, ...(view.changeLines ?? [])].slice(0, 3);
  return {
    ...view,
    degraded: true,
    degradedLabel: note,
    changeLines,
  };
}

export function appendDegradedAsOf(asOfLabel: string, degraded: boolean): string {
  if (!degraded) return asOfLabel;
  if (asOfLabel.includes(DEGRADED_LABEL)) return asOfLabel;
  return `${asOfLabel} · ${DEGRADED_LABEL}`;
}

export function summarizeDegradedPublish(input: {
  degraded: boolean;
  findings: GuardFinding[];
  thin?: boolean;
}): string {
  const soft = input.findings
    .filter(
      (f) =>
        f.severity === "warn" &&
        (FINAL_ATTEMPT_DEMOTE_CODES.has(f.code) ||
          f.message.includes(DEGRADED_LABEL)),
    )
    .map((f) => f.code);
  const uniq = [...new Set(soft)].slice(0, 4);
  const softPart = uniq.length ? uniq.join(", ") : "soft-warn";
  if (input.thin) return `degraded-thin · ${softPart}`;
  if (input.degraded) return `degraded · ${softPart}`;
  return softPart;
}

export function buildDegradedEditorialView(input: {
  briefing: BriefingDraft;
  decision: DecisionDraft;
  publishedAt: string;
  slot: PipelineSlot;
  mode: PipelineMode;
  kind: "degraded-draft" | "thin-evidence";
  carryStreaks?: EditorialView["carryStreaks"];
}): EditorialView {
  const draft: EditorialView = {
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
    carryStreaks: input.carryStreaks,
  };
  return markDegradedView(draft, input.kind);
}
