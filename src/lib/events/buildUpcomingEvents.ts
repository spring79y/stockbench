import type YahooFinance from "yahoo-finance2";
import { defaultPipelineEvents } from "@/lib/events/defaultEvents";
import {
  earningsEntriesToEvents,
  fetchEarningsEntries,
} from "@/lib/market/fetchEarningsCalendar";
import type { MarketEvent } from "@/lib/types";

/** 매크로 일정 + 시총·브릿지 실적 일정 병합 */
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
    .sort((a, b) => {
      const ta = a.dateISO ? new Date(a.dateISO).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.dateISO ? new Date(b.dateISO).getTime() : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      if (a.kind === "earnings" && b.kind !== "earnings") return -1;
      if (b.kind === "earnings" && a.kind !== "earnings") return 1;
      return 0;
    })
    .slice(0, 8);
}
