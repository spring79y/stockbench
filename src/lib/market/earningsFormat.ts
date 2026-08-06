import type { MarketRegion } from "@/lib/types";

/**
 * Display units for earnings metrics (UI · Evidence pack · briefing).
 * Collector raw numbers stay precise; presentation normalizes for retail compare.
 * Rule: within each metric, one unit — revenue in 조원/억원 (KR) or $B/$M (US);
 * EPS stays 원/주당 or $ (never force EPS into 조).
 */

/** Company-scale revenue — matches Event detail consensus labels. */
export function formatRevenue(value: number, region: MarketRegion): string {
  if (region === "KR") {
    if (value >= 1e12) return `약 ${(value / 1e12).toFixed(1)}조원`;
    if (value >= 1e8) return `약 ${Math.round(value / 1e8).toLocaleString("ko-KR")}억원`;
    return `약 ${value.toLocaleString("ko-KR")}원`;
  }
  if (value >= 1e9) return `약 $${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `약 $${Math.round(value / 1e6)}M`;
  return `약 $${value.toLocaleString("en-US")}`;
}

/** Per-share EPS — always 원 (KR) or $ (US), never 조. */
export function formatEps(value: number, region: MarketRegion): string {
  if (region === "KR") return `약 ${Math.round(value).toLocaleString("ko-KR")}원`;
  return `약 $${value.toFixed(2)}`;
}

/** Prefer stored label; else format raw with the same helper as Event UI. */
export function revenueDisplayLabel(
  opts: { revenueLabel?: string; revenueAvg?: number },
  region: MarketRegion | "GLOBAL",
): string | undefined {
  if (opts.revenueLabel) return opts.revenueLabel;
  if (opts.revenueAvg == null || !Number.isFinite(opts.revenueAvg)) return undefined;
  if (region !== "KR" && region !== "US") return undefined;
  return formatRevenue(opts.revenueAvg, region);
}

export function epsDisplayLabel(
  opts: { epsLabel?: string; epsAvg?: number },
  region: MarketRegion | "GLOBAL",
): string | undefined {
  if (opts.epsLabel) return opts.epsLabel;
  if (opts.epsAvg == null || !Number.isFinite(opts.epsAvg)) return undefined;
  if (region !== "KR" && region !== "US") return undefined;
  return formatEps(opts.epsAvg, region);
}
