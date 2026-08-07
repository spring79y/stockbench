import type { MarketEvent } from "@/lib/types";
import { buildEarningsDetail } from "@/lib/events/earningsDetail";
import { upcomingEvents } from "@/data/mock";
import type { EventChartDef } from "@/lib/market/fetchEventCharts";

export type EventNewsItem = {
  id: string;
  source: string;
  title: string;
  summary: string;
  publishedLabel: string;
};

export type EventDetailContent = {
  meaning: string;
  whyItMatters: string;
  watchPoints: string[];
  /** 이벤트 본연의 경제·시장 지표 차트 (주가 차트가 아님) */
  chartDefs: EventChartDef[];
  chartNote: string;
  news: EventNewsItem[];
};

const DETAILS: Record<string, EventDetailContent> = {
  nfp: {
    meaning:
      "비농업 고용보고서(NFP)는 미국 노동시장이 얼마나 뜨거운지 보여주는 대표 지표입니다. 일자리·실업률·임금 흐름을 한 번에 봅니다.",
    whyItMatters:
      "고용이 예상보다 강하면 ‘금리 인하가 늦어질 수 있다’는 기대로 달러·금리가 움직이고, 미 지수와 국내 투자심리에도 영향을 줄 수 있습니다. 단정 예측이 아니라 변동성 점검용입니다.",
    watchPoints: [
      "비농업 일자리가 시장 예상보다 많았는지/적었는지",
      "실업률·평균 시간당 임금의 방향",
      "발표 직후 달러·미국채 금리·나스닥 반응",
    ],
    chartDefs: [
      {
        id: "payems-mom",
        name: "비농업 고용 증감",
        symbol: "PAYEMS",
        source: "fred",
        transform: "mom",
        points: 18,
        periodLabel: "전월 대비(천 명) · FRED",
      },
      {
        id: "unrate",
        name: "실업률",
        symbol: "UNRATE",
        source: "fred",
        transform: "raw",
        points: 18,
        periodLabel: "월간(%) · FRED",
      },
    ],
    chartNote: "고용 일정의 본체인 비농업 고용·실업률 추이입니다. 주가 차트가 아닙니다.",
    news: [
      {
        id: "nfp-1",
        source: "참고",
        title: "고용 지표 앞두고 금리 인하 기대 재점검",
        summary:
          "시장은 NFP를 통해 ‘경기와 고용의 균형’을 다시 읽으려 합니다. 숫자 자체보다 예상치와의 갭이 중요합니다.",
        publishedLabel: "일정 전 참고",
      },
      {
        id: "nfp-2",
        source: "참고",
        title: "강한 고용 = 달러·금리 변동성 확대 가능",
        summary:
          "고용이 예상보다 강하면 단기적으로 위험자산 조정이 나올 수 있습니다. 반대로 약한 고용은 금리 인하 기대를 키울 수 있습니다.",
        publishedLabel: "일정 전 참고",
      },
    ],
  },
  cpi: {
    meaning:
      "소비자물가지수(CPI)는 미국 물가 흐름을 보는 핵심 지표입니다. 연준의 금리 판단에 자주 연결됩니다.",
    whyItMatters:
      "물가가 예상보다 높으면 금리 인하 기대가 줄고, 낮으면 기대가 커질 수 있습니다. 국내에서는 원/달러·성장주 분위기와 같이 보는 경우가 많습니다.",
    watchPoints: [
      "헤드라인 CPI와 근원 CPI(Core)의 방향",
      "전월 대비·전년 대비 숫자와 시장 예상치 비교",
      "발표 후 미국채 금리·달러·성장주 반응",
    ],
    chartDefs: [
      {
        id: "cpi-yoy",
        name: "CPI 전년비",
        symbol: "CPIAUCSL",
        source: "fred",
        transform: "yoy",
        points: 24,
        periodLabel: "전년 동월비(%) · FRED",
      },
      {
        id: "core-cpi-yoy",
        name: "근원 CPI 전년비",
        symbol: "CPILFESL",
        source: "fred",
        transform: "yoy",
        points: 24,
        periodLabel: "전년 동월비(%) · FRED",
      },
    ],
    chartNote: "물가 일정의 본체인 CPI·근원 CPI(전년비)입니다. 주가 차트가 아닙니다.",
    news: [
      {
        id: "cpi-1",
        source: "참고",
        title: "CPI는 ‘금리 경로’ 기대를 흔드는 숫자",
        summary:
          "한 번의 CPI로 정책을 단정하지 않습니다. 다만 당일 변동성이 커질 수 있어 포지션·비중보다 점검을 우선합니다.",
        publishedLabel: "일정 전 참고",
      },
      {
        id: "cpi-2",
        source: "참고",
        title: "근원 물가가 더 자주 주목받는 이유",
        summary:
          "에너지·식품을 제외한 근원 CPI가 끈질기면, 시장은 금리 인하를 늦춰 보는 경향이 있습니다.",
        publishedLabel: "일정 전 참고",
      },
    ],
  },
  "krx-option": {
    meaning:
      "국내 옵션 만기는 파생상품 계약이 끝나는 날입니다. 만기를 앞두면 헤지·롤오버 때문에 수급 변동이 커질 수 있습니다.",
    whyItMatters:
      "재료가 없어도 지수가 출렁일 수 있는 구간입니다. ‘왜 올랐/내렸지’보다 변동성·수급을 먼저 보는 편이 덜 헷갈립니다.",
    watchPoints: [
      "만기일 전후 코스피·코스피200 흔들림",
      "외국인·기관 수급이 평소와 다른지",
      "개별 호재/악재로 단정하기 전에 만기 효과를 열어두기",
    ],
    chartDefs: [
      {
        id: "ks200",
        name: "코스피200",
        symbol: "^KS200",
        source: "yahoo",
        transform: "raw",
        points: 20,
        periodLabel: "최근 일봉 · 옵션 기초자산",
      },
      {
        id: "vix",
        name: "VIX(참고)",
        symbol: "^VIX",
        source: "yahoo",
        transform: "raw",
        points: 20,
        periodLabel: "최근 일봉 · 변동성 온도",
      },
    ],
    chartNote: "옵션 만기와 맞닿은 코스피200·변동성 온도입니다. 개별 종목 차트가 아닙니다.",
    news: [
      {
        id: "opt-1",
        source: "참고",
        title: "만기 전후엔 ‘재료’보다 수급·변동성",
        summary:
          "만기 효과는 예측 대상이 아닙니다. 다만 평소보다 출렁일 수 있다는 점만 기억하면 과잉 해석을 줄일 수 있습니다.",
        publishedLabel: "일정 전 참고",
      },
      {
        id: "opt-2",
        source: "참고",
        title: "코스피200·시총 상위와 같이 보기",
        summary: "지수만 보고 당황하기보다, 대형주가 같이 움직였는지 보면 체감 온도를 읽기 쉽습니다.",
        publishedLabel: "일정 전 참고",
      },
    ],
  },
  "fomc-minutes": {
    meaning:
      "FOMC 의사록은 연준 회의에서 위원들이 어떤 논의를 했는지 정리한 기록입니다. 이미 끝난 회의의 ‘속마음’에 가깝습니다.",
    whyItMatters:
      "다음 금리 결정의 힌트가 될 수 있지만, 이미 알려진 내용과 겹치면 반응이 작을 수도 있습니다. 톤(매파/비둘기) 변화 여부만 가볍게 확인하면 됩니다.",
    watchPoints: [
      "인플레이션·고용에 대한 위원들 시각",
      "금리 인하/동결 관련 표현의 온도",
      "발표 후 달러·금리·미 지수 반응 크기",
    ],
    chartDefs: [
      {
        id: "fedfunds",
        name: "연준 기준금리",
        symbol: "FEDFUNDS",
        source: "fred",
        transform: "raw",
        points: 24,
        periodLabel: "월간(%) · FRED",
      },
      {
        id: "us10y",
        name: "미 10년물 금리",
        symbol: "^TNX",
        source: "yahoo",
        transform: "raw",
        points: 40,
        periodLabel: "최근 일봉(%)",
      },
    ],
    chartNote: "FOMC와 맞닿은 기준금리·국채 금리 흐름입니다. 주가 차트가 아닙니다.",
    news: [
      {
        id: "fomc-1",
        source: "참고",
        title: "의사록은 ‘이미 지난 회의’의 기록",
        summary:
          "새 정보가 적으면 시장 반응이 미미할 수 있습니다. 그래도 금리 경로 언어가 바뀌었는지는 확인할 가치가 있습니다.",
        publishedLabel: "일정 전 참고",
      },
      {
        id: "fomc-2",
        source: "참고",
        title: "한·미 개미 관점: 환율·금리 민감도 점검",
        summary:
          "미 금리 기대가 움직이면 원/달러와 국내 성장주 분위기도 같이 흔들릴 수 있습니다. 보유 민감도만 점검하세요.",
        publishedLabel: "일정 전 참고",
      },
    ],
  },
};

const GENERIC: EventDetailContent = {
  meaning: "시장에 영향을 줄 수 있는 일정입니다. 숫자를 맞히기보다, 왜 보는지와 무엇을 같이 볼지만 정리합니다.",
  whyItMatters:
    "일정 전후엔 변동성이 커질 수 있습니다. 매수·매도 신호가 아니라, 흔들림에 대비한 점검용으로 보세요.",
  watchPoints: ["발표/만기 시각과 시장 예상", "관련 지수·환율·금리 반응", "평소와 다른 수급·변동성"],
  chartDefs: [
    {
      id: "us10y",
      name: "미 10년물 금리",
      symbol: "^TNX",
      source: "yahoo",
      points: 40,
      periodLabel: "최근 일봉(%)",
    },
    {
      id: "vix",
      name: "VIX",
      symbol: "^VIX",
      source: "yahoo",
      points: 40,
      periodLabel: "최근 일봉",
    },
  ],
  chartNote: "일정이 흔들 수 있는 금리·변동성 온도입니다.",
  news: [
    {
      id: "generic-1",
      source: "참고",
      title: "일정은 ‘예측’이 아니라 ‘점검’ 포인트",
      summary: "결과를 맞히기보다, 내 포트가 어떤 변수에 민감한지 확인하는 데 쓰는 편이 안전합니다.",
      publishedLabel: "일정 전 참고",
    },
  ],
};

export function listKnownEvents(): MarketEvent[] {
  return upcomingEvents;
}

export function findEventById(
  id: string,
  events: MarketEvent[] = upcomingEvents,
): MarketEvent | null {
  return events.find((e) => e.id === id) ?? upcomingEvents.find((e) => e.id === id) ?? null;
}

export function getEventDetail(event: MarketEvent): EventDetailContent {
  if (event.kind === "earnings") {
    return buildEarningsDetail(event);
  }
  return DETAILS[event.id] ?? GENERIC;
}

function briefingKstParts(iso: string): Intl.DateTimeFormatPart[] | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
}

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export function formatBriefingUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "업데이트 기록 없음";
  const parts = briefingKstParts(iso);
  if (!parts) return "업데이트 기록 없음";
  return `${partValue(parts, "month")}.${partValue(parts, "day")} ${partValue(parts, "hour")}:${partValue(parts, "minute")}`;
}

/** Overview stamp — `14:10` KST, or null when unknown. */
export function formatBriefingClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parts = briefingKstParts(iso);
  if (!parts) return null;
  const hour = partValue(parts, "hour");
  const minute = partValue(parts, "minute");
  if (!hour || !minute) return null;
  return `${hour}:${minute}`;
}
