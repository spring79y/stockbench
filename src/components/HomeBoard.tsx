"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckList } from "@/components/CheckList";
import { EventList } from "@/components/EventList";
import { MarketPulse } from "@/components/MarketPulse";
import { OverviewDualBrief } from "@/components/OverviewDualBrief";
import { OverviewMacroStrip } from "@/components/OverviewMacroStrip";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { ScopeTabs } from "@/components/ScopeTabs";
import { TodayBriefing } from "@/components/TodayBriefing";
import type { LiveMarketBundle } from "@/lib/market/fetchLiveMarket";
import type { MarketScope } from "@/lib/market/scope";
import { formatBriefingUpdatedAt } from "@/lib/events/catalog";
import { parseMarketScope } from "@/lib/market/scope";
import {
  applySessionStatusToQuotes,
  buildScopeTabHints,
  moodForScope,
  temperatureForScope,
} from "@/lib/market/session";
import type { BoardEditorial } from "@/lib/pipeline/loadPublished";
import type { DailyBriefing, MarketEvent } from "@/lib/types";

const MarketFlashNews = dynamic(
  () => import("@/components/MarketFlashNews").then((m) => m.MarketFlashNews),
  { loading: () => <section className="board-block">속보 준비 중…</section> },
);

const RetailScanPanel = dynamic(
  () => import("@/components/RetailScanPanel").then((m) => m.RetailScanPanel),
  { loading: () => <section className="board-block">지표 불러오는 중…</section> },
);

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeScope = viewParam != null ? parseMarketScope(viewParam) : initialScope;
  const isOverview = activeScope === "all";

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      setNow(new Date());
    };
    const id = window.setInterval(tick, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // PWA / bfcache: reopen or focus may keep a frozen SSR shell — refresh when publish is newer.
  useEffect(() => {
    let busy = false;
    const localPublishedAt = board.publishedAt;

    const refreshIfStale = async () => {
      if (document.visibilityState === "hidden") return;
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/api/published", { cache: "no-store" });
        if (!res.ok) return;
        const meta = (await res.json()) as { publishedAt?: string | null };
        const remote = meta.publishedAt ?? null;
        if (!remote) return;
        if (remote !== localPublishedAt) {
          router.refresh();
        }
      } catch {
        // ignore network errors
      } finally {
        busy = false;
      }
    };

    const onVisible = () => {
      void refreshIfStale();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refreshIfStale();
    };
    const onFocus = () => {
      void refreshIfStale();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [board.publishedAt, router]);

  // Notification click: SW posts a message so we hard-navigate (fresh HTML), not just focus.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== "stockbench:push-open") return;
      const target = data.url || "/";
      try {
        const next = new URL(target, window.location.origin);
        if (next.origin !== window.location.origin) return;
        window.location.assign(`${next.pathname}${next.search}${next.hash}`);
      } catch {
        window.location.assign("/");
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // 마지막 탭 기억 (한·미·개요). URL에 view 없을 때 한·미만 복원.
  useEffect(() => {
    try {
      if (activeScope === "kr" || activeScope === "us" || activeScope === "all") {
        localStorage.setItem("sb-view", activeScope);
      }
    } catch {
      // ignore
    }
  }, [activeScope]);

  useEffect(() => {
    if (viewParam != null) return;
    try {
      const saved = localStorage.getItem("sb-view");
      if (saved === "kr" || saved === "us") {
        router.replace(`/?view=${saved}`);
      }
    } catch {
      // ignore
    }
  }, [viewParam, router]);

  const view = board.views[activeScope] ?? board.views.all;
  const indexes = useMemo(
    () => applySessionStatusToQuotes(market.indexes, now),
    [market.indexes, now],
  );
  const temperature = temperatureForScope(indexes, activeScope);
  const { mood, moodLabel } = moodForScope(indexes, activeScope);
  const tabHints = useMemo(() => buildScopeTabHints(market.indexes, now), [market.indexes, now]);
  const updatedLabel =
    activeScope === "kr"
      ? formatBriefingUpdatedAt(board.views.kr.publishedAt ?? board.publishedAt)
      : activeScope === "us"
        ? formatBriefingUpdatedAt(board.views.us.publishedAt ?? board.publishedAt)
        : formatBriefingUpdatedAt(board.views.all.publishedAt ?? board.publishedAt);
  const viewMode = view.mode ?? "full";
  const events = useMemo(() => {
    const filtered = filterEvents(board.events, activeScope);
    // 개요는 한눈용으로 상위 3개만
    return activeScope === "all" ? filtered.slice(0, 3) : filtered;
  }, [board.events, activeScope]);

  const briefing: DailyBriefing = {
    asOfLabel: market.asOfLabel,
    mood,
    moodLabel,
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
          moodLabel={moodLabel}
          mood={mood}
          asOfLabel={market.asOfLabel}
          flow={isOverview ? undefined : market.retailScan.flow}
        />

        {isOverview ? (
          <>
            <OverviewMacroStrip macros={market.macros} />
            <OverviewDualBrief kr={board.views.kr} us={board.views.us} />
            <EventList events={events} scope={activeScope} stepNo={1} />
            <MarketFlashNews />
          </>
        ) : (
          <>
            <RetailScanPanel scan={market.retailScan} charts={market.charts} scope={activeScope} />
            <TodayBriefing
              briefing={briefing}
              macros={market.macros}
              updatedLabel={updatedLabel}
              fromPipeline={board.fromPipeline}
              refreshLabel={viewMode === "refresh"}
              scope={activeScope}
              slot={view.slot}
              mode={viewMode}
            />
            <ScenarioPanel scenarios={view.scenarios} />
            <CheckList
              key={`check-${activeScope}-${view.publishedAt ?? ""}`}
              items={view.checkItems}
              scope={activeScope}
              issuedAt={view.publishedAt}
            />
            <EventList events={events} scope={activeScope} stepNo={4} />
          </>
        )}
      </div>
    </main>
  );
}
