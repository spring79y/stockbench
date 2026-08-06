import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGuard } from "./guard";
import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
} from "./types";

function sndkEvent(opts: {
  hoursAgo: number;
  beatLabel?: "서프라이즈" | "미스";
}): CollectorSnapshot["events"] {
  const dateISO = new Date(Date.now() - opts.hoursAgo * 3600_000).toISOString();
  return [
    {
      id: "earnings-bridge-sndk",
      dateLabel: "오늘",
      region: "US",
      title: "샌디스크 실적 발표",
      level: "high",
      oneLiner: opts.beatLabel
        ? `발표 결과: EPS 컨센서스 대비 ${opts.beatLabel} — 점검용 (매매 신호 아님)`
        : "발표됨 · 판정 보류 (점검용 · 매매 신호 아님)",
      kind: "earnings",
      symbol: "SNDK",
      bridgeId: "sndk",
      dateISO,
      actual: {
        epsActual: 39.25,
        epsEstimate: 34.515,
        beatLabel: opts.beatLabel,
        reportedDateISO: dateISO,
      },
    },
  ];
}

function baseSnapshot(events: CollectorSnapshot["events"]): CollectorSnapshot {
  return {
    collectedAt: new Date().toISOString(),
    slot: "us-noon",
    indexes: [],
    macros: [],
    temperature: "미국 약세",
    mood: "risk-off",
    moodLabel: "위험",
    asOfLabel: "test",
    events,
  };
}

const okDecision: DecisionDraft = {
  scenarios: [
    {
      id: "base",
      label: "A · 기본",
      title: "반도체 되밀림 속 NFP 대기",
      summary: "나스닥 약세, 금리 안정 속 고용보고서 대기",
      implication: "금리 임계 미만 유지 시 A 유지",
    },
    {
      id: "risk",
      label: "B · 주의",
      title: "고용 쇼크 시 금리 기대 흔들림",
      summary: "NFP 이탈 시 금리 경로 재평가 가능",
      implication: "금리 돌파 시 B에 가깝다",
    },
  ],
  checkItems: [
    { id: "c1", text: "저녁 개장 후 반도체 온도", why: "되밀림 지속 여부 관측" },
    { id: "c2", text: "미 10년물 임계 돌파 여부", why: "금리 경로 재평가 신호" },
    { id: "c3", text: "NFP 발표 후 VIX 반응", why: "변동성 확대 여부" },
  ],
};

describe("guard earnings polarity omit", () => {
  it("blocks 서프라이즈 claim when Evidence has no beatLabel (thin-source)", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 실적 서프라이즈에도 반도체 섹터 되밀림",
      ],
      evidenceIds: ["vix"],
    };
    const report = runGuard({
      snapshot: baseSnapshot(sndkEvent({ hoursAgo: 12 })),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    const codes = report.findings.filter((f) => f.severity === "block").map((f) => f.code);
    assert.ok(
      codes.includes("unsupported-earnings-result") ||
        codes.includes("invented-event-result"),
      `expected unsupported/invented block, got: ${codes.join(",")}`,
    );
    assert.equal(report.ok, false);
  });

  it("blocks 서프라이즈 in checkItems why when beatLabel omitted", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 실적 발표 후 반도체 섹터 온도 점검",
      ],
      evidenceIds: ["vix"],
    };
    const decision: DecisionDraft = {
      ...okDecision,
      checkItems: [
        ...okDecision.checkItems.slice(0, 2),
        {
          id: "c3",
          text: "샌디스크 실적 후 반도체 섹터 온도",
          why: "서프라이즈에도 섹터 되밀림이 완화되면 A 유지",
        },
      ],
    };
    const report = runGuard({
      snapshot: baseSnapshot(sndkEvent({ hoursAgo: 12 })),
      briefing,
      decision,
      scope: "us",
    });
    const hit = report.findings.some(
      (f) =>
        f.severity === "block" &&
        (f.code === "unsupported-earnings-result" ||
          f.code === "invented-event-result"),
    );
    assert.ok(hit, "checkItem why must not re-assert 서프라이즈 without beatLabel");
    assert.equal(report.ok, false);
  });

  it("allows 판정 보류 phrasing without polarity claim", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 실적 발표됨 — 판정 보류 · 섹터 반응만 관측",
      ],
      evidenceIds: ["vix"],
    };
    const report = runGuard({
      snapshot: baseSnapshot(sndkEvent({ hoursAgo: 12 })),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    const polarityBlocks = report.findings.filter(
      (f) =>
        f.severity === "block" &&
        (f.code === "unsupported-earnings-result" ||
          f.code === "invented-event-result" ||
          f.code === "earnings-beat-polarity"),
    );
    assert.equal(polarityBlocks.length, 0);
  });
});
