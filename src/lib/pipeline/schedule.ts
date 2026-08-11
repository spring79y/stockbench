import type { PipelineSlot, PipelineMode } from "@/lib/pipeline/types";
import type { MarketScope } from "@/lib/market/scope";

/** 서울 기준 슬롯 목표 시각 (분 단위, 하루 1회 발사) */
export const SLOT_SCHEDULE: Record<
  PipelineSlot,
  { hour: number; minute: number; label: string }
> = {
  /** 미국 장후와 동일 — 오버나잇 반영 후 국내 장전 브리핑 */
  "kr-pre": { hour: 7, minute: 0, label: "한국 장전" },
  "kr-mid": { hour: 12, minute: 30, label: "한국 장중" },
  "kr-post": { hour: 15, minute: 40, label: "한국 장후" },
  "us-pre": { hour: 21, minute: 50, label: "미국 장전" },
  "us-mid": { hour: 2, minute: 0, label: "미국 장중" },
  "us-post": { hour: 7, minute: 0, label: "미국 장후" },
  /** 한국 장중과 동시 — 미국 탭 07:00~21:50 공백 메움 */
  "us-noon": { hour: 12, minute: 30, label: "미국 점검" },
};

export const ALL_PIPELINE_SLOTS: PipelineSlot[] = [
  "us-post",
  "kr-pre",
  "us-noon",
  "kr-mid",
  "kr-post",
  "us-pre",
  "us-mid",
];

/** 한·미 장전·장중·장후 모두 풀 (시나리오·점검 포함). refresh 모드는 레거시 호환용 */
export function modeForSlot(_slot: PipelineSlot): PipelineMode {
  return "full";
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
  // Auto cron only — us-mid(02:00) is manual / all-bundle.
  const order: PipelineSlot[] = [
    "us-post",
    "kr-pre",
    "us-noon",
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
    if (slot === "us-noon") {
      // 12:30에 us-noon + kr-mid 연속 (미국 낮 공백 메움 + 한국 장중)
      const us = SLOT_SCHEDULE["us-noon"];
      const kr = SLOT_SCHEDULE["kr-mid"];
      rows.push({
        kst: `${pad2(us.hour)}:${pad2(us.minute)}`,
        slot: "us-noon → kr-mid",
        label: `${us.label} → ${kr.label}`,
        mode: "full",
        script: "npm run pipeline -- us-noon && npm run pipeline -- kr-mid",
        tabs: `${formatScopeTabs("us-noon")} → ${formatScopeTabs("kr-mid")}`,
      });
      continue;
    }
    if (slot === "kr-mid") continue; // bundled with us-noon
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
    slot: "us-mid",
    label: "미국 장중 (자동 cron 없음)",
    mode: "full",
    script: "npm run pipeline -- us-mid",
    tabs: formatScopeTabs("us-mid"),
  },
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
    tabs: "us-mid → us-post → kr-pre → us-noon → kr-mid → kr-post → us-pre",
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
 * 지금 실행해야 할 슬롯들 (로컬 schedule-pipeline용 · 자동 cron과 동일).
 * - 주말 스킵
 * - 목표 시각 이후이면서 아직 발사 안 된 슬롯
 * - us-post / kr-pre 는 둘 다 07:00 (같은 시각에 연속 실행)
 * - us-mid(02:00)는 자동에서 제외 (수동만)
 */
export function dueSlots(
  now = new Date(),
  fired: Partial<Record<PipelineSlot, boolean>> = {},
): PipelineSlot[] {
  const { weekend, mins } = seoulDateParts(now);
  if (weekend) return [];

  const order: PipelineSlot[] = [
    "us-post",
    "kr-pre",
    "us-noon",
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

/** 탭에 표시된 가장 최근 발행(슬롯·시각) — 다음 슬롯 계산에 사용 */
export type LastPublishedSlot = {
  slot: PipelineSlot;
  publishedAt: string;
};

/** Auto-scheduled slots only (us-mid is manual). */
function candidatesForScope(scope: MarketScope): PipelineSlot[] {
  if (scope === "kr") return ["kr-pre", "kr-mid", "kr-post"];
  if (scope === "us") return ["us-post", "us-noon", "us-pre"];
  return ["us-post", "kr-pre", "us-noon", "kr-mid", "kr-post", "us-pre"];
}

/**
 * 오늘 이미 소화된 슬롯의 목표 시각 상한(분).
 * 최신 발행이 오늘·이 탭 후보 슬롯이면 그 시각 이하를 완료로 본다.
 * (latest.json은 슬롯 이력 없이 최신만 있으므로, 그보다 이른 당일 슬롯은 발행된 것으로 간주)
 */
function satisfiedThroughMins(
  candidates: PipelineSlot[],
  todayYmd: string,
  last?: LastPublishedSlot | null,
): number {
  if (!last?.slot || !last.publishedAt) return -1;
  if (!candidates.includes(last.slot)) return -1;
  const publishedDay = seoulDateParts(new Date(last.publishedAt));
  if (publishedDay.ymd !== todayYmd) return -1;
  return slotTargetMins(last.slot);
}

/**
 * 이 탭을 갱신하는 다음 슬롯 (평일 기준 · 주말이면 다음 월요일).
 *
 * 벽시계만 보면 12:30이 지난 뒤 미발행 noon을 건너뛰고 15:40을 보여 준다.
 * `lastPublished`가 있으면 당일 미발행 슬롯(지연·누락 포함)을 다음으로 유지한다.
 * 예: kr-pre 발행 후 · noon 미발행 · 14:00 → kr-mid 12:30.
 */
export function nextSlotForScope(
  scope: MarketScope,
  now = new Date(),
  lastPublished?: LastPublishedSlot | null,
): NextSlotInfo | null {
  const candidates = candidatesForScope(scope);
  const parts = seoulDateParts(now);
  const doneThrough = satisfiedThroughMins(candidates, parts.ymd, lastPublished);

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const day = seoulDateParts(probe);
    if (day.weekend) continue;

    const sorted = [...candidates].sort(
      (a, b) => slotTargetMins(a) - slotTargetMins(b),
    );

    for (const slot of sorted) {
      const target = slotTargetMins(slot);
      if (dayOffset === 0) {
        if (doneThrough >= 0) {
          // 당일 최신 발행 이후 슬롯만 (시각이 지났어도 미발행이면 유지)
          if (target <= doneThrough) continue;
        } else {
          // 발행 증거 없음 → 벽시계 기준 (기존 동작)
          if (target <= parts.mins) continue;
        }
      }

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

