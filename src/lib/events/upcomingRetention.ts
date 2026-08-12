import type { MarketEvent } from "@/lib/types";
import { epsFactPhrase, revenueOpActualFactPhrase } from "@/lib/events/earningsCopy";
import { earningsResultOneLiner } from "@/lib/market/earningsBeat";
import {
  PENDING_RESULT_ONELINER,
  contextNewsSuggestsPrinted,
  hasStructuredEarningsActual,
  isPendingResultOneLiner,
  looksPreReportOneLiner,
} from "@/lib/market/earningsAnnounced";

const KST = "Asia/Seoul";

/** Calendar day `YYYY-MM-DD` in Asia/Seoul. */
export function kstCalendarDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Add/subtract whole calendar days on a `YYYY-MM-DD` KST day string. */
export function addKstCalendarDays(ymd: string, delta: number): string {
  const base = new Date(`${ymd}T12:00:00+09:00`);
  if (!Number.isFinite(base.getTime())) return ymd;
  base.setTime(base.getTime() + delta * 24 * 60 * 60 * 1000);
  return kstCalendarDay(base);
}

/**
 * Event's calendar day in KST — `dateISO` preferred, else `dateLabel` (MM.DD).
 * Returns null when neither yields a parseable day.
 */
export function eventCalendarDayKst(event: Pick<MarketEvent, "dateISO" | "dateLabel">): string | null {
  if (event.dateISO) {
    const t = new Date(event.dateISO);
    if (Number.isFinite(t.getTime())) return kstCalendarDay(t);
  }
  const m = event.dateLabel.match(/^(\d{2})\.(\d{2})/);
  if (!m) return null;
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
  }).format(new Date());
  return `${year}-${m[1]}-${m[2]}`;
}

/**
 * Keep through D-day + 1 (KST). Drop from D-day + 2.
 * Unparseable dates are retained (avoid silent drops).
 */
export function shouldRetainUpcomingEvent(
  event: Pick<MarketEvent, "dateISO" | "dateLabel">,
  now: Date = new Date(),
): boolean {
  const day = eventCalendarDayKst(event);
  if (!day) return true;
  const today = kstCalendarDay(now);
  const earliestKept = addKstCalendarDays(today, -1); // yesterday = still D+1 for that event
  return day >= earliestKept;
}

/** True when the announce clock has passed (or event calendar day is before today). */
export function isEventPastAnnounce(
  event: Pick<MarketEvent, "dateISO" | "dateLabel">,
  now: Date = new Date(),
): boolean {
  if (event.dateISO) {
    const t = Date.parse(event.dateISO);
    if (Number.isFinite(t)) return t <= now.getTime();
  }
  const day = eventCalendarDayKst(event);
  if (!day) return false;
  return day < kstCalendarDay(now);
}

function stripLegacyJudgmentCopy(line: string): string {
  return line
    .replace(/\s*·\s*판정\s*보류(?:\s*\([^)]*\))?/g, "")
    .replace(/\s*—\s*점검용(?:\s*\([^)]*\))?/g, "")
    .replace(/\s*\(점검용(?:\s*·\s*매매\s*신호\s*아님)?\)/g, "")
    .trim();
}

/**
 * True when oneLiner is clearly post-result (not pre-report consensus copy).
 * Bare `/매출|영업이익/` while still `시장 예상…` is NOT post.
 */
export function isClearlyPostResultOneLiner(oneLiner: string | undefined | null): boolean {
  if (!oneLiner?.trim()) return false;
  const line = oneLiner.trim();
  if (isPendingResultOneLiner(line)) return true;
  if (looksPreReportOneLiner(line)) return false;
  if (/발표됨|발표\s*결과|결과\s*미확인|집계\s*대기/.test(line)) return true;
  if (/주당순이익\(EPS\)|EPS\s*[\$\d]/.test(line)) return true;
  // Macro prints: YoY / mom fact lines after announce
  if (/전년비|전월|비농업|고용\s*증감|실제\s*[+\-]?\d/.test(line)) return true;
  return false;
}

function buildPostResultFromActual(event: MarketEvent): string | null {
  const a = event.actual;
  if (!a) return null;
  if (!hasStructuredEarningsActual(a) && !a.beatLabel) return null;
  const companyScaleActualLine = revenueOpActualFactPhrase({
    revenueLabel: a.revenueActualLabel,
    opLabel: a.operatingProfitActualLabel,
  });
  return earningsResultOneLiner(a.beatLabel, {
    epsActual: a.epsActual,
    epsEstimate: a.epsEstimate,
    region: event.region === "KR" ? "KR" : "US",
    companyScaleActualLine,
  });
}

/**
 * Result comment from structured fields only — never invent.
 * Prefer clearly post `oneLiner`; else build from structured actual.
 * Past-announce macros without a print line → pending fact (D-day / D-day+1 window).
 * Do not surface pre-report `시장 예상…` as a result line.
 */
export function eventResultComment(
  event: MarketEvent,
  now: Date = new Date(),
): string | null {
  const hasEps =
    event.actual?.epsActual != null && event.actual?.epsEstimate != null;
  const hasOp =
    event.actual?.operatingProfitActual != null ||
    Boolean(event.actual?.operatingProfitActualLabel);
  const pending =
    isPendingResultOneLiner(event.oneLiner) ||
    (contextNewsSuggestsPrinted(event.contextNews) && !hasEps && !hasOp);
  if (!event.actual?.beatLabel && !hasEps && !hasOp && !pending) {
    // Macro / non-earnings: after announce, always show a result line in the
    // D-day…D-day+1 retention window (enriched print or pending).
    if (event.kind !== "earnings" && isEventPastAnnounce(event, now)) {
      const line = event.oneLiner?.trim();
      if (line && isClearlyPostResultOneLiner(line)) {
        return stripLegacyJudgmentCopy(line);
      }
      if (event.detailSummary?.result?.trim()) {
        return event.detailSummary.result.trim();
      }
      return PENDING_RESULT_ONELINER;
    }
    return null;
  }

  const line = event.oneLiner?.trim();
  if (line && isClearlyPostResultOneLiner(line)) {
    return stripLegacyJudgmentCopy(line);
  }

  const fromActual = buildPostResultFromActual(event);
  if (fromActual) return fromActual;

  if (event.actual?.beatLabel) {
    return hasEps
      ? (() => {
          const region = event.region === "KR" ? "KR" : "US";
          const fmt = (v: number) =>
            region === "KR"
              ? `${Math.round(v).toLocaleString("ko-KR")}원`
              : `$${Number(v.toFixed(2))}`;
          return `발표됨 · ${epsFactPhrase(fmt(event.actual!.epsActual!), fmt(event.actual!.epsEstimate!))} · ${event.actual!.beatLabel}`;
        })()
      : `발표됨 · 주당순이익(EPS) ${event.actual.beatLabel}`;
  }
  if (hasEps) {
    const region = event.region === "KR" ? "KR" : "US";
    const fmt = (v: number) =>
      region === "KR"
        ? `${Math.round(v).toLocaleString("ko-KR")}원`
        : `$${Number(v.toFixed(2))}`;
    return `발표됨 · ${epsFactPhrase(fmt(event.actual!.epsActual!), fmt(event.actual!.epsEstimate!))}`;
  }
  if (pending) {
    if (isPendingResultOneLiner(event.oneLiner)) {
      return event.oneLiner!.trim();
    }
    return PENDING_RESULT_ONELINER;
  }
  return "발표됨 · 결과 미확인";
}

/** Display/publish filter: keep through D-day+1 KST; drop from D-day+2. */
export function filterRetainedUpcomingEvents(
  events: MarketEvent[],
  now: Date = new Date(),
): MarketEvent[] {
  return events.filter((e) => shouldRetainUpcomingEvent(e, now));
}
