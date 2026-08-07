export type MarketScope = "all" | "kr" | "us";

export const MARKET_SCOPE_TABS: Array<{
  id: MarketScope;
  label: string;
  /** 고정 힌트. 한국/미국은 장 상태로 덮어씀 (시점 둔갑 금지) */
  hint: string;
}> = [
  { id: "all", label: "증시개요", hint: "" },
  { id: "kr", label: "한국 · 오늘 브리핑", hint: "국내" },
  { id: "us", label: "미국 · 오늘 브리핑", hint: "미장" },
];

export function scopeTitle(scope: MarketScope): string {
  if (scope === "kr") return "한국 · 오늘 브리핑";
  if (scope === "us") return "미국 · 오늘 브리핑";
  return "증시개요";
}

export function parseMarketScope(value: string | string[] | undefined): MarketScope {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "kr" || raw === "korea" || raw === "한국") return "kr";
  if (raw === "us" || raw === "usa" || raw === "미국") return "us";
  return "all";
}
