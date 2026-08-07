import { Suspense } from "react";
import { BoardSkeleton } from "@/components/BoardSkeleton";
import { HomeBoard } from "@/components/HomeBoard";
import { ScrollToTop } from "@/components/ScrollToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { attachEventDetailSummaries } from "@/lib/events/attachEventDetailSummaries";
import { fetchLiveUpcomingEvents } from "@/lib/events/fetchLiveUpcomingEvents";
import { mergePublishedEarningsEvidence } from "@/lib/events/mergePublishedEarnings";
import {
  fetchLiveMarket,
  type LiveMarketBundle,
} from "@/lib/market/fetchLiveMarket";
import { emptyRetailScan } from "@/lib/market/retailScan";
import { slimMarketForScope } from "@/lib/market/slimMarketForScope";
import { parseMarketScope, type MarketScope } from "@/lib/market/scope";
import { loadPublishedBoard, type BoardEditorial } from "@/lib/pipeline/loadPublished";
import { slimBoardForScope } from "@/lib/pipeline/slimBoardForScope";

/** Briefing comes from committed latest.json (redeploy). Keep ISR short so live market stays fresh. */
export const revalidate = 60;

/** Hold published board while live quotes catch up — avoid empty 「시세 불러오는 중…」. */
function pendingMarketShell(): LiveMarketBundle {
  return {
    indexes: [],
    macros: [],
    temperature: "—",
    mood: "mixed",
    moodLabel: "시세 준비 중",
    asOfLabel: "시세 갱신 중",
    source: "fallback",
    retailScan: emptyRetailScan(),
    charts: {},
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const initialScope = parseMarketScope(params.view);

  // Kick both before any await in children so sibling Suspense can race.
  const marketPromise = fetchLiveMarket(initialScope);
  const boardPromise = loadPublishedBoard();

  return (
    <>
      <SiteHeader />
      <Suspense fallback={<BoardSkeleton note="직전 발행 보드 준비 중" />}>
        <HomePageBody
          initialScope={initialScope}
          marketPromise={marketPromise}
          boardPromise={boardPromise}
        />
      </Suspense>
      <ScrollToTop />
    </>
  );
}

async function HomePageBody({
  initialScope,
  marketPromise,
  boardPromise,
}: {
  initialScope: MarketScope;
  marketPromise: ReturnType<typeof fetchLiveMarket>;
  boardPromise: ReturnType<typeof loadPublishedBoard>;
}) {
  // Board (disk) is usually ready first; keep waiting on market in an inner boundary
  // so we can stream a board-ready shell if market is still in flight.
  const [board, liveEvents] = await Promise.all([boardPromise, fetchLiveUpcomingEvents()]);
  const events = attachEventDetailSummaries(
    mergePublishedEarningsEvidence(liveEvents, board.events),
  );
  const boardWithEvents: BoardEditorial = { ...board, events };

  return (
    <Suspense
      fallback={
        <>
          <HomeBoard
            market={slimMarketForScope(pendingMarketShell(), initialScope)}
            board={slimBoardForScope(boardWithEvents, initialScope)}
            initialScope={initialScope}
          />
          <SiteFooter live={false} />
        </>
      }
    >
      <HomeBoardWithMarket
        initialScope={initialScope}
        board={boardWithEvents}
        marketPromise={marketPromise}
      />
    </Suspense>
  );
}

async function HomeBoardWithMarket({
  initialScope,
  board,
  marketPromise,
}: {
  initialScope: MarketScope;
  board: BoardEditorial;
  marketPromise: ReturnType<typeof fetchLiveMarket>;
}) {
  const market = await marketPromise;

  return (
    <>
      <HomeBoard
        market={slimMarketForScope(market, initialScope)}
        board={slimBoardForScope(board, initialScope)}
        initialScope={initialScope}
      />
      <SiteFooter live={market.source === "live"} />
    </>
  );
}
