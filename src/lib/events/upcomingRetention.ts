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
 * Prefer existing `oneLiner` when `actual.beatLabel` is present (pipeline already encodes it).
 */
export function eventResultComment(event: MarketEvent): string | null {
  if (!event.actual?.beatLabel) return null;
  const line = event.oneLiner?.trim();
  if (line) return line;
  return `발표 결과: 컨센서스 대비 ${event.actual.beatLabel} — 점검용 (매매 신호 아님)`;
}

/** Display/publish filter: drop past KST days; keep today (with or without result). */
export function filterRetainedUpcomingEvents(
  events: MarketEvent[],
  now: Date = new Date(),
): MarketEvent[] {
  return events.filter((e) => shouldRetainUpcomingEvent(e, now));
}
