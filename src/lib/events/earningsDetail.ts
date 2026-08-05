import {
  EARNINGS_BRIDGE_SYMBOLS,
  SECTOR_CHART_SYMBOLS,
  sectorForMegaCapId,
} from "@/lib/market/earningsBridge";
import {
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
} from "@/lib/market/retailScan";
import type { EventDetailContent } from "@/lib/events/catalog";
import type { MarketEvent } from "@/lib/types";

function resolveName(event: MarketEvent): string {
  if (event.megaCapId) {
    const hit =
      MEGA_CAP_CANDIDATES_KR.find((c) => c.id === event.megaCapId) ??
      MEGA_CAP_CANDIDATES_US.find((c) => c.id === event.megaCapId);
    if (hit) return hit.name;
  }
  if (event.bridgeId) {
    return EARNINGS_BRIDGE_SYMBOLS.find((b) => b.id === event.bridgeId)?.name ?? event.title;
  }
  return event.title.replace(/ 실적 발표$/, "");
}

function chartDefsFor(event: MarketEvent) {
  const sector =
    event.sector ?? (event.megaCapId ? sectorForMegaCapId(event.megaCapId) : null) ?? "ai";
  const defs = SECTOR_CHART_SYMBOLS[sector] ?? SECTOR_CHART_SYMBOLS.ai;
  if (event.region === "US" && !defs.some((d) => d.symbol === "^IXIC")) {
    return [
      { id: "nasdaq", name: "나스닥", symbol: "^IXIC", source: "yahoo" as const, points: 60, periodLabel: "최근 일봉(%)" },
      ...defs.map((d) => ({
        id: d.id,
        name: d.name,
        symbol: d.symbol,
        source: "yahoo" as const,
        points: 60,
        periodLabel: "최근 일봉(%)",
      })),
    ].slice(0, 2);
  }
  return defs.slice(0, 2).map((d) => ({
    id: d.id,
    name: d.name,
    symbol: d.symbol,
    source: "yahoo" as const,
    points: 60,
    periodLabel: "최근 일봉(%)",
  }));
}

function consensusLines(event: MarketEvent): string[] {
  const c = event.consensus;
  if (!c) return ["컨센서스 숫자는 참고용이며, 발표 전후 변동할 수 있습니다."];
  const lines: string[] = [];
  if (c.epsLabel) {
    const range =
      c.epsLow != null && c.epsHigh != null
        ? ` (범위 ${event.region === "KR" ? `${Math.round(c.epsLow).toLocaleString()}~${Math.round(c.epsHigh).toLocaleString()}원` : `$${c.epsLow.toFixed(2)}~$${c.epsHigh.toFixed(2)}`})`
        : "";
    lines.push(`EPS 컨센서스: ${c.epsLabel}${range}`);
  }
  if (c.revenueLabel) lines.push(`매출 컨센서스: ${c.revenueLabel}`);
  if (c.isEstimate) lines.push("일정·숫자는 추정치일 수 있습니다.");
  lines.push("예상 대비 서프라이즈 여부는 ‘점검’용이며, 매수·매도 신호가 아닙니다.");
  return lines;
}

export function buildEarningsDetail(event: MarketEvent): EventDetailContent {
  const name = resolveName(event);
  const bridgeNote =
    event.relatedMegaCapIds && event.relatedMegaCapIds.length > 0
      ? `연관 시총: ${event.relatedMegaCapIds
          .map((id) => {
            const kr = MEGA_CAP_CANDIDATES_KR.find((c) => c.id === id)?.name;
            const us = MEGA_CAP_CANDIDATES_US.find((c) => c.id === id)?.name;
            return kr ?? us;
          })
          .filter(Boolean)
          .join(", ")}`
      : null;

  return {
    meaning: `${name}의 분기 실적 발표 일정입니다. 숫자 자체보다, 시장이 기대한 수준과의 차이(서프라이즈)가 지수·섹터 온도에 영향을 줄 수 있습니다.`,
    whyItMatters:
      event.region === "KR" || event.region === "GLOBAL"
        ? "국내 메모리·반도체·성장주 분위기와 연결해 볼 수 있는 체크포인트입니다. 종목 추천이 아니라, 오늘 브리핑·시나리오에서 ‘무엇을 관찰할지’ 잡는 용도입니다."
        : "미국 빅테크·반도체 섹터와 글로벌 리스크 온도를 함께 봅니다. 국내 장은 브릿지 맥락으로만 짧게 연결하세요.",
    watchPoints: [
      ...consensusLines(event),
      "발표 직후 해당 섹터 ETF·지수 반응 (아래 차트)",
      bridgeNote ?? "시총 상위 종목 온도와 함께 볼 것",
      "가이던스(향후 전망) 문구 변화 여부",
    ],
    chartDefs: chartDefsFor(event),
    chartNote: "개별 주가 차트가 아니라, 실적이 흔들 수 있는 섹터·지수 온도입니다.",
    news: [
      {
        id: "earnings-1",
        source: "참고",
        title: `${name} 실적은 ‘맞히기’보다 ‘점검’`,
        summary:
          "컨센서스 대비 높고 낮음을 단정 예측하지 말고, 내가 보는 지수·섹터에 미치는 민감도만 확인하세요.",
        publishedLabel: event.dateLabel,
      },
      {
        id: "earnings-2",
        source: "참고",
        title: "실적 발표 전후 변동성 확대 가능",
        summary:
          "숫자 공개 직전·직후에는 뉴스 헤드라인이 빠르게 바뀔 수 있습니다. 매매 타이밍 신호로 쓰지 마세요.",
        publishedLabel: "일정 전 참고",
      },
    ],
  };
}
