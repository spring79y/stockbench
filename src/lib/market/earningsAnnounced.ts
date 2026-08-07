/**
 * Post-print / awaiting-aggregation status for earnings events.
 * Accuracy > volume: never invent numbers; use structured API facts or a clear pending line.
 */
import { kstCalendarDay } from "@/lib/events/upcomingRetention";
import type { EarningsActual, EarningsContextNewsItem, MarketEvent } from "@/lib/types";

/** EventList / Evidence when print is due but Yahoo/Naver actuals are not ready. */
export const PENDING_RESULT_ONELINER = "발표됨 · 결과 집계 대기";

/** Headlines that clearly indicate results already out (not preview-only). */
const PRINTED_RESULT_RE =
  /영업익\s*[\d,]+|영업이익\s*[\d,]+|어닝\s*쇼크|어닝\s*비트|어닝\s*미스|실적\s*발표\s*[….]|분기\s*실적발표|2Q\s*영업|1Q\s*영업|3Q\s*영업|4Q\s*영업|EPS\s*\$?\d|주당순이익\s*[\d,]+|beats?\s+estimates?|misses?\s+estimates?|reported\s+(?:EPS|earnings|a\s+loss)|results?\s+(?:beat|miss)|손익\s*발표/i;

const PREVIEW_ONLY_RE =
  /실적\s*발표\s*예정|실적\s*전망|preview|ahead\s+of|before\s+earnings|실적\s*앞두|실적\s*대기/i;

export function isEarningsClockPast(
  dateISO: string,
  now: Date = new Date(),
): boolean {
  const t = new Date(dateISO).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

export function isEarningsSameKstDay(
  dateISO: string,
  now: Date = new Date(),
): boolean {
  const t = new Date(dateISO).getTime();
  if (!Number.isFinite(t)) return false;
  return kstCalendarDay(new Date(t)) === kstCalendarDay(now);
}

export function hasStructuredEarningsActual(
  actual: EarningsActual | undefined | null,
): boolean {
  if (!actual) return false;
  if (actual.epsActual != null && actual.epsEstimate != null) return true;
  if (actual.operatingProfitActual != null && Number.isFinite(actual.operatingProfitActual)) {
    return true;
  }
  if (actual.revenueActual != null && Number.isFinite(actual.revenueActual)) return true;
  return false;
}

/** True when context news already carries post-print facts (not preview fluff). */
export function contextNewsSuggestsPrinted(
  news: EarningsContextNewsItem[] | undefined | null,
): boolean {
  if (!news || news.length === 0) return false;
  return news.some((n) => {
    const blob = `${n.title} ${n.snippet}`;
    if (PREVIEW_ONLY_RE.test(blob) && !PRINTED_RESULT_RE.test(blob)) return false;
    return PRINTED_RESULT_RE.test(blob);
  });
}

export function isPendingResultOneLiner(oneLiner: string | undefined | null): boolean {
  if (!oneLiner) return false;
  return /결과\s*집계\s*대기|결과\s*미확인/.test(oneLiner);
}

/** True when oneLiner still reads as pre-report consensus / schedule copy. */
export function looksPreReportOneLiner(oneLiner: string | undefined | null): boolean {
  if (!oneLiner) return true;
  if (isPendingResultOneLiner(oneLiner)) return false;
  if (/발표됨|발표\s*결과|주당순이익\(EPS\)\s+\d/.test(oneLiner)) return false;
  return /시장\s*예상|실적\s*발표\s*예정|예정\s*\(/.test(oneLiner);
}

/**
 * Announced for product purposes: clock past, structured actual, or same-KST-day
 * news that already reports results (KR morning print vs Yahoo afternoon stamp).
 */
export function isEarningsAnnounced(
  event: Pick<MarketEvent, "dateISO" | "actual" | "oneLiner" | "contextNews">,
  now: Date = new Date(),
): boolean {
  if (!event.dateISO) return false;
  if (hasStructuredEarningsActual(event.actual)) return true;
  if (isPendingResultOneLiner(event.oneLiner)) return true;
  if (isEarningsClockPast(event.dateISO, now)) return true;
  return (
    isEarningsSameKstDay(event.dateISO, now) &&
    contextNewsSuggestsPrinted(event.contextNews)
  );
}

/**
 * After contextNews attach: flip silent 「예정」 → pending when print is clearly out
 * but APIs have no structured actual yet. Never invent figures.
 */
export function applyAnnouncedEarningsStatus(
  events: MarketEvent[],
  now: Date = new Date(),
): MarketEvent[] {
  return events.map((ev) => {
    if (ev.kind !== "earnings" || !ev.dateISO) return ev;
    if (hasStructuredEarningsActual(ev.actual)) return ev;
    if (isPendingResultOneLiner(ev.oneLiner)) return ev;

    const clockPast = isEarningsClockPast(ev.dateISO, now);
    const newsPrinted =
      isEarningsSameKstDay(ev.dateISO, now) &&
      contextNewsSuggestsPrinted(ev.contextNews);

    if (!clockPast && !newsPrinted) return ev;

    // Drop pre-report copy once announced; keep consensus fields for detail expected lines.
    return { ...ev, oneLiner: PENDING_RESULT_ONELINER };
  });
}
