import { NextResponse } from "next/server";
import { fetchKs200NightFutures } from "@/lib/market/fetchKs200NightFutures";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchKs200NightFutures();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[api/ks200-night]", error);
    return NextResponse.json({ error: "ks200 night futures fetch failed" }, { status: 502 });
  }
}
