/**
 * Attach short event-dedicated scan fields (Collector templates + Evidence news).
 * Accuracy > volume: no invented results, no buy/sell, max 2 bullets for meaning/reaction.
 */
import {
  LABEL_EPS_EXPECTED,
  LABEL_OP_EXPECTED,
  LABEL_REVENUE_EXPECTED,
  revenueOpActualFactPhrase,
  revenueOpFactPhrase,
} from "@/lib/events/earningsCopy";
import { earningsResultOneLiner } from "@/lib/market/earningsBeat";
import {
  PENDING_RESULT_ONELINER,
  hasStructuredEarningsActual,
  isEarningsAnnounced,
  isPendingResultOneLiner,
} from "@/lib/market/earningsAnnounced";
import type { EventDetailSummary, MarketEvent } from "@/lib/types";

const MAX_BULLETS = 2;

/** Type-based pre 「의미」 — one line preferred; no psych invention. */
const MACRO_MEANING: Record<string, string> = {
  nfp: "고용·임금 숫자로 금리 기대와 달러·미 지수 온도를 점검하는 일정입니다.",
  cpi: "물가 흐름을 확인하는 일정으로, 금리 인하 기대 변화를 점검합니다.",
  "krx-option": "만기 전후 수급·변동성이 커질 수 있어, 재료보다 흔들림을 먼저 봅니다.",
  "fomc-minutes": "이미 끝난 회의의 논의 톤을 확인하는 일정입니다. 새 정보가 적으면 반응도 작을 수 있습니다.",
  fomc: "연준 금리 결정과 성명 톤을 확인하는 일정입니다. 방향 예측이 아니라 변동성 점검용입니다.",
};

const PRICE_REACTION_RE =
  /주가|급등|급락|하락|상승|반등|약세|강세|낙폭|오름|내림|변동성|흔들|반응|서킷|상한가|하한가/i;

function joinBullets(lines: string[]): string | undefined {
  const cleaned = lines.map((s) => s.trim()).filter(Boolean).slice(0, MAX_BULLETS);
  if (cleaned.length === 0) return undefined;
  return cleaned.join("\n");
}

function expectationFor(event: MarketEvent): string | undefined {
  if (event.kind === "earnings") {
    const c = event.consensus;
    if (!c) return undefined;
    if (c.revenueLabel && c.operatingProfitLabel) {
      return revenueOpFactPhrase(c.revenueLabel, c.operatingProfitLabel);
    }
    const parts: string[] = [];
    if (c.revenueLabel) parts.push(`${LABEL_REVENUE_EXPECTED} ${c.revenueLabel}`);
    if (c.operatingProfitLabel) parts.push(`${LABEL_OP_EXPECTED} ${c.operatingProfitLabel}`);
    if (c.epsLabel) parts.push(`${LABEL_EPS_EXPECTED} ${c.epsLabel}`);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }
  // Macros: keep schedule oneLiner as expectation hint when it is not a result line.
  if (event.oneLiner && !isPendingResultOneLiner(event.oneLiner)) {
    return event.oneLiner;
  }
  return undefined;
}

function meaningFor(event: MarketEvent): string | undefined {
  if (event.kind === "earnings") {
    const name = event.title.replace(/\s*실적\s*발표$/, "") || "해당 기업";
    if (event.consensus?.operatingProfitLabel) {
      return joinBullets([
        `${name} 분기 실적 — 매출·영업이익(회사 규모)을 먼저 보고 EPS는 보조로 점검합니다.`,
        "시장 예상 대비 여부는 점검용이며 매수·매도 신호가 아닙니다.",
      ]);
    }
    return joinBullets([
      `${name} 분기 실적 발표 일정입니다. 시장 예상과 발표 숫자를 같은 단위로 비교해 점검합니다.`,
      "맞히기보다 민감도 확인용입니다.",
    ]);
  }
  const byId = MACRO_MEANING[event.id];
  if (byId) return byId;
  if (event.kind === "macro") {
    return "시장 온도를 흔들 수 있는 매크로 일정입니다. 숫자를 맞히기보다 왜 보는지 짧게 정리합니다.";
  }
  return "시장에 영향을 줄 수 있는 일정입니다. 예측이 아니라 점검 포인트로 보세요.";
}

function resultFor(event: MarketEvent, now: Date): string | undefined {
  if (event.kind === "earnings") {
    const a = event.actual;
    if (hasStructuredEarningsActual(a) && a) {
      const company = revenueOpActualFactPhrase({
        revenueLabel: a.revenueActualLabel,
        opLabel: a.operatingProfitActualLabel,
      });
      return earningsResultOneLiner(a.beatLabel, {
        epsActual: a.epsActual,
        epsEstimate: a.epsEstimate,
        region: event.region === "KR" ? "KR" : "US",
        companyScaleActualLine: company,
      });
    }
    if (isPendingResultOneLiner(event.oneLiner) || isEarningsAnnounced(event, now)) {
      return PENDING_RESULT_ONELINER;
    }
    return undefined;
  }
  // Macros: no invented prints — only if oneLiner already encodes a clear post fact.
  if (/발표됨|결과|실제|확정/.test(event.oneLiner) && !/예정|앞두/.test(event.oneLiner)) {
    return event.oneLiner;
  }
  return undefined;
}

function reactionBulletsFromNews(event: MarketEvent): string[] {
  const news = event.contextNews ?? [];
  return news.slice(0, MAX_BULLETS).map((n) => n.snippet || n.title);
}

function reactionFor(event: MarketEvent, now: Date, post: boolean): string | undefined {
  if (!post) return undefined;
  const bullets = reactionBulletsFromNews(event);
  if (bullets.length > 0) return joinBullets(bullets);
  return "반응 근거 부족";
}

function implicationFor(event: MarketEvent, post: boolean): string | undefined {
  if (!post) return undefined;
  const news = event.contextNews ?? [];
  if (news.length === 0) return undefined;

  const lines: string[] = [];
  const priceCue = news.find((n) => PRICE_REACTION_RE.test(`${n.title} ${n.snippet}`));
  if (priceCue) {
    lines.push(
      `관련 헤드라인에 등락·반응 언급이 있습니다: ${priceCue.snippet || priceCue.title}`,
    );
  }
  if (event.kind === "earnings") {
    lines.push("발표 숫자는 참고용이며, 주가 방향을 단정하지 마세요.");
  } else {
    lines.push("매크로 일정 반응은 참고용이며, 매수·매도 신호가 아닙니다.");
  }
  return joinBullets(lines);
}

export function buildEventDetailSummary(
  event: MarketEvent,
  now: Date = new Date(),
): EventDetailSummary {
  const post =
    event.kind === "earnings"
      ? isEarningsAnnounced(event, now) || hasStructuredEarningsActual(event.actual)
      : Boolean(resultFor(event, now));

  const summary: EventDetailSummary = {};
  const expectation = expectationFor(event);
  const meaning = meaningFor(event);
  if (expectation) summary.expectation = expectation;
  if (meaning) summary.meaning = meaning;

  if (post) {
    const result = resultFor(event, now);
    const reaction = reactionFor(event, now, post);
    const implication = implicationFor(event, post);
    if (result) summary.result = result;
    if (reaction) summary.reaction = reaction;
    if (implication) summary.implication = implication;
  }

  return summary;
}

/** Attach / refresh detailSummary on every event (sparse; never invent numbers). */
export function attachEventDetailSummaries(
  events: MarketEvent[],
  now: Date = new Date(),
): MarketEvent[] {
  return events.map((ev) => {
    const detailSummary = buildEventDetailSummary(ev, now);
    if (
      ev.detailSummary?.expectation === detailSummary.expectation &&
      ev.detailSummary?.meaning === detailSummary.meaning &&
      ev.detailSummary?.result === detailSummary.result &&
      ev.detailSummary?.reaction === detailSummary.reaction &&
      ev.detailSummary?.implication === detailSummary.implication
    ) {
      return ev;
    }
    return { ...ev, detailSummary };
  });
}
