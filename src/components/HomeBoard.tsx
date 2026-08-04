"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckList } from "@/components/CheckList";
import { EventList } from "@/components/EventList";
import { MarketFlashNews } from "@/components/MarketFlashNews";
import { MarketPulse } from "@/components/MarketPulse";
import { RetailScanPanel } from "@/components/RetailScanPanel";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { ScopeTabs } from "@/components/ScopeTabs";
import { TodayBriefing } from "@/components/TodayBriefing";
import type { LiveMarketBundle } from "@/lib/market/fetchLiveMarket";
import type { MarketScope } from "@/lib/market/scope";
import { formatBriefingUpdatedAt } from "@/lib/events/catalog";
import { parseMarketScope } from "@/lib/market/scope";
import { applySessionStatusToQuotes, buildScopeTabHints, temperatureForScope } from "@/lib/market/session";
import type { BoardEditorial } from "@/lib/pipeline/loadPublished";
import type { DailyBriefing, MarketEvent } from "@/lib/types";

function filterEvents(events: MarketEvent[], scope: MarketScope): MarketEvent[] {
  if (scope === "all") return events;
  if (scope === "kr") {
    return events.filter((e) => e.region === "KR" || e.region === "GLOBAL" || e.level === "high");
  }
  return events.filter((e) => e.region === "US" || e.region === "GLOBAL" || e.level === "high");
}

export function HomeBoard({
  market,
  board,
  initialScope = "all",
}: {
  market: LiveMarketBundle;
  board: BoardEditorial;
  initialScope?: MarketScope;
}) {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeScope = viewParam != null ? parseMarketScope(viewParam) : initialScope;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const view = board.views[activeScope] ?? board.views.all;
  const indexes = useMemo(
    () => applySessionStatusToQuotes(market.indexes, now),
    [market.indexes, now],
  );
  const temperature = temperatureForScope(indexes, activeScope);
  const tabHints = useMemo(() => buildScopeTabHints(market.indexes, now), [market.indexes, now]);
  const updatedLabel =
    activeScope === "kr"
      ? formatBriefingUpdatedAt(board.views.kr.publishedAt ?? board.publishedAt)
      : activeScope === "us"
        ? formatBriefingUpdatedAt(board.views.us.publishedAt ?? board.publishedAt)
        : formatBriefingUpdatedAt(board.views.all.publishedAt ?? board.publishedAt);
  const viewMode = view.mode ?? (view.slot === "kr-mid" || view.slot === "us-mid" ? "refresh" : "full");
  const events = useMemo(
    () => filterEvents(board.events, activeScope),
    [board.events, activeScope],
  );

  const briefing: DailyBriefing = {
    asOfLabel: market.asOfLabel,
    mood: market.mood,
    moodLabel: market.moodLabel,
    temperature,
    headline: view.briefing.headline,
    bullets: view.briefing.bullets,
    evidenceIds: view.briefing.evidenceIds,
  };

  return (
    <main className="board">
      <ScopeTabs value={activeScope} hints={tabHints} />

      <div key={activeScope} className="scope-panel">
        <MarketPulse
          quotes={indexes}
          charts={market.charts}
          scope={activeScope}
          temperature={temperature}
          moodLabel={market.moodLabel}
          mood={market.mood}
          asOfLabel={market.asOfLabel}
          flow={market.retailScan.flow}
        />
        <RetailScanPanel scan={market.retailScan} charts={market.charts} scope={activeScope} />
        <TodayBriefing
          briefing={briefing}
          macros={market.macros}
          updatedLabel={updatedLabel}
          fromPipeline={board.fromPipeline}
          refreshLabel={viewMode === "refresh"}
        />
        <ScenarioPanel scenarios={view.scenarios} />
        <CheckList key={`check-${activeScope}`} items={view.checkItems} />
        <EventList events={events} scope={activeScope} />
        {activeScope === "all" ? <MarketFlashNews /> : null}
      </div>
    </main>
  );
}
