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

/** Type-based pre 「의미」 — “점검 포인트는 ○○” (단정금지 보일러플레이트 금지). */
const MACRO_MEANING: Record<string, string> = {
  nfp: "점검 포인트는 고용·임금 숫자와 금리·달러·미 지수 온도입니다.",
  cpi: "점검 포인트는 물가 흐름과 금리 인하 기대 변화입니다.",
  "krx-option": "점검 포인트는 만기 전후 수급·변동성(재료보다 흔들림)입니다.",
  "fomc-minutes": "점검 포인트는 이미 끝난 회의의 논의 톤입니다.",
  fomc: "점검 포인트는 연준 금리 결정과 성명 톤입니다.",
};

const PRICE_REACTION_RE =
  /주가|급등|급락|하락|상승|반등|약세|강세|낙폭|오름|내림|변동성|흔들|반응|서킷|상한가|하한가/i;

function joinBullets(lines: string[]): string | undefined {
  const cleaned = lines.map((s) => s.trim()).filter(Boolean).slice(0, MAX_BULLETS);
  if (cleaned.length === 0) return undefined;
  return cleaned.join("\n");
}

function clipFact(text: string, max = 72): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
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
      return `점검 포인트는 ${name} 매출·영업이익(회사 규모)과 시장 예상 대비입니다.`;
    }
    return `점검 포인트는 ${name} 발표 숫자와 시장 예상을 같은 단위로 비교하는 것입니다.`;
  }
  const byId = MACRO_MEANING[event.id];
  if (byId) return byId;
  if (event.kind === "macro") {
    return "점검 포인트는 발표 숫자와 금리·환율·지수 온도입니다.";
  }
  return `점검 포인트는 ${event.title} 전후 시장 온도입니다.`;
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

/** Evidence 뉴스(+숫자) → 사실→반응 1~2문장 (헤드라인 덤프·단정금지 보일러플레이트 금지). */
function reactionFor(
  event: MarketEvent,
  now: Date,
  post: boolean,
): string | undefined {
  if (!post) return undefined;
  const news = event.contextNews ?? [];
  if (news.length === 0) return "반응 근거 부족";

  const lines: string[] = [];
  const primary = news[0]!;
  const newsFact = clipFact(primary.snippet || primary.title);
  const result = resultFor(event, now);
  const resultFact =
    result && result !== PENDING_RESULT_ONELINER ? clipFact(result, 64) : undefined;

  if (resultFact) {
    lines.push(`${resultFact} 이후 — ${newsFact} 쪽 시장 반응으로 확인됩니다.`);
  } else {
    lines.push(`${newsFact} — 발표 직후 시장 반응으로 확인됩니다.`);
  }

  const priceCue = news.find((n) => PRICE_REACTION_RE.test(`${n.title} ${n.snippet}`));
  if (priceCue) {
    const priceFact = clipFact(priceCue.snippet || priceCue.title);
    if (priceFact !== newsFact) {
      lines.push(`${priceFact} 흐름이 함께 언급됩니다.`);
    }
  } else if (news[1]) {
    const second = clipFact(news[1].snippet || news[1].title);
    if (second !== newsFact) lines.push(second);
  }

  return joinBullets(lines);
}

/** Evidence 있을 때 — “점검 포인트는 ○○”. 단정금지·추천 보일러플레이트 없음. */
function implicationFor(event: MarketEvent, post: boolean): string | undefined {
  if (!post) return undefined;
  const news = event.contextNews ?? [];
  if (news.length === 0) return undefined;

  const lines: string[] = [];
  if (event.kind === "earnings") {
    const name = event.title.replace(/\s*실적\s*발표$/, "") || "해당 기업";
    lines.push(
      `점검 포인트는 ${name} 주가·섹터 반응이 발표 숫자와 같은 방향인지입니다.`,
    );
  } else {
    lines.push("점검 포인트는 금리·달러·지수 온도가 발표 숫자와 어떻게 맞춰 가는지입니다.");
  }

  const priceCue = news.find((n) => PRICE_REACTION_RE.test(`${n.title} ${n.snippet}`));
  if (priceCue) {
    lines.push(
      `관련 보도 단서: ${clipFact(priceCue.snippet || priceCue.title, 88)}`,
    );
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
