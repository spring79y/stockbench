/**
 * Ant-facing briefing copy only.
 * Internal Guard/Evidence/prompt language must never be assembled here —
 * those stay in prompts, repair hints, and ops badges.
 */
import {
  contextNewsSuggestsPrinted,
  hasStructuredEarningsActual,
  isEarningsAnnounced,
  isEarningsSameKstDay,
  isPendingResultOneLiner,
} from "@/lib/market/earningsAnnounced";
import type { MarketEvent } from "@/lib/types";
import type { CollectorSnapshot, MarketScope } from "@/lib/pipeline/types";
import {
  buildPostCloseFirstBullet,
  type CloseIndexRow,
} from "@/lib/pipeline/sessionCloseLead";

export function formatUserCloseBullet(rows: CloseIndexRow[]): string | null {
  return buildPostCloseFirstBullet(rows);
}

export function formatUserRiskBullet(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
): string | null {
  if (!snapshot.evidence?.risk?.elevated) return null;
  const wti = snapshot.macros.find((m) => m.id === "wti");
  const oil = wti?.value ?? "WTI";
  return scope === "us"
    ? `유가(${oil})·VIX가 같이 움직이면 지정학·공급 이슈가 흔들림 원인 후보다.`
    : `유가(${oil})·환율·VIX가 같이 움직이면 지정학·공급 이슈가 흔들림 원인 후보다.`;
}

/** Elevated-risk thin/seed line when WTI value is unknown. */
export function formatUserRiskCue(scope: MarketScope): string {
  return scope === "us"
    ? "유가·VIX가 같이 움직이면 지정학·공급 이슈가 흔들림 원인 후보다."
    : "유가·환율·VIX가 같이 움직이면 지정학·공급 이슈가 흔들림 원인 후보다.";
}

/** Post/mid so-what: prefer live 수급/시총 facts when present. */
export function formatUserSessionSoWhat(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
): string {
  const flow =
    snapshot.evidence?.flow?.todaySummary?.trim() ||
    snapshot.evidence?.flow?.priorDaySummary?.trim() ||
    snapshot.retailScan?.flowSummary?.trim();
  if (flow && scope !== "us") return flow;

  const mega = snapshot.evidence?.megaCaps?.summary?.trim();
  if (mega && scope === "us") return mega;

  if (scope === "us") {
    return "금리·VIX와 메가캡이 지수와 같은 방향이었는지가 체감 차이를 가른다.";
  }
  return "외국인·기관 수급과 코스피200이 지수와 같은 방향이었는지가 체감 차이를 가른다.";
}

function earningsNameCore(ev: MarketEvent): string {
  const raw = ev.title.split("(")[0]?.trim() ?? ev.title;
  return raw.replace(/\s*실적\s*발표\s*$/u, "").trim() || raw;
}

function hasEarningsContextNews(ev: MarketEvent): boolean {
  return (ev.contextNews?.length ?? 0) > 0;
}

function mustNotSayImminentEarnings(ev: MarketEvent, now: Date): boolean {
  if (hasStructuredEarningsActual(ev.actual)) return true;
  if (isPendingResultOneLiner(ev.oneLiner)) return true;
  if (!ev.dateISO) return false;
  return (
    isEarningsSameKstDay(ev.dateISO, now) && isEarningsAnnounced(ev, now)
  );
}

function formatOpRevenueActualCue(ev: MarketEvent): string | null {
  const a = ev.actual;
  if (!a) return null;
  const parts: string[] = [];
  if (a.revenueActualLabel) parts.push(`매출 ${a.revenueActualLabel}`);
  if (a.operatingProfitActualLabel) {
    parts.push(`영업이익 ${a.operatingProfitActualLabel}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** OP/매출 actual vs consensus — ant-facing 예상 대비. */
function opRevenueVsEstimateCue(ev: MarketEvent): string | null {
  const a = ev.actual;
  const c = ev.consensus;
  if (!a || !c) return null;
  const compare = (
    actual: number | undefined,
    estimate: number | undefined,
  ): "상회" | "하회" | "비슷" | null => {
    if (
      actual == null ||
      estimate == null ||
      !Number.isFinite(actual) ||
      !Number.isFinite(estimate)
    ) {
      return null;
    }
    const tol = Math.max(Math.abs(estimate) * 0.02, 1);
    if (Math.abs(actual - estimate) <= tol) return "비슷";
    return actual > estimate ? "상회" : "하회";
  };
  const op = compare(a.operatingProfitActual, c.operatingProfitAvg);
  if (op === "상회") return "시장 예상 상회";
  if (op === "하회") return "시장 예상 하회";
  if (op === "비슷") return "시장 예상과 비슷";
  const rev = compare(a.revenueActual, c.revenueAvg);
  if (rev === "상회") return "시장 예상 상회";
  if (rev === "하회") return "시장 예상 하회";
  if (rev === "비슷") return "시장 예상과 비슷";
  return null;
}

/** Short news so-what — never Evidence / 점검 instruction tone. */
function shortEarningsNewsSoWhat(ev: MarketEvent): string | null {
  const news = ev.contextNews ?? [];
  if (news.length === 0) return null;
  const blob = news.map((n) => `${n.title ?? ""} ${n.snippet ?? ""}`).join(" ");
  const cues: string[] = [];
  if (/AI|인공지능/i.test(blob)) {
    cues.push(/투자|팩토리|비용/i.test(blob) ? "AI·비용" : "AI");
  }
  if (
    /이익\s*둔화|이익은\s*'?희비|영업이익.{0,16}희비|수익.{0,8}둔화|가이던스.{0,8}(하회|실망|soft)|outlook.{0,10}(miss|soft|weak)|disappoint/i.test(
      blob,
    )
  ) {
    cues.push("이익 둔화");
  } else if (/가이던스|전망|guidance|outlook/i.test(blob)) {
    cues.push("가이던스");
  }
  if (cues.length > 0) return `뉴스상 ${cues.join("·")} 언급`;
  return "뉴스상 실적 반응 언급";
}

function isPostEarningsResult(ev: MarketEvent, now: number): boolean {
  const nowDate = new Date(now);
  if (mustNotSayImminentEarnings(ev, nowDate)) return true;
  if (!ev.dateISO) return Boolean(ev.actual?.beatLabel || formatOpRevenueActualCue(ev));
  const hours = (new Date(ev.dateISO).getTime() - now) / (60 * 60 * 1000);
  const sameDay = isEarningsSameKstDay(ev.dateISO, nowDate);
  const announced = isEarningsAnnounced(ev, nowDate);
  const hasActual = hasStructuredEarningsActual(ev.actual);
  const withinPostHorizon =
    sameDay ||
    (hours < 0 && hours >= -36) ||
    (hours >= 0 && hours <= 12 && announced) ||
    (hasActual && hours >= -36 && hours <= 48);
  return (
    (announced && withinPostHorizon) ||
    (hasActual && (sameDay || (hours >= -36 && hours <= 48)))
  );
}

/**
 * Guard/seed earnings bullet — user prose only.
 * Never emits Evidence / 예측 금지 / forceCite lecture suffixes.
 */
export function formatUserEarningsBullet(
  ev: MarketEvent,
  now: number = Date.now(),
): string {
  const nameCore = earningsNameCore(ev);
  const nowDate = new Date(now);
  const news = hasEarningsContextNews(ev);
  const newsSoWhat = shortEarningsNewsSoWhat(ev);
  const postish =
    mustNotSayImminentEarnings(ev, nowDate) || isPostEarningsResult(ev, now);

  if (postish) {
    if (ev.actual?.beatLabel) {
      const tail = newsSoWhat ? `. ${newsSoWhat}` : "";
      return `${nameCore} 실적 발표됨 · 주당순이익 ${ev.actual.beatLabel}${tail}`;
    }
    if (ev.actual?.epsActual != null && ev.actual?.epsEstimate != null) {
      const a = ev.actual.epsActual;
      const est = ev.actual.epsEstimate;
      const region = ev.region === "KR" ? "KR" : "US";
      const fmt = (v: number) =>
        region === "KR"
          ? `${Math.round(v).toLocaleString("ko-KR")}원`
          : `$${Number(v.toFixed(2))}`;
      const base = `${nameCore} 실적 발표됨 · 주당순이익(EPS) ${fmt(a)} vs 예상 ${fmt(est)}`;
      if (newsSoWhat) return `${base}. ${newsSoWhat}`;
      return news ? `${base}. 뉴스상 가이던스·반응 언급` : `${base} — 반응 근거 부족`;
    }
    const opRev = formatOpRevenueActualCue(ev);
    if (opRev) {
      const vs = opRevenueVsEstimateCue(ev);
      const fact = vs ? `${opRev}(${vs})` : opRev;
      if (newsSoWhat) return `${nameCore} 실적 발표됨 · ${fact}. ${newsSoWhat}`;
      return news
        ? `${nameCore} 실적 발표됨 · ${fact}. 뉴스상 가이던스·반응 언급`
        : `${nameCore} 실적 발표됨 · ${fact}`;
    }
    if (
      isPendingResultOneLiner(ev.oneLiner) ||
      contextNewsSuggestsPrinted(ev.contextNews)
    ) {
      if (newsSoWhat) {
        return `${nameCore} 실적 발표됨 · 결과 집계 대기. ${newsSoWhat}`;
      }
      return news
        ? `${nameCore} 실적 발표됨 · 결과 집계 대기. 뉴스상 가이던스·반응 언급`
        : `${nameCore} 실적 발표됨 · 반응 근거 부족`;
    }
    return `${nameCore} 실적 발표됨`;
  }

  if (news) {
    return `${nameCore} 실적 임박 — 시장 예상·섹터 맥락`;
  }
  return `${nameCore} 실적 발표 임박`;
}
