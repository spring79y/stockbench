import { Suspense } from "react";
import { HomeBoard } from "@/components/HomeBoard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchLiveMarket } from "@/lib/market/fetchLiveMarket";
import { parseMarketScope } from "@/lib/market/scope";
import { loadPublishedBoard } from "@/lib/pipeline/loadPublished";

export const revalidate = 120;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const initialScope = parseMarketScope(params.view);
  const [market, board] = await Promise.all([
    fetchLiveMarket(initialScope),
    loadPublishedBoard(),
  ]);

  return (
    <>
      <SiteHeader />
      <Suspense fallback={<main className="board">불러오는 중…</main>}>
        <HomeBoard market={market} board={board} initialScope={initialScope} />
      </Suspense>
      <SiteFooter live={market.source === "live"} />
    </>
  );
}
