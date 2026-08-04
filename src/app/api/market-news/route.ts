import { NextResponse } from "next/server";
import { fetchMarketFlashNews } from "@/lib/market/fetchStockNews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "8");

  try {
    const items = await fetchMarketFlashNews(Number.isFinite(limit) ? limit : 8);
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
