import type { BriefingDraft, CollectorSnapshot, DecisionDraft, MarketScope } from "@/lib/pipeline/types";

/**
 * Minimal earnings shape for facts-only bullets.
 * Accepts both `MarketEvent` and EvidencePack event rows (looser string unions).
 */
export type EarningsFactSource = {
  title: string;
  region?: string;
  oneLiner?: string;
  actual?: {
    revenueActualLabel?: string;
    operatingProfitActualLabel?: string;
    beatLabel?: string;
    epsActual?: number;
    epsEstimate?: number;
  };
};

/**
 * Phrases that must never appear in seed/facts-only user-facing briefing copy.
 * (Former template essay / scrub voice — published body ≠ internal seed voice.)
 */
export const FORBIDDEN_SEED_VOICE_FRAGMENTS = [
  "흔들림 원인 후보",
  "원인 후보다",
  "가늠하는 때",
  "뉴스상 실적 반응 언급",
  "같이 움직이면",
  "연결합니다",
  "겹치는 변수인지",
  "방향 예측 금지",
  "섹터 온도 점검",
  "반응만 점검",
] as const;

export function containsForbiddenSeedVoice(text: string): boolean {
  return FORBIDDEN_SEED_VOICE_FRAGMENTS.some((frag) => text.includes(frag));
}

export function briefingHasForbiddenSeedVoice(
  briefing: Pick<BriefingDraft, "headline" | "bullets">,
): boolean {
  return [briefing.headline, ...briefing.bullets].some(containsForbiddenSeedVoice);
}

function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function indexLine(
  snapshot: CollectorSnapshot,
  id: string,
  opts?: { prior?: boolean },
): string | null {
  const q = snapshot.indexes.find((x) => x.id === id);
  if (!q) return null;
  if (opts?.prior) {
    const prior = q.priorSessionChangePercent;
    if (prior == null) return null;
    return `${q.name} 전일 마감 ${formatPct(prior)}`;
  }
  const isPost = snapshot.slot === "kr-post" || snapshot.slot === "us-post";
  const label = isPost ? "마감" : "등락";
  return `${q.name} ${label} ${formatPct(q.changePercent)}`;
}

function macroLine(snapshot: CollectorSnapshot, id: string): string | null {
  const m = snapshot.macros.find((x) => x.id === id);
  if (!m) return null;
  return `${m.name} ${m.value}${m.changeLabel ? ` (${m.changeLabel})` : ""}`;
}

function flowLine(snapshot: CollectorSnapshot): string | null {
  const flow =
    snapshot.evidence?.flow?.todaySummary?.trim() ||
    snapshot.evidence?.flow?.priorDaySummary?.trim() ||
    snapshot.retailScan?.flowSummary?.trim();
  return flow || null;
}

function earningsNameCore(ev: EarningsFactSource): string {
  const raw = ev.title.split("(")[0]?.trim() ?? ev.title;
  return raw.replace(/\s*실적\s*발표\s*$/u, "").trim() || raw;
}

/** Minimal earnings fact line — numbers only, no speculative / process voice. */
export function formatFactsOnlyEarningsBullet(ev: EarningsFactSource): string {
  const name = earningsNameCore(ev);
  const a = ev.actual;
  const parts: string[] = [];
  if (a?.revenueActualLabel) parts.push(`매출 ${a.revenueActualLabel}`);
  if (a?.operatingProfitActualLabel) {
    parts.push(`영업이익 ${a.operatingProfitActualLabel}`);
  }
  if (parts.length === 0 && a?.beatLabel) {
    parts.push(`주당순이익 ${a.beatLabel}`);
  }
  if (
    parts.length === 0 &&
    a?.epsActual != null &&
    a?.epsEstimate != null
  ) {
    const region = ev.region === "KR" ? "KR" : "US";
    const fmt = (v: number) =>
      region === "KR"
        ? `${Math.round(v).toLocaleString("ko-KR")}원`
        : `$${Number(v.toFixed(2))}`;
    parts.push(`주당순이익 ${fmt(a.epsActual)} vs 예상 ${fmt(a.epsEstimate)}`);
  }
  if (parts.length > 0) {
    return `${name} 실적 발표됨 · ${parts.join(" · ")}`;
  }
  if (a || (ev.oneLiner && /발표|집계|결과/u.test(ev.oneLiner))) {
    return `${name} 실적 발표됨`;
  }
  return `${name} 실적 일정`;
}

function recentEarningsFacts(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  limit = 2,
): string[] {
  const events = snapshot.events ?? snapshot.evidence?.events ?? [];
  return events
    .filter((e) => e.kind === "earnings")
    .filter((e) => {
      if (scope === "kr") return e.region === "KR" || e.region === "GLOBAL";
      if (scope === "us") return e.region === "US" || e.region === "GLOBAL";
      return true;
    })
    .filter((e) => Boolean(e.actual) || Boolean(e.dateISO))
    .slice(0, limit)
    .map(formatFactsOnlyEarningsBullet);
}

/**
 * Facts-only briefing anchors for LLM-failure / thin fallback.
 * Never emits speculative template essays — published body must be LLM when available.
 */
export function seedBriefing(snapshot: CollectorSnapshot, scope: MarketScope): BriefingDraft {
  const isPre = snapshot.slot === "kr-pre" || snapshot.slot === "us-pre";
  const isPost = snapshot.slot === "kr-post" || snapshot.slot === "us-post";
  const market = scope === "us" ? "미국" : scope === "kr" ? "국내" : "한·미";

  const indexIds =
    scope === "us"
      ? (["nasdaq", "spx", "sox"] as const)
      : scope === "kr"
        ? (["kospi", "kosdaq"] as const)
        : (["kospi", "nasdaq"] as const);

  const indexBullets = indexIds
    .map((id) => indexLine(snapshot, id, { prior: isPre }))
    .filter((x): x is string => Boolean(x));

  const macroIds =
    scope === "us"
      ? (["us10y", "vix", "wti"] as const)
      : (["usdkkrw", "us10y", "vix", "wti"] as const);
  const macroBullets = macroIds
    .map((id) => macroLine(snapshot, id))
    .filter((x): x is string => Boolean(x))
    .slice(0, 2);

  const flow = scope === "us" ? null : flowLine(snapshot);
  const earnings = recentEarningsFacts(snapshot, scope, 2);

  // Prefer index + earnings facts; macros fill remaining slots.
  const bullets = [
    ...indexBullets.slice(0, 2),
    ...(flow ? [flow] : []),
    ...earnings,
    ...macroBullets,
  ]
    .filter(Boolean)
    .slice(0, 5);

  while (bullets.length < 3) {
    bullets.push(
      snapshot.asOfLabel
        ? `수집 기준 ${snapshot.asOfLabel}`
        : `${market} 지수·매크로 사실 앵커`,
    );
  }

  const headlineFocus = indexBullets[0] ?? `${market} 사실 요약`;
  const headline = isPre
    ? `${market} 전일 사실 · ${headlineFocus}`
    : isPost
      ? `${market} 마감 사실 · ${headlineFocus}`
      : `${market} 사실 · ${headlineFocus}`;

  return {
    headline: headline.slice(0, 64),
    bullets,
    evidenceIds:
      scope === "us" ? ["us10y", "vix", "wti"] : ["usdkkrw", "us10y", "vix"],
  };
}

/**
 * Minimal Decision scaffold when LLM fails — no speculative seed essays.
 * Prefer keep-previous Decision over this when a prior view exists.
 */
export function seedDecision(snapshot: CollectorSnapshot, scope: MarketScope): DecisionDraft {
  const kospi = snapshot.indexes.find((q) => q.id === "kospi");
  const nasdaq = snapshot.indexes.find((q) => q.id === "nasdaq");
  const sharpDrop =
    scope === "us"
      ? (nasdaq?.changePercent ?? 0) <= -2
      : (kospi?.changePercent ?? 0) <= -3;

  return {
    scenarios: [
      {
        id: "base",
        label: "A · 기본",
        title: sharpDrop ? "급변 후 관망" : "혼조 속 관망",
        summary:
          scope === "us"
            ? "미 지수·금리·VIX 숫자를 기준으로 나눕니다."
            : "국내 지수·환율·금리 숫자를 기준으로 나눕니다.",
        implication:
          scope === "us"
            ? "금리·VIX 중 더 움직인 쪽을 본다."
            : "환율·금리 중 더 움직인 쪽을 본다.",
      },
      {
        id: "risk",
        label: "B · 경계",
        title: "추가 변동성 경계",
        summary:
          scope === "us"
            ? "금리·유가·VIX가 크게 어긋나면 경계 쪽을 연다."
            : "환율·유가·VIX가 크게 어긋나면 경계 쪽을 연다.",
        implication:
          scope === "us"
            ? "보유가 금리·유가에 민감한지만 본다."
            : "보유가 환율·금리·유가에 민감한지만 본다.",
      },
    ],
    checkItems: [
      {
        id: "horizon",
        text: "오늘 판단의 시간 범위",
        why: "단기·중기를 섞으면 같은 뉴스도 해석이 갈립니다.",
      },
      {
        id: "driver",
        text: scope === "us" ? "미국 민감 변수 1개" : "국내·매크로 민감 변수 1개",
        why: "하나만 고르면 A/B 분기가 선명해집니다.",
      },
      {
        id: "other",
        text: "상대 시장은 보조로만",
        why: "초점이 흐리면 브리핑이 도움이 안 됩니다.",
      },
    ],
  };
}
