import type { IndexChangeBasis, IndexQuote, MacroChip, MarketEvent } from "@/lib/types";
import type { FlowLeg } from "@/lib/market/retailScan";
import {
  renderCarryForwardForPrompt,
  type CarryForwardBlock,
} from "@/lib/pipeline/carryForward";
import type { MarketScope, PipelineSlot } from "@/lib/pipeline/types";

export type EvidenceIndexRow = {
  id: string;
  name: string;
  /** 현재 Yahoo 등락(장중=당일, 마감=직전 세션) */
  changePercent: number;
  status: string;
  changeBasis: IndexChangeBasis;
  /** 직전 완료 정규장 세션 등락 — 장전 전일 요약에만 사용 */
  priorSessionChangePercent: number | null;
};

export type EvidencePack = {
  session: {
    slot: PipelineSlot;
    slotLabel: string;
    collectedAt: string;
    asOfLabel: string;
    focusHint: string;
  };
  temperature: {
    label: string;
    mood: string;
    moodLabel: string;
    krAvgPct: number | null;
    usAvgPct: number | null;
    decouplingPct: number | null;
    decouplingNote: string;
    /** 장전용: 직전 세션 평균(있을 때) */
    krPriorAvgPct?: number | null;
    usPriorAvgPct?: number | null;
  };
  indexes: {
    kr: EvidenceIndexRow[];
    us: EvidenceIndexRow[];
  };
  macros: Array<{
    id: string;
    name: string;
    value: string;
    changeLabel: string;
    direction: string;
  }>;
  flow: {
    status: "live" | "pending";
    asOfLabel: string;
    todaySummary: string;
    weekSummary: string;
    foreignStreakNote: string;
    /** 장전: 직전 완료일 수급 요약(있으면) */
    priorDaySummary?: string;
  };
  megaCaps: {
    summary: string;
    /** KR· / US· 접두 항목 — 탭별 필터용 */
    items: Array<{ name: string; changePercent: number }>;
    avgChangePct: number | null;
    dispersionPct: number | null;
    upCount: number;
    downCount: number;
    dispersionNote: string;
  };
  signals: {
    summary: string;
    ks200: string;
  };
  events: Array<{
    id: string;
    dateLabel: string;
    region: string;
    title: string;
    level: string;
    oneLiner: string;
    kind?: string;
    dateISO?: string;
    symbol?: string;
    actual?: {
      epsActual?: number;
      epsEstimate?: number;
      surprisePct?: number;
      beatLabel?: "서프라이즈" | "미스";
      reportedDateISO?: string;
    };
    /** Collector 뉴스 Evidence — 가이던스·반응 해석은 이 필드가 있을 때만 */
    contextNews?: Array<{
      title: string;
      publisher: string;
      publishedAt: string;
      snippet: string;
    }>;
  }>;
  /** 유가·VIX·지정학 헤드라인 (숫자 연결 시에만 해석) */
  risk: {
    status: "live" | "pending";
    elevated: boolean;
    summary: string;
    flags: string[];
    headlines: Array<{ title: string; publisher: string; publishedAt: string }>;
    note: string;
  };
  previous: {
    slot: string | null;
    publishedAt: string | null;
    /** 반복 방지용 헤드라인만 — 본문 덤프 금지 */
    headlines: Partial<Record<MarketScope, string>>;
    /**
     * 같은 시장 탭 직전 1건의 구조화 연속성 (scenarios/checkItems/upcoming).
     * Collector가 due 항목을 Evidence 사실로 해석해 붙인다.
     */
    continuity?: Partial<Record<MarketScope, CarryForwardBlock>>;
  };
};

const SLOT_LABEL: Record<PipelineSlot, string> = {
  "kr-pre": "한국 장전",
  "kr-mid": "한국 장중",
  "kr-post": "한국 장후",
  "us-pre": "미국 장전",
  "us-mid": "미국 장중",
  "us-post": "미국 장후",
  "us-noon": "미국 점검",
};

const SLOT_FOCUS: Record<PipelineSlot, string> = {
  "kr-pre": "전 거래일 국내 요약 + 오늘 국내 관측 틀·신호 · 미국 오버나잇은 최대 한 줄 조건부 브릿지",
  "kr-mid": "오전 소화 + 오후 관측 틀 갱신 · 장중 매매 신호·개장 예측 금지",
  "kr-post": "오늘 국내 세션 결과·수급·시총·주요 촉발 요인 리캡 · 밤 미장은 최대 한 줄 점검",
  "us-pre": "전 거래일 미국 요약 + 오늘 미국 관측 틀·신호 · 국내 마감은 최대 한 줄 조건부 브릿지",
  "us-mid": "미 장중 관측 틀·시나리오·점검 갱신 · 매매 신호·방향 예측 금지",
  "us-post": "오늘 미국 세션 결과·메가캡·주요 촉발 요인 리캡 · 다음 국내 장전은 최대 한 줄 점검",
  "us-noon":
    "미 정규장 종료 후~장전 전 공백 점검 · 직전 미 세션·오버나잇 맥락 + 저녁 미 장전 관측 틀 · 매매·개장 예측 금지",
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatEok(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}조`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}억`;
}

function sumField(days: FlowLeg[], key: keyof Pick<FlowLeg, "foreign" | "institution" | "personal">) {
  return days.reduce((acc, d) => acc + d[key], 0);
}

function foreignStreak(days: FlowLeg[]): string {
  if (days.length === 0) return "수급 streak 없음";
  let n = 0;
  const firstSign = days[0].foreign === 0 ? 0 : days[0].foreign > 0 ? 1 : -1;
  if (firstSign === 0) return "외국인 보합(오늘)";
  for (const d of days) {
    const sign = d.foreign === 0 ? 0 : d.foreign > 0 ? 1 : -1;
    if (sign !== firstSign) break;
    n += 1;
  }
  return firstSign > 0
    ? `외국인 순매수 ${n}거래일 연속(최근부터)`
    : `외국인 순매도 ${n}거래일 연속(최근부터)`;
}

function weekFlowSummary(label: string, days: FlowLeg[], window = 5): string {
  const slice = days.slice(0, window);
  if (slice.length === 0) return `${label}: 없음`;
  const foreign = sumField(slice, "foreign");
  const institution = sumField(slice, "institution");
  const personal = sumField(slice, "personal");
  return `${label} ${slice.length}일 합: 외국인 ${formatEok(foreign)} · 기관 ${formatEok(institution)} · 개인 ${formatEok(personal)}`;
}

export function buildEvidencePack(input: {
  slot: PipelineSlot;
  collectedAt: string;
  asOfLabel: string;
  temperature: string;
  mood: string;
  moodLabel: string;
  indexes: IndexQuote[];
  macros: MacroChip[];
  flow: {
    status: "live" | "pending";
    asOfLabel: string;
    summary: string;
    kospiHistory: FlowLeg[];
    kosdaqHistory: FlowLeg[];
  };
  megaCaps: Array<{ name: string; changePercent: number }>;
  signalsSummary: string;
  ks200Label: string;
  events: MarketEvent[];
  previous: EvidencePack["previous"];
  risk?: EvidencePack["risk"];
}): EvidencePack {
  const kr = input.indexes.filter((q) => q.region === "KR");
  const us = input.indexes.filter((q) => q.region === "US");
  const toRow = (q: IndexQuote): EvidenceIndexRow => ({
    id: q.id,
    name: q.name,
    changePercent: Number(q.changePercent.toFixed(2)),
    status: q.status,
    changeBasis: q.changeBasis ?? "unknown",
    priorSessionChangePercent:
      q.priorSessionChangePercent == null
        ? null
        : Number(q.priorSessionChangePercent.toFixed(2)),
  });
  const krRows = kr.map(toRow);
  const usRows = us.map(toRow);
  const krAvg = avg(kr.map((q) => q.changePercent));
  const usAvg = avg(us.map((q) => q.changePercent));
  const krPriorAvg = avg(
    krRows
      .map((q) => q.priorSessionChangePercent)
      .filter((n): n is number => n != null),
  );
  const usPriorAvg = avg(
    usRows
      .map((q) => q.priorSessionChangePercent)
      .filter((n): n is number => n != null),
  );
  const decoupling =
    krAvg != null && usAvg != null ? Number((krAvg - usAvg).toFixed(2)) : null;

  let decouplingNote = "한·미 갭 계산 불가";
  if (decoupling != null) {
    if (Math.abs(decoupling) < 0.4) decouplingNote = "한·미 온도가 비슷함";
    else if (decoupling > 0) decouplingNote = "국내가 미국보다 상대적으로 강함/덜 약함";
    else decouplingNote = "국내가 미국보다 상대적으로 약함/더 밀림";
  }

  const changes = input.megaCaps.map((q) => q.changePercent);
  const megaAvg = avg(changes);
  const dispersion =
    changes.length >= 2 ? Number((Math.max(...changes) - Math.min(...changes)).toFixed(2)) : null;
  const upCount = changes.filter((c) => c > 0).length;
  const downCount = changes.filter((c) => c < 0).length;
  const dispersionNote =
    dispersion == null
      ? "시총상위 분산 없음"
      : dispersion >= 3
        ? "시총상위 등락 편차가 큼 — 지수와 체감이 갈릴 수 있음"
        : "시총상위가 비교적 같은 방향으로 움직임";

  const kospiHist = input.flow.kospiHistory;
  const kosdaqHist = input.flow.kosdaqHistory;
  const isPre = input.slot === "kr-pre" || input.slot === "us-pre";
  const liveBasis = [...krRows, ...usRows].some(
    (q) => q.changeBasis === "intraday" || q.changeBasis === "premarket",
  );
  const priorFlowIdx = isPre && liveBasis ? 1 : 0;
  const priorKospi = kospiHist[priorFlowIdx];
  const priorKosdaq = kosdaqHist[priorFlowIdx];
  const priorDaySummary =
    priorKospi || priorKosdaq
      ? [
          priorKospi
            ? `코스피 ${priorKospi.dateLabel}: 외국인 ${formatEok(priorKospi.foreign)} · 기관 ${formatEok(priorKospi.institution)} · 개인 ${formatEok(priorKospi.personal)}`
            : null,
          priorKosdaq
            ? `코스닥 ${priorKosdaq.dateLabel}: 외국인 ${formatEok(priorKosdaq.foreign)} · 기관 ${formatEok(priorKosdaq.institution)} · 개인 ${formatEok(priorKosdaq.personal)}`
            : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : undefined;

  return {
    session: {
      slot: input.slot,
      slotLabel: SLOT_LABEL[input.slot],
      collectedAt: input.collectedAt,
      asOfLabel: input.asOfLabel,
      focusHint: SLOT_FOCUS[input.slot],
    },
    temperature: {
      label: input.temperature,
      mood: input.mood,
      moodLabel: input.moodLabel,
      krAvgPct: krAvg == null ? null : Number(krAvg.toFixed(2)),
      usAvgPct: usAvg == null ? null : Number(usAvg.toFixed(2)),
      decouplingPct: decoupling,
      decouplingNote,
      krPriorAvgPct: krPriorAvg == null ? null : Number(krPriorAvg.toFixed(2)),
      usPriorAvgPct: usPriorAvg == null ? null : Number(usPriorAvg.toFixed(2)),
    },
    indexes: {
      kr: krRows,
      us: usRows,
    },
    macros: input.macros.map((m) => ({
      id: m.id,
      name: m.name,
      value: m.value,
      changeLabel: m.changeLabel,
      direction: m.direction,
    })),
    flow: {
      status: input.flow.status,
      asOfLabel: input.flow.asOfLabel,
      todaySummary: input.flow.summary,
      weekSummary: [
        weekFlowSummary("코스피", kospiHist, 5),
        weekFlowSummary("코스닥", kosdaqHist, 5),
      ].join(" / "),
      foreignStreakNote: foreignStreak(kospiHist),
      priorDaySummary,
    },
    megaCaps: {
      summary:
        input.megaCaps.length > 0
          ? input.megaCaps.map((q) => `${q.name} ${formatPct(q.changePercent)}`).join(", ")
          : "시총상위 없음",
      items: input.megaCaps.map((q) => ({
        name: q.name,
        changePercent: Number(q.changePercent.toFixed(2)),
      })),
      avgChangePct: megaAvg == null ? null : Number(megaAvg.toFixed(2)),
      dispersionPct: dispersion,
      upCount,
      downCount,
      dispersionNote,
    },
    signals: {
      summary: input.signalsSummary || "신호 없음",
      ks200: input.ks200Label || "코스피200 없음",
    },
    events: input.events.map((e) => ({
      id: e.id,
      dateLabel: e.dateLabel,
      region: e.region,
      title: e.title,
      level: e.level,
      oneLiner: e.oneLiner,
      kind: e.kind,
      dateISO: e.dateISO,
      symbol: e.symbol,
      actual: e.actual,
      contextNews: e.contextNews?.slice(0, 3).map((n) => ({
        title: n.title,
        publisher: n.publisher,
        publishedAt: n.publishedAt,
        snippet: n.snippet,
      })),
    })),
    risk: input.risk ?? {
      status: "pending",
      elevated: false,
      summary: "지정학 리스크 맥락 없음",
      flags: [],
      headlines: [],
      note: "정치·전쟁 뉴스를 상시 수집하지 않습니다.",
    },
    previous: input.previous,
  };
}

/** LLM user prompt용 — 섹션화·복창 금지·탭 초점 필터 포함 */
export function renderEvidencePackForPrompt(
  pack: EvidencePack,
  scope: MarketScope,
): string {
  const formatIndexRow = (q: EvidenceIndexRow): string => {
    const prior =
      q.priorSessionChangePercent == null
        ? "전일세션=n/a"
        : `전일세션마감=${formatPct(q.priorSessionChangePercent)}`;
    const liveLabel =
      q.changeBasis === "prior-close"
        ? "마감세션"
        : q.changeBasis === "intraday"
          ? "장중(당일)"
          : q.changeBasis === "premarket"
            ? "프리/장전"
            : q.changeBasis === "postmarket"
              ? "애프터"
              : "현재";
    return `- ${q.id} ${q.name} ${prior} · ${liveLabel}=${formatPct(q.changePercent)} 상태=${q.status} basis=${q.changeBasis}`;
  };

  const krBridge =
    pack.indexes.kr.length > 0
      ? `국내 보조(브릿지≤1불릿): ${pack.indexes.kr
          .map((q) => `${q.name} 전일세션=${formatPct(q.priorSessionChangePercent)} / 현재=${formatPct(q.changePercent)}`)
          .join(" · ")}`
      : "국내 보조: n/a";
  const usBridge =
    pack.indexes.us.length > 0
      ? `미국 보조(브릿지≤1불릿): ${pack.indexes.us
          .map((q) => `${q.name} 전일세션=${formatPct(q.priorSessionChangePercent)} / 현재=${formatPct(q.changePercent)}`)
          .join(" · ")}`
      : "미국 보조: n/a";

  const indexBlock =
    scope === "kr"
      ? [
          "지수·KR 초점 (전일세션마감 vs 현재를 구분 — 복창·시점 둔갑 금지):",
          ...pack.indexes.kr.map(formatIndexRow),
          usBridge,
        ]
      : scope === "us"
        ? [
            "지수·US 초점 (전일세션마감 vs 현재를 구분 — 복창·시점 둔갑 금지):",
            ...pack.indexes.us.map(formatIndexRow),
            krBridge,
          ]
        : [
            "지수 (전일세션마감 vs 현재를 구분 — 복창·시점 둔갑 금지):",
            "국내:",
            ...pack.indexes.kr.map(formatIndexRow),
            "미국:",
            ...pack.indexes.us.map(formatIndexRow),
          ];

  const tempBlock =
    scope === "us"
      ? [
          "## 시장 온도",
          `온도: ${pack.temperature.label}`,
          `분위기: ${pack.temperature.moodLabel}`,
          `미국 평균: ${formatPct(pack.temperature.usAvgPct)}`,
          `상대(국내 평균·갭, 브릿지용): 국내 ${formatPct(pack.temperature.krAvgPct)} · 갭(국내−미국) ${formatPct(pack.temperature.decouplingPct)}`,
          "지시: 미국 평균·미 지수·금리·VIX가 본문. 국내/갭은 최대 1불릿.",
        ]
      : scope === "kr"
        ? [
            "## 시장 온도",
            `온도: ${pack.temperature.label}`,
            `분위기: ${pack.temperature.moodLabel}`,
            `국내 평균: ${formatPct(pack.temperature.krAvgPct)}`,
            `상대(미국 평균·갭, 브릿지용): 미국 ${formatPct(pack.temperature.usAvgPct)} · 갭(국내−미국) ${formatPct(pack.temperature.decouplingPct)}`,
            "지시: 국내 평균·수급·시총이 본문. 미국/갭은 최대 1불릿.",
          ]
        : [
            "## 시장 온도",
            `온도: ${pack.temperature.label}`,
            `분위기: ${pack.temperature.moodLabel}`,
            `국내 평균: ${formatPct(pack.temperature.krAvgPct)} · 미국 평균: ${formatPct(pack.temperature.usAvgPct)}`,
            `한·미 갭(국내−미국): ${formatPct(pack.temperature.decouplingPct)} — ${pack.temperature.decouplingNote}`,
          ];

  const megaItems =
    scope === "us"
      ? pack.megaCaps.items.filter((q) => q.name.startsWith("US·"))
      : scope === "kr"
        ? pack.megaCaps.items.filter((q) => q.name.startsWith("KR·"))
        : pack.megaCaps.items;
  const megaSummary =
    megaItems.length > 0
      ? megaItems.map((q) => `${q.name} ${formatPct(q.changePercent)}`).join(", ")
      : scope === "all"
        ? pack.megaCaps.summary
        : "해당 탭 시총상위 없음";
  const megaAvg = avg(megaItems.map((q) => q.changePercent));

  const events =
    scope === "us"
      ? pack.events.filter((e) => e.region === "US" || e.region === "GLOBAL")
      : scope === "kr"
        ? pack.events.filter((e) => e.region === "KR" || e.region === "GLOBAL")
        : pack.events;

  const flowBlock =
    scope === "us"
      ? [
          "## 수급",
          "상태: US 탭에서는 국내 시장 수급 생략 (UI와 동일). 미 수급 숫자 없으면 언급 금지.",
        ]
      : [
          "## 수급 (시장 합계 · 예측/매매신호 아님)",
          `상태: ${pack.flow.status} · 기준일: ${pack.flow.asOfLabel || "n/a"}`,
          pack.flow.priorDaySummary
            ? `전 거래일 수급(장전 요약용): ${pack.flow.priorDaySummary}`
            : null,
          `수집 기준일 수급: ${pack.flow.todaySummary}`,
          `주간(5거래일 합): ${pack.flow.weekSummary}`,
          `연속: ${pack.flow.foreignStreakNote}`,
        ].filter((line): line is string => Boolean(line));

  const signalsBlock =
    scope === "us"
      ? [
          "## 기대·경계 신호",
          "KS200·국내 갭 신호: US 탭 생략.",
          `미장 관련만: VIX·금리 맥락은 매크로 섹션 참고. 신호요약(필터 전): ${pack.signals.summary}`,
        ]
      : [
          "## 기대·경계 신호",
          `KS200: ${pack.signals.ks200}`,
          `신호: ${pack.signals.summary}`,
        ];

  const prevScopes: MarketScope[] =
    scope === "us" ? ["us", "all"] : scope === "kr" ? ["kr", "all"] : ["all", "kr", "us"];
  const prevHeadlines = prevScopes
    .map((s) => (pack.previous.headlines[s] ? `- ${s}: ${pack.previous.headlines[s]}` : null))
    .filter(Boolean);

  const continuityScope: MarketScope =
    scope === "us" || scope === "kr" ? scope : "all";
  const continuity =
    pack.previous.continuity?.[continuityScope] ??
    (scope === "all"
      ? pack.previous.continuity?.kr ?? pack.previous.continuity?.us
      : undefined);
  const continuityLines = renderCarryForwardForPrompt(continuity);

  const scopeRule =
    scope === "us"
      ? "SCOPE 규칙: 헤드라인·불릿 과반 = 미 지수·금리·VIX·미 시총·US/GLOBAL 일정. 코스피/코스닥/국내 수급/KS200은 헤드라인 금지·본문 최대 1불릿 브릿지."
      : scope === "kr"
        ? "SCOPE 규칙: 헤드라인·불릿 과반 = 국내 지수·수급·시총·KS200·환율. 나스닥/S&P/다우는 헤드라인 금지·본문 최대 1불릿 브릿지."
        : "SCOPE 규칙: 한·미를 균형 있게. 한쪽만 장황하게 쓰지 말 것.";
  const preSessionRule =
    pack.session.slot === "kr-pre" || pack.session.slot === "us-pre"
      ? [
          "장전 시점 규칙(하드):",
          "- '전일/전 거래일/직전 마감' 요약에는 **전일세션마감** 숫자만 사용.",
          "- 장중(당일)/프리/애프터 숫자를 전일로 쓰지 말 것. (시점 둔갑 = 발행 차단)",
          "- basis=intraday|premarket 인 현재 등락은 오늘 관측 신호로만, 전일 마감 사실로 쓰지 말 것.",
          "- '출발 예고/예상/전망', '개장 예상', '강세/약세 출발' 표현 금지.",
          `- 참고 전일 평균: KR ${formatPct(pack.temperature.krPriorAvgPct ?? null)} · US ${formatPct(pack.temperature.usPriorAvgPct ?? null)}`,
        ]
      : [];

  return [
    "## 세션",
    `탭 초점(scope): ${scope}`,
    scopeRule,
    `슬롯: ${pack.session.slot} (${pack.session.slotLabel})`,
    `슬롯 초점: ${pack.session.focusHint}`,
    `수집: ${pack.session.collectedAt}`,
    `시세 기준: ${pack.session.asOfLabel}`,
    ...preSessionRule,
    "",
    ...tempBlock,
    "",
    ...indexBlock,
    "",
    "## 매크로 (근거 id로 evidenceIds에 사용)",
    ...pack.macros.map(
      (m) => `- ${m.id} ${m.name} ${m.value} ${m.changeLabel} dir=${m.direction}`,
    ),
    "",
    ...flowBlock,
    "",
    "## 시총 상위 맥락 (이 탭 초점만)",
    `종목: ${megaSummary}`,
    `평균: ${formatPct(megaAvg == null ? null : Number(megaAvg.toFixed(2)))}`,
    "",
    ...signalsBlock,
    "",
    "## 일정 (이 탭·글로벌 · 실적은 점검용)",
    ...(events.length > 0
      ? events.flatMap((e) => {
          const tag = e.kind === "earnings" ? "실적" : "매크로";
          const when = e.dateISO ? ` · ${e.dateISO.slice(0, 10)}` : "";
          const result =
            e.kind === "earnings" && e.actual
              ? e.actual.beatLabel
                ? ` · Evidence결과(EPS): ${e.actual.beatLabel}` +
                  (e.actual.epsActual != null && e.actual.epsEstimate != null
                    ? ` actual=${e.actual.epsActual} est=${e.actual.epsEstimate}`
                    : "")
                : e.actual.epsActual != null && e.actual.epsEstimate != null
                  ? ` · Evidence결과(EPS): 숫자만(라벨없음) actual=${e.actual.epsActual} est=${e.actual.epsEstimate}`
                  : " · Evidence결과(EPS): 미확인"
              : "";
          const lines = [
            `- ${e.dateLabel}${when} [${e.region}/${e.level}/${tag}] ${e.title} — ${e.oneLiner}${result}`,
          ];
          if (e.kind === "earnings" && e.contextNews && e.contextNews.length > 0) {
            lines.push(
              `  ★ Evidence뉴스(가이던스·반응 근거 · Briefing 필수 인용):`,
              ...e.contextNews.map((n) => {
                const title = n.title || n.snippet;
                const pub = n.publisher ? ` · ${n.publisher}` : "";
                const day = n.publishedAt ? ` · ${n.publishedAt.slice(0, 10)}` : "";
                return `  - 「${title}」${pub}${day}`;
              }),
            );
          } else if (e.kind === "earnings") {
            lines.push(
              `  Evidence뉴스: 없음 — 반응·가이던스 풍부 서술 생략(강제 인용 시 「반응 근거 부족」1줄만)`,
            );
          }
          return lines;
        })
      : ["- 해당 일정 없음"]),
    ...(events.some((e) => e.kind === "earnings")
      ? [
          "지시: 48시간 이내 실적(kind=earnings)이 있으면 bullets 중 1개에 회사명·섹터 맥락을 ‘점검’으로만 언급. EPS/매출 숫자 과다 복창·매매 신호 금지.",
          "지시: 서프라이즈/미스는 Evidence결과(EPS) beatLabel이 있을 때만 그대로 사용. 라벨 없으면 숫자만 인용·극성(상회/하회/서프라이즈/미스) 단정 금지. 가이던스 실망을 실적 미스로 바꿔 쓰기 금지.",
          "★★ 필수: Evidence뉴스+숫자(또는 가격 반응)가 있으면 Briefing bullets에 **실적 숫자 + 가이던스·시장 반응** 이중 서술을 1불릿으로 넣을 것. 위 「Evidence뉴스」 제목에 가이던스/outlook/실망/하락이 있으면 반드시 반영. 「혼조」「차익 실현」「섹터 밀림」만으로 가이던스 요약을 대체하지 말 것. Collector oneLiner 해석 복창 금지.",
          "지시: Evidence뉴스 없으면 반응·가이던스 풍부 서술 생략. must-cover due 실적이고 한 줄이 필요하면 「반응 근거 부족」만.",
        ]
      : []),
    "",
    "## 리스크·지정학 맥락 (정치 올인원 아님 · 숫자 연결 시에만)",
    pack.risk.note,
    `상태: ${pack.risk.status} · elevated=${pack.risk.elevated}`,
    `요약: ${pack.risk.summary}`,
    ...(pack.risk.flags.length > 0
      ? ["플래그:", ...pack.risk.flags.map((f) => `- ${f}`)]
      : ["플래그: 없음"]),
    ...(pack.risk.headlines.length > 0
      ? [
          "관련 헤드라인(참고·단정 금지):",
          ...pack.risk.headlines.map(
            (h) =>
              `- ${h.title} · ${h.publisher}${h.publishedAt ? ` · ${h.publishedAt.slice(0, 10)}` : ""}`,
          ),
        ]
      : ["관련 헤드라인: 없음"]),
    pack.risk.elevated
      ? "지시: elevated면 bullets 중 1개에 유가/변동성/환율과 연결해 지정학·공급 리스크를 ‘점검 포인트’로만 짧게 언급. 전쟁 결과·승패·투자 추천 금지."
      : "지시: elevated 아니면 억지로 정치·전쟁 이야기를 넣지 말 것.",
    "",
    "## 직전 발행 헤드라인 (반복·복창 말고 연결/차별만 · 본문 덤프 금지)",
    pack.previous.slot
      ? `번들 직전 슬롯: ${pack.previous.slot} @ ${pack.previous.publishedAt}`
      : "직전 발행 없음",
    ...prevHeadlines,
    "",
    ...continuityLines,
  ].join("\n");
}
