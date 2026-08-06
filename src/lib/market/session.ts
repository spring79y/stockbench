import type { IndexQuote, MarketMood } from "@/lib/types";
import { buildMood, toneWord } from "@/lib/market/map";
import type { MarketScope } from "@/lib/market/scope";
import type { PipelineSlot } from "@/lib/pipeline/types";

function avgChange(list: IndexQuote[]): number {
  if (list.length === 0) return 0;
  return list.reduce((sum, q) => sum + q.changePercent, 0) / list.length;
}

function quotesForScope(quotes: IndexQuote[], scope: MarketScope): IndexQuote[] {
  if (scope === "kr") return quotes.filter((q) => q.region === "KR");
  if (scope === "us") return quotes.filter((q) => q.region === "US");
  return quotes;
}

export function temperatureForScope(quotes: IndexQuote[], scope: MarketScope): string {
  const kr = quotes.filter((q) => q.region === "KR");
  const us = quotes.filter((q) => q.region === "US");

  if (scope === "kr") return `국내 ${toneWord(avgChange(kr))}`;
  if (scope === "us") return `미국 ${toneWord(avgChange(us))}`;
  return `국내 ${toneWord(avgChange(kr))} · 미국 ${toneWord(avgChange(us))}`;
}

/** Mood badge for the active tab — same index set as temperatureForScope. */
export function moodForScope(
  quotes: IndexQuote[],
  scope: MarketScope,
): { mood: MarketMood; moodLabel: string } {
  return buildMood(quotesForScope(quotes, scope));
}

export function summarizeOtherMarket(quotes: IndexQuote[], other: "KR" | "US"): string {
  const list = quotes.filter((q) => q.region === other);
  if (list.length === 0) return other === "KR" ? "국내 시세 없음" : "미국 시세 없음";

  const parts = list.slice(0, 3).map((q) => {
    const sign = q.changePercent > 0 ? "+" : "";
    return `${q.name} ${sign}${q.changePercent.toFixed(2)}%`;
  });
  const label = other === "KR" ? "국내" : "미국";
  return `${label} ${toneWord(avgChange(list))} · ${parts.join(" · ")}`;
}

export type SessionKind = PipelineSlot | "kr-session" | "us-session" | "idle";

function zoneClock(
  timeZone: string,
  now = new Date(),
): { weekend: boolean; weekday: string; mins: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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
    weekend: weekday === "Sat" || weekday === "Sun",
    weekday,
    hour,
    minute,
    mins: hour * 60 + minute,
  };
}

/** America/New_York 이 서머타임(EDT, UTC−4)인지 */
export function isUsDaylightSaving(now = new Date()): boolean {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  // GMT-04:00 / UTC-04:00 → DST, GMT-05:00 → 동절
  const normalized = name.replace("−", "-");
  return /[-−]0?4(?::00)?\b/.test(normalized);
}

/** 서울 시간 기준 대략 슬롯 (주말·공휴일 단순화) */
export function resolveSession(now = new Date()): {
  kind: SessionKind;
  isFullBriefingSlot: boolean;
  label: string;
  note: string;
} {
  const { weekend, mins, hour } = zoneClock("Asia/Seoul", now);

  if (weekend) {
    return {
      kind: "idle",
      isFullBriefingSlot: false,
      label: "휴장",
      note: "풀 브리핑은 장전·장후 슬롯에만 갱신됩니다. 아래는 직전 발행분 + 실시간 시세입니다.",
    };
  }

  // 한국 장전 브리핑 구간: 새벽(미국 장후 직후)~개장 전
  if (mins < 9 * 60) {
    return {
      kind: "kr-pre",
      isFullBriefingSlot: true,
      label: "한국 장전",
      note: "국내 개장 전 · 미국 오버나잇을 반영한 점검 구간",
    };
  }
  if (mins < 15 * 60 + 30) {
    return {
      kind: "kr-session",
      isFullBriefingSlot: false,
      label: "한국 정규장",
      note: "장중에는 풀 브리핑을 새로 쓰지 않습니다. 시세는 실시간, 문구는 직전 장전/장후 발행분입니다.",
    };
  }
  if (mins < 21 * 60) {
    return {
      kind: "kr-post",
      isFullBriefingSlot: true,
      label: "한국 장후",
      note: "국내 마감·시간외 정리 · 밤 미장 앞 점검",
    };
  }

  const dst = isUsDaylightSaving(now);
  const usPreEnd = dst ? 22 * 60 + 30 : 23 * 60 + 30;
  if (mins < usPreEnd) {
    return {
      kind: "us-pre",
      isFullBriefingSlot: true,
      label: "미국 장전",
      note: "미장 개장 전 · 국내 마감 맥락 반영",
    };
  }

  // 미국 정규(서머 22:30~, 동절 23:30~) — 야간~익일 새벽
  const usRegEnd = dst ? 5 : 6;
  if (hour >= 22 || hour < usRegEnd) {
    return {
      kind: "us-session",
      isFullBriefingSlot: false,
      label: "미국 정규장",
      note: "미 장중에는 풀 브리핑을 새로 쓰지 않습니다. 시세는 실시간, 문구는 직전 발행분입니다.",
    };
  }

  return {
    kind: "us-post",
    isFullBriefingSlot: true,
    label: "미국 장후",
    note: "미장 정리 · 다음 국내 장전 연결",
  };
}

export const SLOT_LABEL: Record<PipelineSlot, string> = {
  "kr-pre": "한국 장전",
  "kr-mid": "한국 장중",
  "kr-post": "한국 장후",
  "us-pre": "미국 장전",
  "us-mid": "미국 장중",
  "us-post": "미국 장후",
  "us-noon": "미국 점검",
};

/**
 * 탭·시세 행용 장 상태 라벨
 * - 정규장: KRX 09:00~15:30 / 미 본장
 * - 프리장: 개장 전
 * - 애프터마켓: 장후 시간외(+국내 NXT)
 * - 주간거래: 국내 증권사 미장 주간 세션
 * - 장마감 / 휴장
 */
export type MarketPhaseLabel =
  | "정규장"
  | "프리장"
  | "애프터마켓"
  | "주간거래"
  | "장마감"
  | "휴장";

function phaseFromQuoteStatus(status: string | undefined): MarketPhaseLabel | null {
  if (!status || status === "참고") return null;
  if (status === "장중") return "정규장";
  if (status === "프리" || status === "장전") return "프리장";
  if (status === "애프터" || status === "마감후") return "애프터마켓";
  if (status === "주간") return "주간거래";
  if (status === "마감") return "장마감";
  if (status === "휴장" || status === "주말") return "휴장";
  return null;
}

export function statusLabelForPhase(phase: MarketPhaseLabel, region: "KR" | "US"): string {
  switch (phase) {
    case "정규장":
      return "장중";
    case "프리장":
      return region === "US" ? "프리" : "장전";
    case "애프터마켓":
      return region === "US" ? "애프터" : "마감후";
    case "주간거래":
      return "주간";
    case "휴장":
      return "휴장";
    case "장마감":
    default:
      return "마감";
  }
}

/**
 * 시계 기준 장 상태 (Yahoo marketState보다 우선).
 *
 * 한국 (Asia/Seoul, 평일)
 * - 프리장 08:00~09:00 (NXT 시작·동시호가·장전 시간외)
 * - 정규장 09:00~15:30
 * - 애프터마켓 15:30~20:00 (장후 시간외·단일가·NXT)
 * - 그 외 장마감 / 주말·휴일 휴장
 *
 * 미국 (한국 시각, 서머타임 자동)
 * - 주간거래 10:00~18:00 (서머 09:00~17:00)
 * - 프리장 18:00~23:30 (서머 17:00~22:30)
 * - 정규장 23:30~06:00 (서머 22:30~05:00)
 * - 애프터마켓 06:00~07:00 (서머 05:00~07:00)
 */
export function resolveMarketPhaseByClock(
  region: "KR" | "US",
  now = new Date(),
): MarketPhaseLabel {
  if (region === "KR") {
    const { weekend, mins } = zoneClock("Asia/Seoul", now);
    if (weekend) return "휴장";
    if (mins >= 8 * 60 && mins < 9 * 60) return "프리장";
    if (mins >= 9 * 60 && mins < 15 * 60 + 30) return "정규장";
    // 장후 시간외 종가·단일가 + NXT(~20:00)
    if (mins >= 15 * 60 + 30 && mins < 20 * 60) return "애프터마켓";
    return "장마감";
  }

  const { weekend, mins } = zoneClock("Asia/Seoul", now);
  if (weekend) return "휴장";

  const dst = isUsDaylightSaving(now);
  const dayStart = dst ? 9 * 60 : 10 * 60;
  const dayEnd = dst ? 17 * 60 : 18 * 60;
  const preStart = dst ? 17 * 60 : 18 * 60;
  const preEnd = dst ? 22 * 60 + 30 : 23 * 60 + 30;
  const regEnd = dst ? 5 * 60 : 6 * 60; // 익일
  const afterStart = dst ? 5 * 60 : 6 * 60;
  const afterEnd = 7 * 60;

  // 정규장 (본장, 야간 跨越 넘김)
  if (mins >= preEnd || mins < regEnd) return "정규장";
  // 프리마켓
  if (mins >= preStart && mins < preEnd) return "프리장";
  // 애프터마켓
  if (mins >= afterStart && mins < afterEnd) return "애프터마켓";
  // 국내 증권사 주간 거래
  if (mins >= dayStart && mins < dayEnd) return "주간거래";

  return "장마감";
}

function isActiveSessionPhase(phase: MarketPhaseLabel): boolean {
  return (
    phase === "정규장" ||
    phase === "프리장" ||
    phase === "애프터마켓" ||
    phase === "주간거래"
  );
}

export function resolveMarketPhase(
  region: "KR" | "US",
  quotes: IndexQuote[],
  now = new Date(),
): MarketPhaseLabel {
  const byClock = resolveMarketPhaseByClock(region, now);
  if (byClock === "휴장") return "휴장";

  const hit = quotes.find((q) => q.region === region);
  const byQuote = phaseFromQuoteStatus(hit?.status);

  // 평일인데 시계상 장중·시간외인데 Yahoo가 마감 → 휴일 휴장으로 간주
  if (byQuote === "장마감" && isActiveSessionPhase(byClock)) {
    return "휴장";
  }

  // Yahoo POST 잔상 등으로 밤에 애프터가 남는 문제 방지 — 시계 우선
  return byClock;
}

/** 시세 행 status 를 시계 기준 세션으로 맞춤 */
export function applySessionStatusToQuotes(
  quotes: IndexQuote[],
  now = new Date(),
): IndexQuote[] {
  const kr = resolveMarketPhase("KR", quotes, now);
  const us = resolveMarketPhase("US", quotes, now);
  return quotes.map((q) => ({
    ...q,
    status: statusLabelForPhase(q.region === "KR" ? kr : us, q.region),
  }));
}

export function buildScopeTabHints(quotes: IndexQuote[], now = new Date()) {
  return {
    all: "",
    kr: resolveMarketPhase("KR", quotes, now),
    us: resolveMarketPhase("US", quotes, now),
  } as const;
}
