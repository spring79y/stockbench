import { Suspense } from "react";
import { notFound } from "next/navigation";
import { EventDetailView } from "@/components/EventDetailView";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { findEventById, getEventDetail } from "@/lib/events/catalog";
import { fetchEventIndicatorCharts } from "@/lib/market/fetchEventCharts";
import { probeMarketLive } from "@/lib/market/probeMarketLive";
import { loadPublishedBoard } from "@/lib/pipeline/loadPublished";

export const revalidate = 120;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const board = await loadPublishedBoard();
  const event = findEventById(id, board.events);
  return {
    title: event ? `${event.title} — StockBench` : "일정 — StockBench",
  };
}

export default async function EventPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const board = await loadPublishedBoard();
  const event = findEventById(id, board.events);
  if (!event) notFound();

  const detail = getEventDetail(event.id);
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
