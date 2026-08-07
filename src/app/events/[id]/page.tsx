import { Suspense } from "react";
import { notFound } from "next/navigation";
import { EventDetailView } from "@/components/EventDetailView";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { attachEventDetailSummaries } from "@/lib/events/attachEventDetailSummaries";
import { findEventById, getEventDetail } from "@/lib/events/catalog";
import { fetchLiveUpcomingEvents } from "@/lib/events/fetchLiveUpcomingEvents";
import { mergePublishedEarningsEvidence } from "@/lib/events/mergePublishedEarnings";
import { fetchEventIndicatorCharts } from "@/lib/market/fetchEventCharts";
import { probeMarketLive } from "@/lib/market/probeMarketLive";
import { loadPublishedBoard } from "@/lib/pipeline/loadPublished";

export const revalidate = 120;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

async function loadEvents() {
  const [board, liveEvents] = await Promise.all([
    loadPublishedBoard(),
    fetchLiveUpcomingEvents(),
  ]);
  return attachEventDetailSummaries(
    mergePublishedEarningsEvidence(liveEvents, board.events),
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const events = await loadEvents();
  const event = findEventById(decoded, events);
  return {
    title: event ? `${event.title} — StockBench` : "일정 — StockBench",
  };
}

export default async function EventPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const decoded = decodeURIComponent(id);
  const events = await loadEvents();
  const event = findEventById(decoded, events);
  if (!event) notFound();

  const detail = getEventDetail(event);
  const periodSet = detail.chartDefs.some((d) => d.source === "fred")
    ? "indicator"
    : "stock";
  const initialPeriod = periodSet === "indicator" ? "1y" : "3m";
  const charts = await fetchEventIndicatorCharts(detail.chartDefs, initialPeriod);

  return (
    <>
      <SiteHeader />
      <EventDetailView
        event={event}
        detail={detail}
        charts={charts}
        backHref={from}
      />
      <Suspense fallback={<SiteFooter />}>
        <EventFooterLive />
      </Suspense>
    </>
  );
}

async function EventFooterLive() {
  const live = await probeMarketLive();
  return <SiteFooter live={live} />;
}
