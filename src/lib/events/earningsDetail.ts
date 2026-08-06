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

function indexChartFor(event: MarketEvent): { id: string; name: string; symbol: string } {
  if (event.bridgeId) {
    const sector =
      event.sector ?? (event.megaCapId ? sectorForMegaCapId(event.megaCapId) : null) ?? "memory";
    const defs = SECTOR_CHART_SYMBOLS[sector] ?? SECTOR_CHART_SYMBOLS.memory;
    return defs[0];
  }
  if (event.region === "KR") {
    return { id: "kospi", name: "코스피", symbol: "^KS11" };
  }

  const techIds = new Set(["nvda", "msft", "aapl", "amzn", "googl", "meta", "tsla"]);
  const sector = event.megaCapId ? sectorForMegaCapId(event.megaCapId) : event.sector;
  if (
    (event.megaCapId && techIds.has(event.megaCapId)) ||
    sector === "ai" ||
    sector === "memory"
  ) {
    return { id: "nasdaq", name: "나스닥", symbol: "^IXIC" };
  }
  return { id: "sp500", name: "S&P 500", symbol: "^GSPC" };
}

function chartDefsFor(event: MarketEvent) {
  const name = resolveName(event);
  const index = indexChartFor(event);
  const indexDef = {
    id: index.id,
    name: index.name,
    symbol: index.symbol,
    source: "yahoo" as const,
    points: 60,
    periodLabel: "최근 일봉(%)",
  };

  if (!event.symbol) return [indexDef];

  return [
    {
      id: `stock-${event.id}`,
      name,
      symbol: event.symbol,
      source: "yahoo" as const,
      points: 60,
      periodLabel: "최근 일봉(%)",
    },
    indexDef,
  ];
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
  // 실제 발표가 잡혀 있으면 “추정치” 안내는 혼선을 줄이기 위해 생략
  if (c.isEstimate && !event.actual) lines.push("일정·숫자는 추정치일 수 있습니다.");
  lines.push("예상 대비 서프라이즈 여부는 ‘점검’용이며, 매수·매도 신호가 아닙니다.");
  return lines;
}

function actualLines(event: MarketEvent): string[] {
  const epsActual = event.actual?.epsActual;
  const epsEstimate = event.actual?.epsEstimate;
  if (epsActual == null || epsEstimate == null) return [];
  const a = event.actual!;
  const region = event.region === "KR" ? "KR" : "US";

  const formatEps = (v: number) => {
    if (region === "KR") return `${Math.round(v).toLocaleString()}원`;
    return `$${v.toFixed(2)}`;
  };

  // Never re-derive beat in UI — only Evidence beatLabel (Collector-resolved).
  // Thin-source omit must stay omitted even if raw EPS vs estimate looks like a beat.
  const beat = a.beatLabel;
  const pct =
    beat && a.surprisePct != null && Number.isFinite(a.surprisePct)
      ? a.surprisePct
      : undefined;
  const pctNote =
    beat && pct != null && Number.isFinite(pct)
      ? ` (괴리 ${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)`
      : "";

  // Thin-source: numbers only — no qualitative Collector judgment in UI.
  const lines = [
    `발표 결과(EPS): 실제 ${formatEps(epsActual)} · 예상 ${formatEps(epsEstimate)}`,
  ];
  if (beat) {
    lines.push(`예상 대비(EPS): ${beat}${pctNote}`);
  }
  return lines;
}

function contextNewsWatchPoints(event: MarketEvent): string[] {
  const news = event.contextNews ?? [];
  if (news.length === 0) {
    return ["가이던스(향후 전망) — Evidence 뉴스 없으면 단정·추측 금지"];
  }
  return news.slice(0, 3).map(
    (n) =>
      `뉴스 참고: ${n.snippet} (${n.publisher}${n.publishedAt ? ` · ${n.publishedAt.slice(0, 10)}` : ""})`,
  );
}

function contextNewsItems(event: MarketEvent, name: string): EventDetailContent["news"] {
  const news = event.contextNews ?? [];
  if (news.length > 0) {
    return news.slice(0, 3).map((n, i) => ({
      id: `earnings-ctx-${i}`,
      source: n.publisher || "뉴스",
      title: n.title,
      summary: n.snippet,
      publishedLabel: n.publishedAt ? n.publishedAt.slice(0, 10) : event.dateLabel,
    }));
  }
  return [
    {
      id: "earnings-1",
      source: "참고",
      title: `${name} 실적은 ‘맞히기’보다 ‘점검’`,
      summary:
        "컨센서스 대비 높고 낮음을 단정 예측하지 말고, 내가 보는 지수·섹터에 미치는 민감도만 확인하세요. 가이던스·반응은 Evidence 뉴스가 수집된 뒤에만 브리핑에 반영됩니다.",
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
  ];
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
      ...actualLines(event),
      ...consensusLines(event),
      "발표 직후 해당 종목·소속 지수 반응 (아래 차트)",
      bridgeNote ?? "시총 상위 종목 온도와 함께 볼 것",
      ...contextNewsWatchPoints(event),
    ],
    chartDefs: chartDefsFor(event),
    chartNote: "발표 기업 주가와 소속 지수 온도입니다. 매매 신호가 아닙니다.",
    news: contextNewsItems(event, name),
  };
}
