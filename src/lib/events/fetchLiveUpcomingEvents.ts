import "server-only";

import { cache } from "react";
import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";
import { buildUpcomingEvents } from "@/lib/events/buildUpcomingEvents";
import { defaultPipelineEvents } from "@/lib/events/defaultEvents";
import type { MarketEvent } from "@/lib/types";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const getCachedUpcomingEvents = unstable_cache(
  async (): Promise<MarketEvent[]> => buildUpcomingEvents(yahooFinance),
  ["upcoming-events-v3"],
  { revalidate: 120 },
);

async function fetchLiveUpcomingEventsUncached(): Promise<MarketEvent[]> {
  try {
    return await getCachedUpcomingEvents();
  } catch {
    return defaultPipelineEvents();
  }
}

/** Request-scoped dedupe; Yahoo earnings + macro 일정. */
export const fetchLiveUpcomingEvents = cache(fetchLiveUpcomingEventsUncached);
