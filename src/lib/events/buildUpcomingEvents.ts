import type YahooFinance from "yahoo-finance2";
import { defaultPipelineEvents } from "@/lib/events/defaultEvents";
import {
  earningsEntriesToEvents,
  fetchEarningsEntries,
} from "@/lib/market/fetchEarningsCalendar";
import type { MarketEvent } from "@/lib/types";

/** 정렬용 시각 — dateISO 우선, 없으면 dateLabel(MM.DD) 파싱 */
function eventSortTime(event: MarketEvent): number {
  if (event.dateISO) {
    const t = new Date(event.dateISO).getTime();
    if (Number.isFinite(t)) return t;
  }
  const m = event.dateLabel.match(/^(\d{2})\.(\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(new Date());
  const t = new Date(`${year}-${m[1]}-${m[2]}T12:00:00+09:00`).getTime();
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** 매크로 일정 + 시총·브릿지 실적 일정 병합 · 무조건 날짜순 */
export async function buildUpcomingEvents(
  yf: InstanceType<typeof YahooFinance>,
): Promise<MarketEvent[]> {
  const macro = defaultPipelineEvents();
  let earnings: MarketEvent[] = [];
  try {
    const entries = await fetchEarningsEntries(yf, 14);
    earnings = earningsEntriesToEvents(entries);
  } catch {
    earnings = [];
  }

  const macroIds = new Set(macro.map((e) => e.id));
  const merged = [
    ...macro,
    ...earnings.filter((e) => !macroIds.has(e.id)),
  ];

  return merged
    .filter((e) => !e.bridgeOf)
    .sort((a, b) => {
      const ta = eventSortTime(a);
      const tb = eventSortTime(b);
      if (ta !== tb) return ta - tb;
      return a.title.localeCompare(b.title, "ko");
    })
    .slice(0, 8);
}
