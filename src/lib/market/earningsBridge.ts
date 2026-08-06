import type { MarketRegion } from "@/lib/types";

/** 섹터 브릿지 — LLM 자동 추론 금지, 운영 고정 맵 */
export type EarningsBridgeSymbol = {
  id: string;
  symbol: string;
  name: string;
  region: MarketRegion;
  sector: "memory" | "ai" | "auto";
  /** 연관 시총 상위 megaCap id */
  relatedMegaCapIds: readonly string[];
  /** Google News / 헤드라인 매칭용 (언론명·티커) */
  newsTerms: readonly string[];
};

export const EARNINGS_BRIDGE_SYMBOLS: readonly EarningsBridgeSymbol[] = [
  {
    id: "sndk",
    symbol: "SNDK",
    name: "샌디스크",
    region: "US",
    sector: "memory",
    relatedMegaCapIds: ["samsung", "skhynix"],
    newsTerms: ["샌디스크", "Sandisk", "SanDisk", "SNDK"],
  },
  {
    id: "mu-bridge",
    symbol: "MU",
    name: "마이크론",
    region: "US",
    sector: "memory",
    relatedMegaCapIds: ["samsung", "skhynix"],
    newsTerms: ["마이크론", "Micron", "MU"],
  },
];

export const SECTOR_CHART_SYMBOLS: Record<
  EarningsBridgeSymbol["sector"],
  Array<{ id: string; name: string; symbol: string }>
> = {
  memory: [
    { id: "sox", name: "필라델피아 반도체(SOX)", symbol: "^SOX" },
    { id: "kospi", name: "코스피", symbol: "^KS11" },
  ],
  ai: [
    { id: "nasdaq", name: "나스닥", symbol: "^IXIC" },
    { id: "sox", name: "필라델피아 반도체(SOX)", symbol: "^SOX" },
  ],
  auto: [
    { id: "kospi", name: "코스피", symbol: "^KS11" },
    { id: "sp500", name: "S&P 500", symbol: "^GSPC" },
  ],
};

export function sectorForMegaCapId(megaCapId: string): EarningsBridgeSymbol["sector"] | null {
  if (megaCapId === "samsung" || megaCapId === "skhynix") return "memory";
  if (megaCapId === "hyundai") return "auto";
  if (megaCapId === "nvda" || megaCapId === "msft" || megaCapId === "googl" || megaCapId === "meta")
    return "ai";
  return null;
}
