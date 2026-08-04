import type {
  CheckItem,
  DailyBriefing,
  IndexQuote,
  MacroChip,
  MarketEvent,
  Scenario,
} from "@/lib/types";

/** 브리핑·시나리오·점검·일정용 샘플. 시세는 fetchLiveMarket이 실제 값을 가져오고, 실패 시에만 아래 fallback 사용 */
export const dailyBriefing: DailyBriefing = {
  asOfLabel: "2026.08.03 · 장 마감 기준",
  mood: "caution",
  moodLabel: "주의",
  temperature: "국내 약세 · 미국 보합",
  headline: "국내가 더 흔들린 날 — 환율·금리를 먼저 보세요",
  bullets: [
    "코스피·코스닥이 동반 약세. 개별 종목보다 시장 전체 분위기 점검이 우선입니다.",
    "원/달러가 상승(원화 약세). 외국인 수급·투자심리에 부담이 될 수 있습니다.",
    "미국은 큰 방향성 없이 숨 고르기. 이번 주 고용·물가 일정이 변수가 됩니다.",
  ],
  evidenceIds: ["usdkkrw", "us10y", "vix"],
};

export const indexQuotes: IndexQuote[] = [
  // fallback only — live path uses Yahoo Finance
  {
    id: "kospi",
    name: "코스피",
    shortName: "KOSPI",
    region: "KR",
    value: 3257.45,
    change: -38.0,
    changePercent: -1.15,
    status: "마감",
  },
  {
    id: "kosdaq",
    name: "코스닥",
    shortName: "KOSDAQ",
    region: "KR",
    value: 892.14,
    change: -12.48,
    changePercent: -1.38,
    status: "마감",
  },
  {
    id: "nasdaq",
    name: "나스닥",
    shortName: "NASDAQ",
    region: "US",
    value: 21482.3,
    change: 86.42,
    changePercent: 0.4,
    status: "전일",
  },
  {
    id: "sp500",
    name: "S&P 500",
    shortName: "S&P",
    region: "US",
    value: 6384.12,
    change: 18.75,
    changePercent: 0.29,
    status: "전일",
  },
  {
    id: "dow",
    name: "다우",
    shortName: "DOW",
    region: "US",
    value: 44892.55,
    change: -64.2,
    changePercent: -0.14,
    status: "전일",
  },
  {
    id: "sox",
    name: "반도체",
    shortName: "SOX",
    region: "US",
    value: 6124.8,
    change: 42.15,
    changePercent: 0.69,
    status: "전일",
  },
];

export const macroChips: MacroChip[] = [
  {
    id: "usdkkrw",
    name: "원/달러",
    value: "1,387.20",
    changeLabel: "+4.80",
    direction: "up",
  },
  {
    id: "us10y",
    name: "미 10년물",
    value: "4.28%",
    changeLabel: "+0.03%p",
    direction: "up",
  },
  {
    id: "wti",
    name: "WTI",
    value: "$78.42",
    changeLabel: "-0.85%",
    direction: "down",
  },
  {
    id: "vix",
    name: "VIX",
    value: "16.8",
    changeLabel: "+0.9",
    direction: "up",
  },
];

export const scenarios: Scenario[] = [
  {
    id: "base",
    label: "A · 기본",
    title: "변동성 속 관망",
    summary:
      "국내 조정이 이어지더라도 미국이 크게 흔들리지 않으면, ‘급락 재료’보다 숨 고르기로 읽는 경우가 많습니다.",
    implication:
      "추격 매수·패닉 매도보다, 보유 비중과 이벤트 일정을 먼저 확인하는 쪽이 덜 위험합니다.",
  },
  {
    id: "risk",
    label: "B · 주의",
    title: "환율·금리 부담 확대",
    summary:
      "원/달러가 추가로 오르거나 미국 금리가 더 튀면, 국내 투자심리와 성장주 쪽에 부담이 커질 수 있습니다.",
    implication:
      "환율·금리에 민감한 비중이 큰지 점검하고, 단기 일정(고용·물가) 전후 변동성에 대비하세요.",
  },
];

export const checkItems: CheckItem[] = [
  {
    id: "fx",
    text: "원/달러의 하루·일주일 움직임",
    why: "환율 급변은 국내 분위기와 외국인 수급에 바로 영향을 줄 수 있습니다.",
  },
  {
    id: "event",
    text: "오늘·이번 주 필수 이벤트(고용·물가·만기)",
    why: "일정 앞에서는 ‘방향’보다 ‘흔들림’이 커지는 경우가 많습니다.",
  },
  {
    id: "exposure",
    text: "보유가 금리·환율·반도체 등 특정 테마에 치우친 정도",
    why: "시장 전체가 아니라 내 포트가 어디에 노출됐는지가 의사결정의 출발점입니다.",
  },
  {
    id: "horizon",
    text: "지금 판단의 시간 범위(단기 매매 vs 중장기 보유)",
    why: "같은 뉴스도 투자 기간에 따라 대응이 달라집니다.",
  },
];

export const upcomingEvents: MarketEvent[] = [
  {
    id: "nfp",
    dateLabel: "08.07 (금)",
    region: "US",
    title: "미국 고용보고서 (NFP)",
    level: "high",
    oneLiner: "일자리 성적표 — 금리 기대와 달러·미 지수에 영향",
  },
  {
    id: "cpi",
    dateLabel: "08.12 (수)",
    region: "US",
    title: "미국 소비자물가 (CPI)",
    level: "high",
    oneLiner: "물가 지표 — 금리 인하 기대를 흔드는 핵심 숫자",
  },
  {
    id: "krx-option",
    dateLabel: "08.13 (목)",
    region: "KR",
    title: "국내 옵션 만기",
    level: "medium",
    oneLiner: "수급·변동성 확대 가능 — 재료보다 흔들림에 주의",
  },
  {
    id: "fomc-minutes",
    dateLabel: "08.20 (목)",
    region: "US",
    title: "FOMC 의사록",
    level: "medium",
    oneLiner: "연준 회의 속마음 — 다음 금리 경로 힌트 확인",
  },
];
