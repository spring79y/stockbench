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
import { earningsResultOneLiner, nearlyEqual } from "@/lib/market/earningsBeat";
import {
  PENDING_RESULT_ONELINER,
  hasStructuredEarningsActual,
  isEarningsAnnounced,
  isPendingResultOneLiner,
} from "@/lib/market/earningsAnnounced";
import type {
  EarningsContextNewsItem,
  EventDetailSummary,
  MarketEvent,
} from "@/lib/types";

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

const BUY_SELL_RE = /매수|매도|사세요|파세요|추천/;

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

function vsEstimatePhrase(
  actual: number | undefined,
  estimate: number | undefined,
  label: string,
): string | undefined {
  if (
    actual == null ||
    estimate == null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(estimate)
  ) {
    return undefined;
  }
  // 「은/이」: 매출·영업이익 both take 이 in this template (…이 시장 예상을 …).
  if (nearlyEqual(actual, estimate, 0.02, 0.05)) {
    return `${label}이 시장 예상과 비슷한 수준`;
  }
  return actual > estimate
    ? `${label}이 시장 예상을 상회`
    : `${label}이 시장 예상을 하회`;
}

/**
 * Evidence numbers only — no invented %; prefer OP → 매출 → beatLabel.
 * Never reuse raw oneLiner (UI would fragment on 「 · 」).
 */
function earningsFactSentence(event: MarketEvent): string | undefined {
  const a = event.actual;
  const c = event.consensus;
  if (!a) return undefined;

  const opVs = vsEstimatePhrase(
    a.operatingProfitActual,
    c?.operatingProfitAvg,
    "영업이익",
  );
  if (opVs) {
    const scale = a.operatingProfitActualLabel
      ? ` (${a.operatingProfitActualLabel})`
      : "";
    const verb = opVs.endsWith("수준") ? "입니다" : "했습니다";
    return `${opVs}${verb}${scale}.`;
  }

  const revVs = vsEstimatePhrase(a.revenueActual, c?.revenueAvg, "매출");
  if (revVs) {
    const scale = a.revenueActualLabel ? ` (${a.revenueActualLabel})` : "";
    const verb = revVs.endsWith("수준") ? "입니다" : "했습니다";
    return `${revVs}${verb}${scale}.`;
  }

  if (a.beatLabel === "미스") {
    return "주당순이익(EPS)이 시장 예상 대비 미스였습니다.";
  }
  if (a.beatLabel === "서프라이즈") {
    return "주당순이익(EPS)이 시장 예상 대비 서프라이즈였습니다.";
  }

  const company = revenueOpActualFactPhrase({
    revenueLabel: a.revenueActualLabel,
    opLabel: a.operatingProfitActualLabel,
  });
  if (company) {
    // Strip middle-dot separators so scan bullets stay intact.
    const plain = company
      .replace(/\s*·\s*/g, ", ")
      .replace(/^발표됨,\s*/, "발표 숫자: ");
    return `${plain}.`;
  }
  return undefined;
}

function usableContextNews(
  news: EarningsContextNewsItem[] | undefined,
): EarningsContextNewsItem[] {
  if (!news?.length) return [];
  return news.filter((n) => {
    const text = `${n.title ?? ""} ${n.snippet ?? ""}`.replace(/\s+/g, " ").trim();
    if (text.length < 8) return false;
    if (BUY_SELL_RE.test(text)) return false;
    return true;
  });
}

/** Light template cues from Evidence headlines — no invented %. */
function newsReactionSummary(news: EarningsContextNewsItem[]): string | undefined {
  if (news.length === 0) return undefined;
  const blob = news.map((n) => `${n.title} ${n.snippet}`).join(" ");
  const cues: string[] = [];

  if (/AI|인공지능|에이아이/i.test(blob) && /투자|팩토리|factory/i.test(blob)) {
    cues.push("AI 투자");
  } else if (/AI|인공지능/i.test(blob)) {
    cues.push("AI 관련 이슈");
  }

  if (
    /이익\s*주춤|이익은\s*멈|이익\s*둔화|영업이익.{0,8}부진|수익.{0,6}둔화|명암|실망|가이던스.{0,6}하회|outlook.{0,8}miss/i.test(
      blob,
    )
  ) {
    cues.push("이익·가이던스 둔화");
  } else if (/가이던스|전망|outlook|guidance/i.test(blob)) {
    cues.push("가이던스·전망");
  }

  if (PRICE_REACTION_RE.test(blob)) {
    if (/급락|하락|약세|하한가|낙폭|내림/.test(blob)) cues.push("주가 약세 보도");
    else if (/급등|상승|강세|상한가|오름|반등/.test(blob)) cues.push("주가 강세 보도");
    else cues.push("주가 반응 보도");
  }

  if (cues.length > 0) {
    const joined =
      cues.length === 1
        ? cues[0]!
        : cues.length === 2
          ? `${cues[0]}와 ${cues[1]}`
          : `${cues.slice(0, -1).join(", ")}, ${cues[cues.length - 1]}`;
    return `뉴스에서는 ${joined} 흐름이 함께 언급됩니다.`;
  }

  const primary = clipFact(news[0]!.snippet || news[0]!.title, 56);
  if (!primary) return undefined;
  return `뉴스에서는 「${primary}」 등 발표 직후 보도가 확인됩니다.`;
}

/**
 * Evidence 뉴스(+숫자) → 사실→반응 1~2문장.
 * oneLiner 분할·헤드라인 덤프·% 창작·매수/매도 금지.
 */
function reactionFor(
  event: MarketEvent,
  now: Date,
  post: boolean,
): string | undefined {
  if (!post) return undefined;
  const news = usableContextNews(event.contextNews);
  if (news.length === 0) return undefined;

  const newsLine = newsReactionSummary(news);
  if (!newsLine) return undefined;

  if (event.kind === "earnings") {
    const fact = earningsFactSentence(event);
    if (fact) return joinBullets([fact, newsLine]);
    const pending =
      isPendingResultOneLiner(event.oneLiner) ||
      resultFor(event, now) === PENDING_RESULT_ONELINER;
    if (pending) {
      return joinBullets([`결과 숫자 집계 대기입니다.`, newsLine]);
    }
    return joinBullets([newsLine]);
  }

  const result = resultFor(event, now);
  const resultFact =
    result && result !== PENDING_RESULT_ONELINER
      ? clipFact(result.replace(/\s*·\s*/g, ", "), 64)
      : undefined;
  if (resultFact) {
    return joinBullets([`${resultFact}.`, newsLine]);
  }
  return joinBullets([newsLine]);
}

/** Evidence 있을 때 — “점검 포인트는 ○○”. 단정금지·추천 보일러플레이트 없음. */
function implicationFor(event: MarketEvent, post: boolean): string | undefined {
  if (!post) return undefined;
  const news = usableContextNews(event.contextNews);
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
