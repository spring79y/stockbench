import type { PipelineSlot, PipelineMode } from "@/lib/pipeline/types";
import type { MarketScope } from "@/lib/market/scope";

/** 서울 기준 슬롯 목표 시각 (분 단위, 하루 1회 발사) */
export const SLOT_SCHEDULE: Record<
  PipelineSlot,
  { hour: number; minute: number; label: string }
> = {
  /** 미국 장후와 동일 — 오버나잇 반영 후 국내 장전 브리핑 */
  "kr-pre": { hour: 7, minute: 0, label: "한국 장전" },
  "kr-mid": { hour: 11, minute: 30, label: "한국 장중 리프레시" },
  "kr-post": { hour: 15, minute: 40, label: "한국 장후" },
  "us-pre": { hour: 21, minute: 50, label: "미국 장전" },
  "us-mid": { hour: 2, minute: 0, label: "미국 장중 리프레시" },
  "us-post": { hour: 7, minute: 0, label: "미국 장후" },
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

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatScopeTabs(slot: PipelineSlot): string {
  return scopesForSlot(slot)
    .map((s) => (s === "all" ? "증시개요" : s === "kr" ? "한국" : "미국"))
    .join(" + ");
}

/** Ops·문서용 — cron 평일 스케줄 (KST 시각순) */
export type PipelineScheduleRow = {
  kst: string;
  slot: string;
  label: string;
  mode: PipelineMode;
  script: string;
  tabs: string;
};

export function pipelineScheduleRows(): PipelineScheduleRow[] {
  const order: PipelineSlot[] = [
    "us-mid",
    "us-post",
    "kr-pre",
    "kr-mid",
    "kr-post",
    "us-pre",
  ];

  const rows: PipelineScheduleRow[] = [];
  for (const slot of order) {
    if (slot === "us-post") {
      // 07:00에 us-post + kr-pre 연속
      const us = SLOT_SCHEDULE["us-post"];
      const kr = SLOT_SCHEDULE["kr-pre"];
      rows.push({
        kst: `${pad2(us.hour)}:${pad2(us.minute)}`,
        slot: "us-post → kr-pre",
        label: `${us.label} → ${kr.label}`,
        mode: "full",
        script: "npm run pipeline -- us-post && npm run pipeline -- kr-pre",
        tabs: `${formatScopeTabs("us-post")} → ${formatScopeTabs("kr-pre")}`,
      });
      continue;
    }
    if (slot === "kr-pre") continue; // bundled with us-post
    const s = SLOT_SCHEDULE[slot];
    rows.push({
      kst: `${pad2(s.hour)}:${pad2(s.minute)}`,
      slot,
      label: s.label,
      mode: modeForSlot(slot),
      script: `npm run pipeline -- ${slot}`,
      tabs: formatScopeTabs(slot),
    });
  }
  return rows;
}

export const PIPELINE_MANUAL_ROWS: PipelineScheduleRow[] = [
  {
    kst: "수동",
    slot: "morning",
    label: "us-post → kr-pre",
    mode: "full",
    script: "npm run pipeline -- us-post && npm run pipeline -- kr-pre",
    tabs: "증시개요 + 미국 → 증시개요 + 한국",
  },
  {
    kst: "수동",
    slot: "all",
    label: "전 슬롯 순차",
    mode: "full",
    script:
      "npm run pipeline -- us-mid && … && npm run pipeline -- us-pre",
    tabs: "us-mid → us-post → kr-pre → kr-mid → kr-post → us-pre",
  },
];


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
 * - us-post / kr-pre 는 둘 다 07:00 (같은 시각에 연속 실행)
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

export type NextSlotInfo = {
  slot: PipelineSlot;
  label: string;
  /** 예: 08.06 11:30 */
  whenLabel: string;
  mode: PipelineMode;
};

/** 이 탭을 갱신하는 다음 슬롯 (평일 기준 · 주말이면 다음 월요일) */
export function nextSlotForScope(
  scope: MarketScope,
  now = new Date(),
): NextSlotInfo | null {
  const candidates: PipelineSlot[] =
    scope === "kr"
      ? ["kr-pre", "kr-mid", "kr-post"]
      : scope === "us"
        ? ["us-mid", "us-post", "us-pre"]
        : ["us-mid", "us-post", "kr-pre", "kr-mid", "kr-post", "us-pre"];

  const parts = seoulDateParts(now);

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const day = seoulDateParts(probe);
    if (day.weekend) continue;

    const dayMins = dayOffset === 0 ? parts.mins : -1;
    const sorted = [...candidates].sort(
      (a, b) => slotTargetMins(a) - slotTargetMins(b),
    );

    for (const slot of sorted) {
      const target = slotTargetMins(slot);
      if (dayOffset === 0 && target <= dayMins) continue;

      const label = SLOT_SCHEDULE[slot].label;
      const md = day.ymd.slice(5).replace("-", ".");
      return {
        slot,
        label,
        whenLabel: `${md} ${pad2(SLOT_SCHEDULE[slot].hour)}:${pad2(SLOT_SCHEDULE[slot].minute)}`,
        mode: modeForSlot(slot),
      };
    }
  }

  return null;
}

/** 웹 푸시 야간 무음: KST 00:00 이상 ~ 07:00 미만 (07:00부터 발송) */
export function isPushQuietHours(now = new Date()): boolean {
  const { hour } = seoulDateParts(now);
  return hour >= 0 && hour < 7;
}

