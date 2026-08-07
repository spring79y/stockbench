import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureImminentEarningsMentioned,
  runGuard,
  scrubFalseImminentEarningsLabels,
} from "./guard";
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

  it("treats pending aggregation + contextNews as post must-cover (no invented numbers)", () => {
    const dateISO = new Date(Date.now() + 4 * 3600_000).toISOString(); // Yahoo stamp still future
    const events: CollectorSnapshot["events"] = [
      {
        id: "earnings-naver",
        dateLabel: "오늘",
        region: "KR",
        title: "NAVER 실적 발표",
        level: "high",
        oneLiner: "발표됨 · 결과 집계 대기",
        kind: "earnings",
        symbol: "035420.KS",
        megaCapId: "naver",
        dateISO,
        contextNews: [
          {
            title: "네이버, 2Q 영업익 5203억원…비용 증가에 '어닝 쇼크'",
            publisher: "네이트",
            publishedAt: new Date().toISOString(),
            snippet: "네이버, 2Q 영업익 5203억원…비용 증가에 '어닝 쇼크'",
          },
        ],
      },
    ];
    const briefingOmit: BriefingDraft = {
      headline: "코스피 약세 속 대형주 온도 점검",
      bullets: [
        "코스피 약세, 시총 상위 평균 낙폭",
        "원/달러·VIX 흔들림 점검",
        "NAVER 실적 발표됨 — 점검만",
      ],
      evidenceIds: [],
    };
    const omitReport = runGuard({
      snapshot: baseSnapshot(events),
      briefing: briefingOmit,
      decision: okDecision,
      scope: "kr",
    });
    assert.ok(
      omitReport.findings.some(
        (f) => f.severity === "block" && f.code === "earnings-reaction-omission",
      ),
      `expected pending+news reaction omission, got: ${omitReport.findings.map((f) => `${f.severity}:${f.code}`).join(",")}`,
    );

    const briefingOk: BriefingDraft = {
      headline: "코스피 약세 속 네이버 실적 소화",
      bullets: [
        "코스피 약세, 시총 상위 평균 낙폭",
        "NAVER 실적 발표됨 · 결과 집계 대기 — Evidence뉴스상 어닝 쇼크·비용 증가 언급, 섹터 반응 점검",
        "원/달러·VIX 흔들림 점검",
      ],
      evidenceIds: [],
    };
    const okReport = runGuard({
      snapshot: baseSnapshot(events),
      briefing: briefingOk,
      decision: okDecision,
      scope: "kr",
    });
    assert.equal(
      okReport.findings.filter((f) => f.code === "earnings-reaction-omission").length,
      0,
    );
  });
});

describe("ensureImminentEarningsMentioned post vs 임박", () => {
  it("never says 임박 when KR OP/revenue actual exists (even without EPS)", () => {
    const dateISO = new Date().toISOString();
    const events: CollectorSnapshot["events"] = [
      {
        id: "earnings-naver",
        dateLabel: "오늘",
        region: "KR",
        title: "NAVER 실적 발표",
        level: "high",
        oneLiner: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
        kind: "earnings",
        symbol: "035420.KS",
        megaCapId: "naver",
        dateISO,
        actual: {
          operatingProfitActual: 520_300_000_000,
          operatingProfitActualLabel: "약 5,203억원",
          revenueActual: 3_388_800_000_000,
          revenueActualLabel: "약 3.4조원",
        },
        contextNews: [
          {
            title: "네이버 2분기 실적 '선방' 매출 3.4조원 사상 최대",
            publisher: "매일경제",
            publishedAt: new Date().toISOString(),
            snippet: "네이버 2분기 실적 '선방' 매출 3.4조원 사상 최대",
          },
        ],
      },
    ];
    const briefing: BriefingDraft = {
      headline: "코스피 장후 약세 정리",
      bullets: [
        "코스피 약세, 시총 상위 혼조",
        "원/달러·수급 점검",
        "외국인 순매도 지속 여부",
      ],
      evidenceIds: ["usdkkrw"],
    };
    const patched = ensureImminentEarningsMentioned(
      briefing,
      baseSnapshot(events),
      "kr",
    );
    const joined = patched.bullets.join("\n");
    assert.equal(/실적\s*(발표\s*)?임박/.test(joined), false);
    assert.ok(
      patched.bullets.some((b) => /NAVER|네이버/.test(b) && /발표됨/.test(b)),
      `expected 발표됨 patch, got: ${joined}`,
    );
    assert.ok(
      patched.bullets.some((b) => /5,203|3\.4조/.test(b)),
      `expected Evidence OP/revenue numbers, got: ${joined}`,
    );
  });

  it("scrubs false NAVER 실적 임박 when actual already present", () => {
    const dateISO = new Date().toISOString();
    const events: CollectorSnapshot["events"] = [
      {
        id: "earnings-naver",
        dateLabel: "오늘",
        region: "KR",
        title: "NAVER 실적 발표",
        level: "high",
        oneLiner: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
        kind: "earnings",
        symbol: "035420.KS",
        megaCapId: "naver",
        dateISO,
        actual: {
          operatingProfitActual: 520_300_000_000,
          operatingProfitActualLabel: "약 5,203억원",
          revenueActual: 3_388_800_000_000,
          revenueActualLabel: "약 3.4조원",
        },
        contextNews: [
          {
            title: "네이버 실적 관련",
            publisher: "test",
            publishedAt: new Date().toISOString(),
            snippet: "관련",
          },
        ],
      },
    ];
    const briefing: BriefingDraft = {
      headline: "국내 세션 마감",
      bullets: [
        "지수·체감 정리",
        "NAVER 실적 임박 — Evidence뉴스 참고해 가이던스·섹터 맥락만 짧게 (방향 예측 금지)",
      ],
      evidenceIds: [],
    };
    const scrubbed = scrubFalseImminentEarningsLabels(
      briefing,
      baseSnapshot(events),
      "kr",
    );
    assert.equal(/실적\s*(발표\s*)?임박/.test(scrubbed.bullets.join("\n")), false);
    assert.ok(scrubbed.bullets.some((b) => /발표됨/.test(b)));
  });

  it("still allows 임박 for future pre-report earnings", () => {
    const dateISO = new Date(Date.now() + 20 * 3600_000).toISOString();
    const events: CollectorSnapshot["events"] = [
      {
        id: "earnings-brkb",
        dateLabel: "일요일",
        region: "US",
        title: "버크셔 실적 발표",
        level: "high",
        oneLiner: "시장 예상 주당 순이익 $5.13",
        kind: "earnings",
        symbol: "BRK-B",
        dateISO,
        contextNews: [
          {
            title: "Berkshire earnings preview ahead of report",
            publisher: "test",
            publishedAt: new Date().toISOString(),
            snippet: "preview ahead of earnings",
          },
        ],
      },
    ];
    const briefing: BriefingDraft = {
      headline: "미 장후 정리",
      bullets: ["다우 약세", "금리·VIX 점검", "메가캡 혼조"],
      evidenceIds: ["us10y"],
    };
    const patched = ensureImminentEarningsMentioned(
      briefing,
      { ...baseSnapshot(events), slot: "us-post" },
      "us",
    );
    assert.ok(
      patched.bullets.some((b) => /버크셔/.test(b) && /임박/.test(b)),
      `expected pre 임박, got: ${patched.bullets.join(" | ")}`,
    );
  });
});
