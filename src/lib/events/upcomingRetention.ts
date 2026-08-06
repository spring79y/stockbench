import type { MarketEvent } from "@/lib/types";

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
 * Keep same KST calendar day and future; drop when event day is before today (KST).
 * Unparseable dates are retained (avoid silent drops).
 */
export function shouldRetainUpcomingEvent(
  event: Pick<MarketEvent, "dateISO" | "dateLabel">,
  now: Date = new Date(),
): boolean {
  const day = eventCalendarDayKst(event);
  if (!day) return true;
  return day >= kstCalendarDay(now);
}

/**
 * Result comment from structured fields only — never invent.
 * Prefer existing `oneLiner` when Collector already encoded a post-result line.
 * Facts only: announced?, EPS digits, dual-source beatLabel. No 「판정 보류」.
 */
export function eventResultComment(event: MarketEvent): string | null {
  const hasNumbers =
    event.actual?.epsActual != null && event.actual?.epsEstimate != null;
  if (!event.actual?.beatLabel && !hasNumbers) return null;
  const line = event.oneLiner?.trim();
  if (
    line &&
    (/발표\s*결과|발표됨|미확인|결과\s*미확인|EPS/.test(line) || event.actual?.beatLabel)
  ) {
    // Strip legacy Collector judgment copy if still present in published JSON.
    return line
      .replace(/\s*·\s*판정\s*보류(?:\s*\([^)]*\))?/g, "")
      .replace(/\s*—\s*점검용(?:\s*\([^)]*\))?/g, "")
      .replace(/\s*\(점검용(?:\s*·\s*매매\s*신호\s*아님)?\)/g, "")
      .trim();
  }
  if (event.actual?.beatLabel) {
    return hasNumbers
      ? (() => {
          const region = event.region === "KR" ? "KR" : "US";
          const fmt = (v: number) =>
            region === "KR"
              ? `${Math.round(v).toLocaleString("ko-KR")}원`
              : `$${Number(v.toFixed(2))}`;
          return `발표됨 · EPS ${fmt(event.actual!.epsActual!)} vs 예상 ${fmt(event.actual!.epsEstimate!)} · ${event.actual!.beatLabel}`;
        })()
      : `발표됨 · EPS ${event.actual.beatLabel}`;
  }
  if (hasNumbers) {
    const region = event.region === "KR" ? "KR" : "US";
    const fmt = (v: number) =>
      region === "KR"
        ? `${Math.round(v).toLocaleString("ko-KR")}원`
        : `$${Number(v.toFixed(2))}`;
    return `발표됨 · EPS ${fmt(event.actual!.epsActual!)} vs 예상 ${fmt(event.actual!.epsEstimate!)}`;
  }
  return "발표됨 · 결과 미확인";
}

/** Display/publish filter: drop past KST days; keep today (with or without result). */
export function filterRetainedUpcomingEvents(
  events: MarketEvent[],
  now: Date = new Date(),
): MarketEvent[] {
  return events.filter((e) => shouldRetainUpcomingEvent(e, now));
}
