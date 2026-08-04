import type { ChangeDirection } from "@/lib/types";

export function formatIndexValue(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSigned(value: number, digits = 2): string {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

export function directionFromChange(change: number): ChangeDirection {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

/** 국내 관례: 상승=빨강, 하락=파랑 */
export function changeToneClass(direction: ChangeDirection): string {
  if (direction === "up") return "text-rise";
  if (direction === "down") return "text-fall";
  return "text-muted";
}
