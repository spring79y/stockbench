import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findingsToRepairHints,
  runGuard,
} from "./guard";
import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  GuardFinding,
} from "./types";
import type { CarryForwardBlock } from "./carryForward";

const okDecision: DecisionDraft = {
  scenarios: [
    {
      id: "base",
      label: "A · 기본",
      title: "금리 안정 속 관측 유지",
      summary: "미 10년물 임계 미만이면 온도 유지",
      implication: "금리 임계 미만 유지 시 A",
    },
    {
      id: "risk",
      label: "B · 주의",
      title: "변동성 확대 시 주의",
      summary: "VIX 급등 시 위험 선호 꺾임",
      implication: "VIX 상회 시 B에 가깝다",
    },
  ],
  checkItems: [
    { id: "c1", text: "미 10년물 4.3% 상회 여부", why: "상회면 B에 가깝다" },
    { id: "c2", text: "VIX 20 상회 여부", why: "상회면 A 유지 어려움" },
    { id: "c3", text: "나스닥 장중 +0.5% 유지", why: "유지면 A에 가깝다" },
  ],
};

function baseSnapshot(
  overrides: Partial<CollectorSnapshot> = {},
): CollectorSnapshot {
  return {
    collectedAt: new Date().toISOString(),
    slot: "us-noon",
    indexes: [
      {
        id: "nasdaq",
        name: "나스닥",
        shortName: "NDX",
        region: "US",
        value: 18000,
        change: -72,
        changePercent: -0.4,
        status: "open",
        changeBasis: "prior-close",
        priorSessionChangePercent: -0.8,
      },
    ],
    macros: [
      {
        id: "vix",
        name: "VIX",
        value: "18.2",
        changeLabel: "+0.3",
        direction: "up",
      },
      {
        id: "us10y",
        name: "미 10년물",
        value: "4.25%",
        changeLabel: "-0.02",
        direction: "down",
      },
    ],
    temperature: "미국 약세",
    mood: "risk-off",
    moodLabel: "위험",
    asOfLabel: "test",
    events: [],
    ...overrides,
  };
}

function continuityWithForceCite(): CarryForwardBlock {
  return {
    priorSlot: "us-post",
    priorPublishedAt: new Date().toISOString(),
    seed: {
      scenarios: [
        {
          id: "base",
          label: "A · 기본",
          title: "금리 안정",
          summary: "임계 미만 유지",
        },
      ],
      checkItems: [{ id: "c1", text: "미 10년물 4.3% 상회 여부" }],
    },
    items: [
      {
        id: "check-c1",
        kind: "check",
        priorText: "미 10년물 4.3% 상회 여부",
        status: "resolved",
        evidenceFact: "미 10년물 현재 4.25% (−0.02, dir=down)",
        mustCover: true,
        forceCite: true,
        unchangedSlots: 0,
        streakKey: "rate",
        note: "직전 점검을 현재 매크로 숫자로 재평가",
      },
    ],
    shrunkForLive: false,
    rules: [],
  };
}

describe("guard quality floor", () => {
  it("blocks empty fluff briefing bullets", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 약세에 변동성 유의",
      bullets: [
        "시장이 주목하는 흐름이 이어진다",
        "혼조세 속 신중히 접근할 필요가 있다",
        "미 10년물·VIX를 지켜볼 필요가 있다",
      ],
      evidenceIds: ["vix"],
    };
    const report = runGuard({
      snapshot: baseSnapshot(),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some(
        (f) => f.severity === "block" && f.code === "empty-briefing",
      ),
      `expected empty-briefing, got: ${report.findings.map((f) => f.code).join(",")}`,
    );
    assert.equal(report.ok, false);
  });

  it("blocks recommendation tone", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 약세 속 관측 유지",
      bullets: [
        "나스닥 약세, 금리 안정",
        "반도체 시총 되밀림",
        "이런 때는 비중을 줄이는 편이 낫다",
      ],
      evidenceIds: ["vix"],
    };
    const report = runGuard({
      snapshot: baseSnapshot(),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some(
        (f) => f.severity === "block" && f.code === "recommendation-or-prediction",
      ),
    );
  });

  it("blocks mid/noon slot open-forecast tone", () => {
    const briefing: BriefingDraft = {
      headline: "저녁 개장 예상 강세 출발 전망",
      bullets: [
        "직전 미 세션 약세 소화",
        "금리 안정이 배경",
        "강세 출발이 예상된다",
      ],
      evidenceIds: ["us10y"],
    };
    const report = runGuard({
      snapshot: baseSnapshot({ slot: "us-noon" }),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some(
        (f) =>
          f.severity === "block" &&
          (f.code === "slot-tone-mismatch" || f.code === "pre-session-forecast"),
      ),
      `expected slot-tone-mismatch, got: ${report.findings.map((f) => f.code).join(",")}`,
    );
  });

  it("soft-warns jargon wall", () => {
    const briefing: BriefingDraft = {
      headline: "리스크 오프 속 포지셔닝 조정",
      bullets: [
        "나스닥 약세, 금리 안정",
        "매크로 헤드라인에 베타 높은 종목 흔들림",
        "듀레이션 부담이 리레이팅을 압박",
      ],
      evidenceIds: ["vix"],
    };
    const report = runGuard({
      snapshot: baseSnapshot(),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some((f) => f.code === "jargon-wall" && f.severity === "warn"),
      `expected jargon-wall warn, got: ${report.findings.map((f) => `${f.severity}:${f.code}`).join(",")}`,
    );
  });

  it("blocks forceCite keyword-stuff without re-evaluation", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 약세 속 저녁 장전 관측",
      bullets: [
        "나스닥 직전 세션 약세 이어짐",
        "반도체 시총 되밀림",
        "미 10년물 상회 여부를 본다",
      ],
      evidenceIds: ["us10y"],
    };
    const snap = baseSnapshot({
      evidence: {
        session: {
          slot: "us-noon",
          slotLabel: "미국 점검",
          collectedAt: new Date().toISOString(),
          asOfLabel: "test",
          focusHint: "noon",
        },
        temperature: {
          label: "약세",
          mood: "risk-off",
          moodLabel: "위험",
          krAvgPct: null,
          usAvgPct: -0.4,
          decouplingPct: null,
          decouplingNote: "n/a",
        },
        indexes: { kr: [], us: [] },
        macros: [],
        flow: {
          status: "pending",
          asOfLabel: "",
          todaySummary: "",
          weekSummary: "",
          foreignStreakNote: "",
        },
        megaCaps: {
          summary: "",
          items: [],
          avgChangePct: null,
          dispersionPct: null,
          upCount: 0,
          downCount: 0,
          dispersionNote: "",
        },
        signals: { summary: "", ks200: "" },
        events: [],
        risk: {
          status: "pending",
          elevated: false,
          summary: "",
          flags: [],
          headlines: [],
          note: "",
        },
        previous: {
          slot: "us-post",
          publishedAt: new Date().toISOString(),
          headlines: {},
          continuity: { us: continuityWithForceCite() },
        },
      },
    });
    const report = runGuard({
      snapshot: snap,
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some(
        (f) =>
          f.severity === "block" &&
          (f.code === "carry-forward-no-reeval" ||
            f.code === "carry-forward-omission"),
      ),
      `expected carry-forward-no-reeval, got: ${report.findings.map((f) => f.code).join(",")}`,
    );
  });

  it("allows forceCite with current Evidence re-evaluation", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 약세 속 저녁 장전 관측",
      bullets: [
        "나스닥 직전 세션 약세 이어짐",
        "미 10년물 현재 4.25%로 4.3% 상회는 아직 깨지지 않음 — A 관측 유지",
        "반도체 시총 되밀림, VIX 반응 점검",
      ],
      evidenceIds: ["us10y", "vix"],
    };
    const snap = baseSnapshot({
      evidence: {
        session: {
          slot: "us-noon",
          slotLabel: "미국 점검",
          collectedAt: new Date().toISOString(),
          asOfLabel: "test",
          focusHint: "noon",
        },
        temperature: {
          label: "약세",
          mood: "risk-off",
          moodLabel: "위험",
          krAvgPct: null,
          usAvgPct: -0.4,
          decouplingPct: null,
          decouplingNote: "n/a",
        },
        indexes: { kr: [], us: [] },
        macros: [],
        flow: {
          status: "pending",
          asOfLabel: "",
          todaySummary: "",
          weekSummary: "",
          foreignStreakNote: "",
        },
        megaCaps: {
          summary: "",
          items: [],
          avgChangePct: null,
          dispersionPct: null,
          upCount: 0,
          downCount: 0,
          dispersionNote: "",
        },
        signals: { summary: "", ks200: "" },
        events: [],
        risk: {
          status: "pending",
          elevated: false,
          summary: "",
          flags: [],
          headlines: [],
          note: "",
        },
        previous: {
          slot: "us-post",
          publishedAt: new Date().toISOString(),
          headlines: {},
          continuity: { us: continuityWithForceCite() },
        },
      },
    });
    const report = runGuard({
      snapshot: snap,
      briefing,
      decision: okDecision,
      scope: "us",
    });
    const carryBlocks = report.findings.filter(
      (f) =>
        f.severity === "block" &&
        (f.code === "carry-forward-no-reeval" ||
          f.code === "carry-forward-omission"),
    );
    assert.equal(carryBlocks.length, 0, carryBlocks.map((f) => f.message).join("; "));
  });
});

describe("findingsToRepairHints", () => {
  it("maps block codes to concrete fix instructions", () => {
    const findings: GuardFinding[] = [
      {
        severity: "block",
        code: "empty-briefing",
        message: '공허한 브리핑 문장: "시장이 주목"',
      },
      {
        severity: "block",
        code: "earnings-reaction-omission",
        message: "숫자+Evidence뉴스 있는데 가이던스 누락: 샌디스크",
      },
      {
        severity: "warn",
        code: "bullet-too-long",
        message: "불릿이 깁니다",
      },
    ];
    const hints = findingsToRepairHints(findings);
    assert.equal(hints.length, 2);
    assert.ok(hints[0].includes("[empty-briefing]"));
    assert.ok(hints[0].includes("사실→왜→체감→관찰"));
    assert.ok(hints[1].includes("[earnings-reaction-omission]"));
    assert.ok(hints[1].includes("이중 서술"));
  });
});

describe("pre-slot fact-mismatch uses prior session, not live premarket", () => {
  const krPreKospi = {
    id: "kospi" as const,
    name: "코스피",
    shortName: "KOSPI",
    region: "KR" as const,
    value: 3200,
    change: -40,
    changePercent: -1.2,
    status: "pre" as const,
    changeBasis: "premarket" as const,
    priorSessionChangePercent: 3.56,
  };

  const preBriefing = (headline: string, extraBullet: string): BriefingDraft => ({
    headline,
    bullets: [
      "전일 코스피 +3.56% 마감, 외국인 순매수 지속",
      extraBullet,
      "오늘은 외국인 순매수 유지 여부와 미 10년물 4.8% 상회 여부를 확인",
      "VIX 16선 하회 유지되면 위험선호 온도 유지",
    ],
    evidenceIds: ["kospi"],
  });

  it("does not hard-block 전일/무앵커 강세 when prior close was up and live is down", () => {
    const report = runGuard({
      snapshot: baseSnapshot({
        slot: "kr-pre",
        indexes: [krPreKospi],
      }),
      briefing: preBriefing(
        "전일 코스피 강세 마감 후 장전 점검",
        "코스피는 강세 흐름이 이어진 전 거래를 바탕으로 오늘 수급을 본다",
      ),
      decision: okDecision,
      scope: "kr",
    });
    assert.equal(
      report.findings.some((f) => f.code === "fact-mismatch"),
      false,
      report.findings.map((f) => f.code).join(","),
    );
  });

  it("still hard-blocks live 강세 claim when premarket is down", () => {
    const report = runGuard({
      snapshot: baseSnapshot({
        slot: "kr-pre",
        indexes: [krPreKospi],
      }),
      briefing: preBriefing(
        "전일 코스피 +3.56% 마감 후 장전 점검",
        "현재 코스피는 강세",
      ),
      decision: okDecision,
      scope: "kr",
    });
    assert.ok(
      report.findings.some((f) => f.code === "fact-mismatch" && f.severity === "block"),
      report.findings.map((f) => `${f.code}:${f.message}`).join(" | "),
    );
  });

  it("does not fx-mismatch 전일 환율 서술 against live tick on kr-pre", () => {
    const report = runGuard({
      snapshot: baseSnapshot({
        slot: "kr-pre",
        indexes: [krPreKospi],
        macros: [
          {
            id: "usdkkrw",
            name: "원/달러",
            value: "1,416",
            changeLabel: "-6",
            direction: "down",
          },
        ],
      }),
      briefing: preBriefing(
        "전일 코스피 +3.56% 마감 후 장전 점검",
        "전일 원/달러 상승 압력을 점검한 뒤 오늘 1,420원 상회 여부를 본다",
      ),
      decision: okDecision,
      scope: "kr",
    });
    assert.equal(
      report.findings.some((f) => f.code === "fx-mismatch"),
      false,
      report.findings.map((f) => `${f.code}:${f.message}`).join(" | "),
    );
  });
});
