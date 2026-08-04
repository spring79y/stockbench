import { marketStateLabel } from "@/lib/market/map";
import type { YahooQuoteLike } from "@/lib/market/map";
import type { ChangeDirection, IndexQuote, MacroChip } from "@/lib/types";

export type MegaCapQuote = {
  id: string;
  symbol: string;
  name: string;
  value: number;
  changePercent: number;
  marketCap: number;
  marketCapLabel: string;
  status: string;
  region: "KR" | "US";
};

export type SignalChip = {
  id: string;
  name: string;
  value: string;
  hint: string;
  direction: ChangeDirection;
};

export type FlowLeg = {
  dateLabel: string;
  personal: number;
  foreign: number;
  institution: number;
};

export type RetailScanBundle = {
  ks200: {
    name: string;
    value: number;
    changePercent: number;
    status: string;
    note: string;
  } | null;
  /** @deprecated topCapsKr 사용 */
  topCaps: MegaCapQuote[];
  topCapsKr: MegaCapQuote[];
  topCapsUs: MegaCapQuote[];
  signals: SignalChip[];
  flow: {
    status: "live" | "pending";
    summary: string;
    note: string;
    asOfLabel: string;
    kospi: FlowLeg | null;
    kosdaq: FlowLeg | null;
    kospiHistory: FlowLeg[];
    kosdaqHistory: FlowLeg[];
    /** 국내 종목별 수급 (mega id → 일별, 단위: 주) */
    byStock: Record<string, FlowLeg[]>;
  };
  summaries: {
    ks200: string;
    topCaps: string;
    topCapsKr: string;
    topCapsUs: string;
    signal: string;
    flow: string;
  };
};

export type MegaCapCandidate = {
  id: string;
  symbol: string;
  /** UI 표시명 */
  name: string;
  /**
   * 뉴스 검색·관련성 판정용 표기.
   * UI 이름과 언론 표기가 다르거나(알파벳→구글), 약칭이 애매할 때 필수.
   * 티커는 resolver가 자동 추가.
   */
  newsTerms: readonly string[];
};

/** 국내 시총 상위 후보 — 실시간 marketCap으로 상위 5 정렬 */
export const MEGA_CAP_CANDIDATES_KR: readonly MegaCapCandidate[] = [
  { id: "samsung", symbol: "005930.KS", name: "삼성전자", newsTerms: ["삼성전자", "삼전"] },
  { id: "skhynix", symbol: "000660.KS", name: "SK하이닉스", newsTerms: ["SK하이닉스", "하이닉스"] },
  {
    id: "hyundai",
    symbol: "005380.KS",
    name: "현대차",
    newsTerms: ["현대차", "현대자동차"],
  },
  {
    id: "lgenergy",
    symbol: "373220.KS",
    name: "LG에너지솔루션",
    newsTerms: ["LG에너지솔루션", "LG엔솔", "엘지에너지"],
  },
  {
    id: "sambio",
    symbol: "207940.KS",
    name: "삼성바이오로직스",
    newsTerms: ["삼성바이오로직스", "삼성바이오"],
  },
  { id: "celltrion", symbol: "068270.KS", name: "셀트리온", newsTerms: ["셀트리온"] },
  { id: "naver", symbol: "035420.KS", name: "NAVER", newsTerms: ["네이버", "NAVER"] },
];

/** 미국 시총 상위 후보 */
export const MEGA_CAP_CANDIDATES_US: readonly MegaCapCandidate[] = [
  {
    id: "nvda",
    symbol: "NVDA",
    name: "엔비디아",
    newsTerms: ["엔비디아", "NVIDIA", "Nvidia"],
  },
  {
    id: "msft",
    symbol: "MSFT",
    name: "마이크로소프트",
    newsTerms: ["마이크로소프트", "Microsoft", "MSFT"],
  },
  { id: "aapl", symbol: "AAPL", name: "애플", newsTerms: ["애플", "Apple", "AAPL"] },
  { id: "amzn", symbol: "AMZN", name: "아마존", newsTerms: ["아마존", "Amazon", "AMZN"] },
  {
    id: "googl",
    symbol: "GOOGL",
    name: "알파벳",
    newsTerms: ["구글", "Google", "Alphabet", "GOOGL", "GOOG"],
  },
  {
    id: "meta",
    symbol: "META",
    name: "메타",
    newsTerms: ["메타", "Meta", "페이스북", "Facebook", "META"],
  },
  { id: "tsla", symbol: "TSLA", name: "테슬라", newsTerms: ["테슬라", "Tesla", "TSLA"] },
  {
    id: "brkb",
    symbol: "BRK-B",
    name: "버크셔",
    newsTerms: ["버크셔", "Berkshire", "BRK", "버핏"],
  },
];

/** 하위호환 */
export const MEGA_CAP_CANDIDATES = MEGA_CAP_CANDIDATES_KR;

const MEGA_CAP_BY_ID = new Map(
  [...MEGA_CAP_CANDIDATES_KR, ...MEGA_CAP_CANDIDATES_US].map((c) => [c.id, c]),
);
const MEGA_CAP_BY_SYMBOL = new Map(
  [...MEGA_CAP_CANDIDATES_KR, ...MEGA_CAP_CANDIDATES_US].map((c) => [c.symbol.toUpperCase(), c]),
);

/** 티커 표기 정규화 (005930.KS → 005930, BRK-B → BRK.B / BRKB 변형 포함) */
export function tickerVariants(symbol: string): string[] {
  const raw = symbol.trim();
  if (!raw) return [];
  const base = raw.replace(/\.(KS|KQ)$/i, "");
  const noHyphen = base.replace(/-/g, "");
  const dotted = base.replace(/-/g, ".");
  return [...new Set([raw, base, noHyphen, dotted].filter(Boolean))];
}

export type StockNewsIdentity = {
  /** 언론·통칭 (구글, Google, 삼성전자 …) */
  mediaTerms: string[];
  /** 티커 변형 (GOOGL, GOOG, 005930 …) */
  tickerTerms: string[];
  /** 관련성 필터용 전체 */
  matchTerms: string[];
};

function uniqueTerms(terms: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    const trimmed = t.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * 종목 뉴스 검색 identity.
 * UI 표시명(알파벳)만 쓰지 않고, 카탈로그의 언론 표기 + 티커를 사용.
 */
export function resolveNewsIdentity(input: {
  id?: string;
  symbol: string;
  name: string;
}): StockNewsIdentity {
  const hit =
    (input.id ? MEGA_CAP_BY_ID.get(input.id) : undefined) ??
    MEGA_CAP_BY_SYMBOL.get(input.symbol.toUpperCase());

  const mediaTerms = uniqueTerms(
    hit?.newsTerms?.length ? [...hit.newsTerms] : [input.name],
  );
  const tickerTerms = uniqueTerms(tickerVariants(hit?.symbol ?? input.symbol));
  return {
    mediaTerms,
    tickerTerms,
    matchTerms: uniqueTerms([...mediaTerms, ...tickerTerms]),
  };
}

/** @deprecated resolveNewsIdentity 사용 */
export function resolveNewsTerms(input: {
  id?: string;
  symbol: string;
  name: string;
}): string[] {
  return resolveNewsIdentity(input).matchTerms;
}

export const KS200_SYMBOL = "^KS200";

export function formatMarketCapKrw(marketCap: number): string {
  const jo = marketCap / 1e12;
  if (jo >= 1) return `${jo.toFixed(1)}조`;
  const eok = marketCap / 1e8;
  return `${eok.toFixed(0)}억`;
}

export function formatMarketCapUsd(marketCap: number): string {
  const t = marketCap / 1e12;
  if (t >= 1) return `$${t.toFixed(2)}T`;
  const b = marketCap / 1e9;
  return `$${b.toFixed(0)}B`;
}

const FLOW_PENDING_SUMMARY =
  "시장 단위 수급(외국인·기관·개인) 요약은 연동 준비 중. 종목별 매매 신호로 쓰지 않습니다.";

const FLOW_LIVE_NOTE =
  "일별·장후 집계 성격입니다. 장중 실시간 호가가 아니며, 종목 매매 신호가 아닙니다.";

function pickTopCaps(
  quotes: Record<string, YahooQuoteLike>,
  candidates: ReadonlyArray<MegaCapCandidate>,
  region: "KR" | "US",
): MegaCapQuote[] {
  return candidates
    .flatMap((def) => {
      const raw = quotes[def.symbol];
      if (raw?.regularMarketPrice == null || raw.marketCap == null) return [];
      const marketCap = Number(raw.marketCap);
      return [
        {
          id: def.id,
          symbol: def.symbol,
          name: def.name,
          value: Number(raw.regularMarketPrice),
          changePercent: Number(raw.regularMarketChangePercent ?? 0),
          marketCap,
          marketCapLabel:
            region === "US" ? formatMarketCapUsd(marketCap) : formatMarketCapKrw(marketCap),
          status: marketStateLabel(raw.marketState, region),
          region,
        },
      ];
    })
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 5);
}

function summarizeCaps(caps: MegaCapQuote[]): string {
  return caps.length > 0
    ? caps.map((q) => `${q.name} ${q.changePercent.toFixed(2)}%`).join(", ")
    : "시총상위 없음";
}

export function emptyRetailScan(): RetailScanBundle {
  return {
    ks200: null,
    topCaps: [],
    topCapsKr: [],
    topCapsUs: [],
    signals: [],
    flow: {
      status: "pending",
      summary: FLOW_PENDING_SUMMARY,
      note: FLOW_LIVE_NOTE,
      asOfLabel: "",
      kospi: null,
      kosdaq: null,
      kospiHistory: [],
      kosdaqHistory: [],
      byStock: {},
    },
    summaries: {
      ks200: "코스피200 데이터 없음",
      topCaps: "시총 상위 데이터 없음",
      topCapsKr: "국내 시총 상위 데이터 없음",
      topCapsUs: "미국 시총 상위 데이터 없음",
      signal: "기대·경계 신호 없음",
      flow: "수급 연동 준비 중",
    },
  };
}

export function buildRetailScan(
  quotes: Record<string, YahooQuoteLike>,
  indexes: IndexQuote[],
  macros: MacroChip[],
  investorFlow?: {
    status: "live" | "pending";
    summary: string;
    note: string;
    asOfLabel: string;
    kospi: FlowLeg | null;
    kosdaq: FlowLeg | null;
    kospiHistory?: FlowLeg[];
    kosdaqHistory?: FlowLeg[];
    byStock?: Record<string, FlowLeg[]>;
  },
): RetailScanBundle {
  const ksRaw = quotes[KS200_SYMBOL];
  const ks200 =
    ksRaw?.regularMarketPrice != null
      ? {
          name: "코스피200",
          value: Number(ksRaw.regularMarketPrice),
          changePercent: Number(ksRaw.regularMarketChangePercent ?? 0),
          status: marketStateLabel(ksRaw.marketState, "KR"),
          note: "현물 지수 참고(Yahoo ^KS200). 야간선물 UI와 별개 · 갭 신호용.",
        }
      : null;

  const topCapsKr = pickTopCaps(quotes, MEGA_CAP_CANDIDATES_KR, "KR");
  const topCapsUs = pickTopCaps(quotes, MEGA_CAP_CANDIDATES_US, "US");
  const topCaps = topCapsKr;

  const kospi = indexes.find((q) => q.id === "kospi");
  const vix = macros.find((m) => m.id === "vix");
  const signals: SignalChip[] = [];

  if (ks200 && kospi) {
    const gap = ks200.changePercent - kospi.changePercent;
    signals.push({
      id: "ks200-vs-kospi",
      name: "KS200−코스피",
      value: `${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%p`,
      hint:
        Math.abs(gap) < 0.3
          ? "대형주와 지수가 비슷하게 움직임"
          : gap > 0
            ? "코스피200이 상대적으로 덜 약함/더 강함 — 대형주 온도 참고"
            : "코스피200이 상대적으로 더 약함 — 대형주 충격 참고",
      direction: gap > 0.15 ? "up" : gap < -0.15 ? "down" : "flat",
    });
  }

  if (vix) {
    signals.push({
      id: "vix-temp",
      name: "VIX 온도",
      value: vix.value,
      hint:
        vix.direction === "up"
          ? "변동성 경계가 커지는 쪽 — 방향보다 흔들림 점검"
          : "변동성 경계가 완화되는 쪽일 수 있음 — 단정 금지",
      direction: vix.direction,
    });
  }

  if (topCapsKr.length >= 2) {
    const avgTop = topCapsKr.reduce((s, q) => s + q.changePercent, 0) / topCapsKr.length;
    signals.push({
      id: "top5-kr-avg",
      name: "국내시총5 평균",
      value: `${avgTop >= 0 ? "+" : ""}${avgTop.toFixed(2)}%`,
      hint: "국내 큰 종목들 체감 온도 — 예측이 아니라 맥락",
      direction: avgTop > 0.2 ? "up" : avgTop < -0.2 ? "down" : "flat",
    });
  }

  if (topCapsUs.length >= 2) {
    const avgTop = topCapsUs.reduce((s, q) => s + q.changePercent, 0) / topCapsUs.length;
    signals.push({
      id: "top5-us-avg",
      name: "미시총5 평균",
      value: `${avgTop >= 0 ? "+" : ""}${avgTop.toFixed(2)}%`,
      hint: "미국 큰 종목들 체감 온도 — 예측이 아니라 맥락",
      direction: avgTop > 0.2 ? "up" : avgTop < -0.2 ? "down" : "flat",
    });
  }

  const flow = investorFlow
    ? {
        status: investorFlow.status,
        summary: investorFlow.summary,
        note: investorFlow.note,
        asOfLabel: investorFlow.asOfLabel,
        kospi: investorFlow.kospi,
        kosdaq: investorFlow.kosdaq,
        kospiHistory: investorFlow.kospiHistory ?? (investorFlow.kospi ? [investorFlow.kospi] : []),
        kosdaqHistory:
          investorFlow.kosdaqHistory ?? (investorFlow.kosdaq ? [investorFlow.kosdaq] : []),
        byStock: investorFlow.byStock ?? {},
      }
    : {
        status: "pending" as const,
        summary: FLOW_PENDING_SUMMARY,
        note: FLOW_LIVE_NOTE,
        asOfLabel: "",
        kospi: null,
        kosdaq: null,
        kospiHistory: [],
        kosdaqHistory: [],
        byStock: {},
      };

  const topCapsKrSummary = summarizeCaps(topCapsKr);
  const topCapsUsSummary = summarizeCaps(topCapsUs);

  return {
    ks200,
    topCaps,
    topCapsKr,
    topCapsUs,
    signals,
    flow,
    summaries: {
      ks200: ks200
        ? `코스피200 ${ks200.value.toFixed(2)} (${ks200.changePercent >= 0 ? "+" : ""}${ks200.changePercent.toFixed(2)}%)`
        : "코스피200 없음",
      topCaps: topCapsKrSummary,
      topCapsKr: topCapsKrSummary,
      topCapsUs: topCapsUsSummary,
      signal: signals.map((s) => `${s.name} ${s.value}`).join(" · ") || "신호 없음",
      flow: flow.summary,
    },
  };
}

/** 파이프라인 Briefing/Decision 입력용 요약 */
export function toCollectorRetailScan(scan: RetailScanBundle) {
  return {
    ks200: scan.ks200
      ? {
          label: scan.summaries.ks200,
          value: scan.ks200.value,
          changePercent: scan.ks200.changePercent,
        }
      : undefined,
    topCapsSummary: `KR: ${scan.summaries.topCapsKr} / US: ${scan.summaries.topCapsUs}`,
    signalSummary: scan.summaries.signal,
    flowSummary: scan.summaries.flow,
  };
}
