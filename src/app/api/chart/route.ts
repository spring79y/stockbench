import { NextResponse } from "next/server";
import { fetchChartData } from "@/lib/market/fetchChartData";
import type { ChartPeriodId } from "@/lib/market/chartPeriods";
import { STOCK_CHART_PERIODS, INDICATOR_CHART_PERIODS } from "@/lib/market/chartPeriods";

export const dynamic = "force-dynamic";

const PERIOD_IDS = new Set(STOCK_CHART_PERIODS.map((p) => p.id));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim();
  const period = (searchParams.get("period") ?? "1d") as ChartPeriodId;
  const source = (searchParams.get("source") ?? "yahoo") as "yahoo" | "fred";
  const transform = (searchParams.get("transform") ?? "raw") as "raw" | "mom" | "yoy";
  const name = searchParams.get("name") ?? undefined;
  const id = searchParams.get("id") ?? undefined;
  const periodSet = (searchParams.get("periodSet") ??
    (source === "fred" ? "indicator" : "stock")) as "stock" | "indicator";

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  if (!PERIOD_IDS.has(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }
  if (periodSet === "indicator") {
    const ok = INDICATOR_CHART_PERIODS.some((p) => p.id === period);
    if (!ok) {
      return NextResponse.json({ error: "period not available for indicator" }, { status: 400 });
    }
  }

  try {
    const data = await fetchChartData({
      symbol,
      period,
      source,
      transform,
      name,
      id,
      periodSet,
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[api/chart]", error);
    return NextResponse.json({ error: "chart fetch failed" }, { status: 502 });
  }
}
