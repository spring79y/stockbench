export type MarketScope = "all" | "kr" | "us";

export const MARKET_SCOPE_TABS: Array<{
  id: MarketScope;
  label: string;
  /** 고정 힌트. 한국/미국은 장 상태로 덮어씀 */
  hint: string;
}> = [
  { id: "all", label: "증시개요", hint: "" },
  { id: "kr", label: "한국", hint: "국내" },
  { id: "us", label: "미국", hint: "미장" },
];

export function scopeTitle(scope: MarketScope): string {
  if (scope === "kr") return "한국 시장";
  if (scope === "us") return "미국 시장";
  return "증시개요";
}

export function parseMarketScope(value: string | string[] | undefined): MarketScope {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "kr" || raw === "korea" || raw === "한국") return "kr";
  if (raw === "us" || raw === "usa" || raw === "미국") return "us";
  return "all";
}
