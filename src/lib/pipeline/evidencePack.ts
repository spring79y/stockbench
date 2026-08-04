import type { IndexQuote, MacroChip, MarketEvent } from "@/lib/types";
import type { FlowLeg } from "@/lib/market/retailScan";
import type { MarketScope, PipelineSlot } from "@/lib/pipeline/types";

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
  };
  indexes: {
    kr: Array<{ id: string; name: string; changePercent: number; status: string }>;
    us: Array<{ id: string; name: string; changePercent: number; status: string }>;
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
  };
  megaCaps: {
    summary: string;
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
    headlines: Partial<Record<MarketScope, string>>;
  };
};

const SLOT_LABEL: Record<PipelineSlot, string> = {
  "kr-pre": "한국 장전",
  "kr-post": "한국 장후",
  "us-pre": "미국 장전",
  "us-post": "미국 장후",
};

const SLOT_FOCUS: Record<PipelineSlot, string> = {
  "kr-pre": "미국 오버나잇·국내 개장 앞 포인트",
  "kr-post": "오늘 국내 정리 + 밤 미장 앞 점검",
  "us-pre": "국내 마감 맥락 + 오늘 미장 포인트",
  "us-post": "미장 정리 + 다음 국내 장전 연결",
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
  const krAvg = avg(kr.map((q) => q.changePercent));
  const usAvg = avg(us.map((q) => q.changePercent));
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
    },
    indexes: {
      kr: kr.map((q) => ({
        id: q.id,
        name: q.name,
        changePercent: Number(q.changePercent.toFixed(2)),
        status: q.status,
      })),
      us: us.map((q) => ({
        id: q.id,
        name: q.name,
        changePercent: Number(q.changePercent.toFixed(2)),
        status: q.status,
      })),
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
    },
    megaCaps: {
      summary:
        input.megaCaps.length > 0
          ? input.megaCaps.map((q) => `${q.name} ${formatPct(q.changePercent)}`).join(", ")
          : "시총상위 없음",
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

/** LLM user prompt용 — 섹션화·복창 금지 안내 포함 */
export function renderEvidencePackForPrompt(
  pack: EvidencePack,
  scope: MarketScope,
): string {
  const indexBlock =
    scope === "kr"
      ? [
          "지수·KR 초점 (화면에도 표시 — 복창 금지):",
          ...pack.indexes.kr.map(
            (q) => `- ${q.id} ${q.name} ${formatPct(q.changePercent)} 상태=${q.status}`,
          ),
          "미국(보조):",
          ...pack.indexes.us.map((q) => `- ${q.name} ${formatPct(q.changePercent)}`),
        ]
      : scope === "us"
        ? [
            "지수·US 초점 (화면에도 표시 — 복창 금지):",
            ...pack.indexes.us.map(
              (q) => `- ${q.id} ${q.name} ${formatPct(q.changePercent)} 상태=${q.status}`,
            ),
            "한국(보조):",
            ...pack.indexes.kr.map((q) => `- ${q.name} ${formatPct(q.changePercent)}`),
          ]
        : [
            "지수 (화면에도 표시 — 복창 금지):",
            "국내:",
            ...pack.indexes.kr.map(
              (q) => `- ${q.id} ${q.name} ${formatPct(q.changePercent)} 상태=${q.status}`,
            ),
            "미국:",
            ...pack.indexes.us.map(
              (q) => `- ${q.id} ${q.name} ${formatPct(q.changePercent)} 상태=${q.status}`,
            ),
          ];

  const prevHeadlines = (["all", "kr", "us"] as MarketScope[])
    .map((s) => (pack.previous.headlines[s] ? `- ${s}: ${pack.previous.headlines[s]}` : null))
    .filter(Boolean);

  return [
    "## 세션",
    `탭 초점(scope): ${scope}`,
    `슬롯: ${pack.session.slot} (${pack.session.slotLabel})`,
    `슬롯 초점: ${pack.session.focusHint}`,
    `수집: ${pack.session.collectedAt}`,
    `시세 기준: ${pack.session.asOfLabel}`,
    "",
    "## 시장 온도",
    `온도: ${pack.temperature.label}`,
    `분위기: ${pack.temperature.moodLabel}`,
    `국내 평균: ${formatPct(pack.temperature.krAvgPct)} · 미국 평균: ${formatPct(pack.temperature.usAvgPct)}`,
    `한·미 갭(국내−미국): ${formatPct(pack.temperature.decouplingPct)} — ${pack.temperature.decouplingNote}`,
    "",
    ...indexBlock,
    "",
    "## 매크로 (근거 id로 evidenceIds에 사용)",
    ...pack.macros.map(
      (m) => `- ${m.id} ${m.name} ${m.value} ${m.changeLabel} dir=${m.direction}`,
    ),
    "",
    "## 수급 (시장 합계 · 예측/매매신호 아님)",
    `상태: ${pack.flow.status} · 기준일: ${pack.flow.asOfLabel || "n/a"}`,
    `오늘: ${pack.flow.todaySummary}`,
    `주간(5거래일 합): ${pack.flow.weekSummary}`,
    `연속: ${pack.flow.foreignStreakNote}`,
    "",
    "## 시총 상위 맥락",
    `종목: ${pack.megaCaps.summary}`,
    `평균: ${formatPct(pack.megaCaps.avgChangePct)} · 분산(고−저): ${formatPct(pack.megaCaps.dispersionPct)} · 상승 ${pack.megaCaps.upCount}/하락 ${pack.megaCaps.downCount}`,
    pack.megaCaps.dispersionNote,
    "",
    "## 기대·경계 신호",
    `KS200: ${pack.signals.ks200}`,
    `신호: ${pack.signals.summary}`,
    "",
    "## 일정 (캘린더 라벨)",
    ...pack.events.map(
      (e) => `- ${e.dateLabel} [${e.region}/${e.level}] ${e.title} — ${e.oneLiner}`,
    ),
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
            (h) => `- ${h.title} · ${h.publisher}${h.publishedAt ? ` · ${h.publishedAt.slice(0, 10)}` : ""}`,
          ),
        ]
      : ["관련 헤드라인: 없음"]),
    pack.risk.elevated
      ? "지시: elevated면 bullets 중 1개에 유가/변동성/환율과 연결해 지정학·공급 리스크를 ‘점검 포인트’로만 짧게 언급. 전쟁 결과·승패·투자 추천 금지."
      : "지시: elevated 아니면 억지로 정치·전쟁 이야기를 넣지 말 것.",
    "",
    "## 직전 발행 (반복·복창 말고 연결/차별만)",
    pack.previous.slot
      ? `직전 슬롯: ${pack.previous.slot} @ ${pack.previous.publishedAt}`
      : "직전 발행 없음",
    ...prevHeadlines,
  ].join("\n");
}
