import { Suspense } from "react";
import { HomeBoard } from "@/components/HomeBoard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchLiveMarket } from "@/lib/market/fetchLiveMarket";
import { slimMarketForScope } from "@/lib/market/slimMarketForScope";
import { parseMarketScope, type MarketScope } from "@/lib/market/scope";
import { loadPublishedBoard } from "@/lib/pipeline/loadPublished";
import { slimBoardForScope } from "@/lib/pipeline/slimBoardForScope";

export const revalidate = 120;

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
      <Suspense
        fallback={
          <main className="board">
            <p className="board-block">불러오는 중…</p>
          </main>
        }
      >
        <HomePageBody
          initialScope={initialScope}
          marketPromise={marketPromise}
          boardPromise={boardPromise}
        />
      </Suspense>
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
  const board = await boardPromise;

  return (
    <Suspense
      fallback={
        <main className="board">
          <p className="board-block">시세 불러오는 중…</p>
        </main>
      }
    >
      <HomeBoardWithMarket
        initialScope={initialScope}
        board={board}
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
  board: Awaited<ReturnType<typeof loadPublishedBoard>>;
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
