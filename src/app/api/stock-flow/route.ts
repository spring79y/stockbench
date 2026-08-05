import { NextResponse } from "next/server";
import { fetchStockInvestorFlows } from "@/lib/market/fetchInvestorFlow";
import { MEGA_CAP_CANDIDATES_KR } from "@/lib/market/retailScan";

export const dynamic = "force-dynamic";

const KR_BY_ID = new Map(MEGA_CAP_CANDIDATES_KR.map((c) => [c.id, c]));

/** 국내 시총 상위 종목 수급 — 펼칠 때만 호출 (SSR byStock 생략 대응) */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const items = (ids.length > 0 ? ids : MEGA_CAP_CANDIDATES_KR.map((c) => c.id))
    .map((id) => KR_BY_ID.get(id))
    .filter((c): c is (typeof MEGA_CAP_CANDIDATES_KR)[number] => Boolean(c))
    .slice(0, 8)
    .map((c) => ({ id: c.id, symbol: c.symbol }));

  if (items.length === 0) {
    return NextResponse.json({ byStock: {} }, { status: 200 });
  }

  try {
    const byStock = await fetchStockInvestorFlows(items);
    return NextResponse.json(
      { byStock },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
        },
      },
    );
  } catch (error) {
    console.error("[api/stock-flow]", error);
    return NextResponse.json({ error: "stock flow fetch failed" }, { status: 502 });
  }
}
