import type { PipelineSlot, PipelineMode } from "@/lib/pipeline/types";
import type { MarketScope } from "@/lib/market/scope";

/** 서울 기준 슬롯 목표 시각 (분 단위, 하루 1회 발사) */
export const SLOT_SCHEDULE: Record<
  PipelineSlot,
  { hour: number; minute: number; label: string }
> = {
  /** 미국 장후와 동일 — 오버나잇 반영 후 국내 장전 브리핑 */
  "kr-pre": { hour: 5, minute: 20, label: "한국 장전" },
  "kr-mid": { hour: 11, minute: 30, label: "한국 장중 리프레시" },
  "kr-post": { hour: 15, minute: 40, label: "한국 장후" },
  "us-pre": { hour: 21, minute: 50, label: "미국 장전" },
  "us-mid": { hour: 2, minute: 0, label: "미국 장중 리프레시" },
  "us-post": { hour: 5, minute: 20, label: "미국 장후" },
};

export const ALL_PIPELINE_SLOTS: PipelineSlot[] = [
  "us-post",
  "kr-pre",
  "kr-mid",
  "kr-post",
  "us-pre",
  "us-mid",
];

export function modeForSlot(slot: PipelineSlot): PipelineMode {
  return slot === "kr-mid" || slot === "us-mid" ? "refresh" : "full";
}

/** 슬롯이 갱신하는 탭 — 한국 슬롯은 통합+한국, 미국 슬롯은 통합+미국 */
export function scopesForSlot(slot: PipelineSlot): MarketScope[] {
  if (slot.startsWith("kr-")) return ["all", "kr"];
  return ["all", "us"];
}

export function seoulDateParts(now = new Date()): {
  ymd: string;
  weekday: string;
  hour: number;
  minute: number;
  mins: number;
  weekend: boolean;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hourRaw = Number(get("hour"));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(get("minute"));
  const weekday = get("weekday");
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday,
    hour,
    minute,
    mins: hour * 60 + minute,
    weekend: weekday === "Sat" || weekday === "Sun",
  };
}

export function slotTargetMins(slot: PipelineSlot): number {
  const s = SLOT_SCHEDULE[slot];
  return s.hour * 60 + s.minute;
}

/**
 * 지금 실행해야 할 슬롯들.
 * - 주말 스킵
 * - 목표 시각 이후이면서 아직 발사 안 된 슬롯
 * - us-post / kr-pre 는 둘 다 05:20 (같은 시각에 연속 실행)
 * - us-mid(02:00)는 새벽, 하루 중 가장 이름
 */
export function dueSlots(
  now = new Date(),
  fired: Partial<Record<PipelineSlot, boolean>> = {},
): PipelineSlot[] {
  const { weekend, mins } = seoulDateParts(now);
  if (weekend) return [];

  const order: PipelineSlot[] = [
    "us-mid",
    "us-post",
    "kr-pre",
    "kr-mid",
    "kr-post",
    "us-pre",
  ];
  return order.filter((slot) => {
    if (fired[slot]) return false;
    return mins >= slotTargetMins(slot);
  });
}
