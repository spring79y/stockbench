import type { IndexQuote } from "@/lib/types";
import { toneWord } from "@/lib/market/map";
import type { MarketScope } from "@/lib/market/scope";
import type { PipelineSlot } from "@/lib/pipeline/types";

function avgChange(list: IndexQuote[]): number {
  if (list.length === 0) return 0;
  return list.reduce((sum, q) => sum + q.changePercent, 0) / list.length;
}

export function temperatureForScope(quotes: IndexQuote[], scope: MarketScope): string {
  const kr = quotes.filter((q) => q.region === "KR");
  const us = quotes.filter((q) => q.region === "US");

  if (scope === "kr") return `국내 ${toneWord(avgChange(kr))}`;
  if (scope === "us") return `미국 ${toneWord(avgChange(us))}`;
  return `국내 ${toneWord(avgChange(kr))} · 미국 ${toneWord(avgChange(us))}`;
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
      label: "주말",
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
      label: "한국 데이마켓",
      note: "장중에는 풀 브리핑을 새로 쓰지 않습니다. 시세는 실시간, 문구는 직전 장전/장후 발행분입니다.",
    };
  }
  if (mins < 21 * 60) {
    return {
      kind: "kr-post",
      isFullBriefingSlot: true,
      label: "한국 장후",
      note: "국내 마감·애프터 정리 · 밤 미장 앞 점검",
    };
  }
  if (mins < 22 * 60 + 30) {
    return {
      kind: "us-pre",
      isFullBriefingSlot: true,
      label: "미국 장전",
      note: "미장 개장 전 · 국내 마감 맥락 반영",
    };
  }

  // 미국 정규(서머 22:30~, 동절 23:30~) — 대략 야간~익일 새벽
  if (hour >= 22 || hour < 5) {
    return {
      kind: "us-session",
      isFullBriefingSlot: false,
      label: "미국 데이마켓",
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
  "kr-post": "한국 장후",
  "us-pre": "미국 장전",
  "us-post": "미국 장후",
};

/** 탭용 짧은 장 상태 라벨 */
export type MarketPhaseLabel = "데이마켓" | "프리장" | "애프터마켓" | "장마감" | "주말";

function phaseFromQuoteStatus(status: string | undefined): MarketPhaseLabel | null {
  if (!status || status === "참고") return null;
  if (status === "장중") return "데이마켓";
  if (status === "프리" || status === "장전") return "프리장";
  if (status === "애프터" || status === "마감후") return "애프터마켓";
  if (status === "마감") return "장마감";
  return null;
}

/**
 * 시계 기준 장 상태.
 * - 한국: Asia/Seoul — 프리 08:00~09:00, 데이 09:00~15:30, 애프터 15:30~18:00
 * - 미국: America/New_York (서머/동절 자동)
 *   - 데이마켓: 09:30~16:00 ET (현금 정규장)
 *   - 프리장: 04:00~09:30, 그리고 월~목 20:00~익일 04:00(심야·PREPRE), 일 18:00~
 *   - 애프터마켓: 16:00~20:00
 */
export function resolveMarketPhaseByClock(
  region: "KR" | "US",
  now = new Date(),
): MarketPhaseLabel {
  if (region === "KR") {
    const { weekend, mins } = zoneClock("Asia/Seoul", now);
    if (weekend) return "주말";
    if (mins >= 8 * 60 && mins < 9 * 60) return "프리장";
    if (mins >= 9 * 60 && mins < 15 * 60 + 30) return "데이마켓";
    // 시간외 단일가·종가 구간
    if (mins >= 15 * 60 + 30 && mins < 18 * 60) return "애프터마켓";
    return "장마감";
  }

  const { weekend, weekday, mins } = zoneClock("America/New_York", now);

  // 일요일 저녁 Globex/프리 개장 이후
  if (weekday === "Sun" && mins >= 18 * 60) return "프리장";
  if (weekend) return "주말";

  // 현금 정규장 = 데이마켓
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "데이마켓";
  // 공식 프리마켓
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "프리장";
  // 애프터마켓
  if (mins >= 16 * 60 && mins < 20 * 60) return "애프터마켓";
  // 월~목 심야(20:00~04:00): PREPRE·선물 야간 — 완전 마감 아님
  if (weekday !== "Fri" && (mins >= 20 * 60 || mins < 4 * 60)) return "프리장";
  // 금요일 새벽(목→금 심야)도 프리
  if (weekday === "Fri" && mins < 4 * 60) return "프리장";

  return "장마감";
}

export function resolveMarketPhase(
  region: "KR" | "US",
  quotes: IndexQuote[],
  now = new Date(),
): MarketPhaseLabel {
  const byClock = resolveMarketPhaseByClock(region, now);
  const hit = quotes.find((q) => q.region === region);
  const byQuote = phaseFromQuoteStatus(hit?.status);

  if (byClock === "주말" || byQuote === "주말") return "주말";

  // Yahoo가 세션을 열어 두면(장중/프리/애프터) 시계의 장마감보다 우선
  if (byQuote === "데이마켓" || byQuote === "프리장" || byQuote === "애프터마켓") {
    // 단, 시계가 데이마켓인데 시세만 프리로 남은 잔상은 시계 따름
    if (byClock === "데이마켓" && byQuote === "프리장") return "데이마켓";
    return byQuote;
  }

  return byClock;
}

export function buildScopeTabHints(quotes: IndexQuote[], now = new Date()) {
  return {
    all: "",
    kr: resolveMarketPhase("KR", quotes, now),
    us: resolveMarketPhase("US", quotes, now),
  } as const;
}
