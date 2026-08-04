import { NextResponse } from "next/server";
import { fetchStockNews } from "@/lib/market/fetchStockNews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  const symbol = searchParams.get("symbol")?.trim() ?? "";
  const id = searchParams.get("id")?.trim() || undefined;
  const region = (searchParams.get("region") === "US" ? "US" : "KR") as "KR" | "US";
  const limit = Number(searchParams.get("limit") ?? "4");

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    const items = await fetchStockNews({
      id,
      name,
      symbol,
      region,
      limit: Number.isFinite(limit) ? limit : 4,
    });
    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[api/stock-news]", error);
    return NextResponse.json({ error: "news fetch failed" }, { status: 502 });
  }
}
