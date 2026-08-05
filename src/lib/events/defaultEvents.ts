import type { MarketEvent } from "@/lib/types";

export function defaultPipelineEvents(): MarketEvent[] {
  return [
    {
      id: "nfp",
      dateLabel: "08.07 (금)",
      region: "US",
      title: "미국 고용보고서 (NFP)",
      level: "high",
      oneLiner: "일자리 성적표 — 금리 기대와 달러·미 지수에 영향",
      kind: "macro",
    },
    {
      id: "cpi",
      dateLabel: "08.12 (수)",
      region: "US",
      title: "미국 소비자물가 (CPI)",
      level: "high",
      oneLiner: "물가 지표 — 금리 인하 기대를 흔드는 핵심 숫자",
      kind: "macro",
    },
    {
      id: "krx-option",
      dateLabel: "08.13 (목)",
      region: "KR",
      title: "국내 옵션 만기",
      level: "medium",
      oneLiner: "수급·변동성 확대 가능 — 재료보다 흔들림에 주의",
      kind: "macro",
    },
    {
      id: "fomc-minutes",
      dateLabel: "08.20 (목)",
      region: "US",
      title: "FOMC 의사록",
      level: "medium",
      oneLiner: "연준 회의 속마음 — 다음 금리 경로 힌트 확인",
      kind: "macro",
    },
  ];
}
