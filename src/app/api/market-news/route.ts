import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchMarketFlashNews } from "@/lib/market/fetchStockNews";

export const dynamic = "force-dynamic";

const getCachedFlashNews = unstable_cache(
  async (limit: number) => fetchMarketFlashNews(limit),
  ["market-flash-news-v1"],
  { revalidate: 90 },
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "8");
  const take = Number.isFinite(limit) ? Math.min(8, Math.max(1, limit)) : 8;

  try {
    const items = await getCachedFlashNews(take);
    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=90, stale-while-revalidate=180",
        },
      },
    );
  } catch (error) {
    console.error("[api/market-news]", error);
    return NextResponse.json({ error: "news fetch failed" }, { status: 502 });
  }
}
