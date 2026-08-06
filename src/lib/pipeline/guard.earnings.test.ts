import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGuard } from "./guard";
import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
} from "./types";
import type { EarningsContextNewsItem } from "@/lib/types";

function sndkEvent(opts: {
  hoursAgo: number;
  beatLabel?: "서프라이즈" | "미스";
  contextNews?: EarningsContextNewsItem[];
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
        ? `발표됨 · EPS $39.25 vs 예상 $34.52 · ${opts.beatLabel}`
        : "발표됨 · EPS $39.25 vs 예상 $34.52",
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
      contextNews: opts.contextNews,
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

  it("allows numbers + guidance dual narrative when contextNews present (no beatLabel)", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 EPS $39.25 vs 예상 $34.52 발표 후 Evidence뉴스상 가이던스 실망으로 섹터 되밀림",
      ],
      evidenceIds: [],
    };
    const report = runGuard({
      snapshot: baseSnapshot(
        sndkEvent({
          hoursAgo: 12,
          contextNews: [
            {
              title: "Sandisk shares slip after soft guidance",
              publisher: "Reuters",
              publishedAt: new Date().toISOString(),
              snippet: "Sandisk shares slip after soft guidance",
            },
          ],
        }),
      ),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    const polarityBlocks = report.findings.filter(
      (f) =>
        f.severity === "block" &&
        (f.code === "unsupported-earnings-result" ||
          f.code === "invented-event-result" ||
          f.code === "earnings-beat-polarity" ||
          f.code === "unsupported-guidance-claim"),
    );
    assert.equal(polarityBlocks.length, 0, polarityBlocks.map((f) => f.code).join(","));
    assert.equal(report.ok, true);
  });

  it("allows facts-only post-print line without polarity claim", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 실적 발표됨 · EPS $39.25 vs 예상 $34.52 — 반응 근거 부족",
      ],
      evidenceIds: [],
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

  it("blocks guidance disappointment claim without contextNews", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 가이던스 실망에 반도체 섹터 되밀림",
      ],
      evidenceIds: ["vix"],
    };
    const report = runGuard({
      snapshot: baseSnapshot(sndkEvent({ hoursAgo: 12 })),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some(
        (f) => f.severity === "block" && f.code === "unsupported-guidance-claim",
      ),
      `expected unsupported-guidance-claim, got: ${report.findings.map((f) => f.code).join(",")}`,
    );
    assert.equal(report.ok, false);
  });

  it("allows short guidance summary when Evidence contextNews present", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 실적 발표됨 — Evidence뉴스상 가이던스 하회 언급 · 섹터 온도 점검",
      ],
      evidenceIds: ["vix"],
    };
    const report = runGuard({
      snapshot: baseSnapshot(
        sndkEvent({
          hoursAgo: 12,
          contextNews: [
            {
              title: "Sandisk shares slip after soft guidance",
              publisher: "Reuters",
              publishedAt: new Date().toISOString(),
              snippet: "Sandisk shares slip after soft guidance",
            },
          ],
        }),
      ),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    const guidanceBlocks = report.findings.filter(
      (f) => f.severity === "block" && f.code === "unsupported-guidance-claim",
    );
    assert.equal(guidanceBlocks.length, 0);
  });

  it("hard-fails earnings-reaction-omission when contextNews present but no guidance/reaction", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 실적 발표됨 · EPS $39.25 vs 예상 $34.52 — 점검만",
      ],
      evidenceIds: [],
    };
    const report = runGuard({
      snapshot: baseSnapshot(
        sndkEvent({
          hoursAgo: 12,
          contextNews: [
            {
              title: "Sandisk shares slip after soft guidance",
              publisher: "Reuters",
              publishedAt: new Date().toISOString(),
              snippet: "Sandisk shares slip after soft guidance",
            },
          ],
        }),
      ),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some(
        (f) => f.severity === "block" && f.code === "earnings-reaction-omission",
      ),
      `expected earnings-reaction-omission block, got: ${report.findings.map((f) => `${f.severity}:${f.code}`).join(",")}`,
    );
    assert.equal(report.ok, false);
  });

  it("hard-fails when guidance-theme news but bullet only says sector 밀림 (no guidance cue)", () => {
    const briefing: BriefingDraft = {
      headline: "나스닥 장전 밀림에 반도체 되밀림",
      bullets: [
        "나스닥 장전 약세, 반도체 지수 되밀림",
        "미 10년물·VIX 안정 속 NFP 대기",
        "샌디스크 실적 발표 후에도 반도체 섹터 -1% 이상 밀림 — 전일 급등 후 차익 실현",
      ],
      evidenceIds: [],
    };
    const report = runGuard({
      snapshot: baseSnapshot(
        sndkEvent({
          hoursAgo: 12,
          contextNews: [
            {
              title: "NBM으로 3분의 2 확보했다더니…샌디스크 가이던스 한 줄에 코스피 4%대 하락",
              publisher: "market-ink.co.kr",
              publishedAt: new Date().toISOString(),
              snippet: "NBM으로 3분의 2 확보했다더니…샌디스크 가이던스 한 줄에 코스피 4%대 하락",
            },
          ],
        }),
      ),
      briefing,
      decision: okDecision,
      scope: "us",
    });
    assert.ok(
      report.findings.some(
        (f) => f.severity === "block" && f.code === "earnings-reaction-omission",
      ),
      `expected earnings-reaction-omission for guidance-theme omission, got: ${report.findings.map((f) => `${f.severity}:${f.code}`).join(",")}`,
    );
    assert.equal(report.ok, false);
  });
});
