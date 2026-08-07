import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildThinEvidenceDrafts } from "./degradedPublish";
import {
  ensurePostCloseLead,
  missingPostCloseLeads,
  resolvePostCloseIndexes,
} from "./sessionCloseLead";
import { seedBriefing } from "./seed";
import {
  findingsToRepairHints,
  patchBriefingForGuardRetry,
  runGuard,
} from "./guard";
import type { BriefingDraft, CollectorSnapshot, DecisionDraft } from "./types";

const okDecision: DecisionDraft = {
  scenarios: [
    {
      id: "base",
      label: "A · 기본",
      title: "관망",
      summary: "지수 마감 후 환율 반응 관측",
      implication: "환율 임계 유지 시 A",
    },
    {
      id: "risk",
      label: "B · 주의",
      title: "추가 흔들림",
      summary: "수급 이탈 시 체감 악화",
      implication: "외국인 순매도 확대 시 B",
    },
  ],
  checkItems: [
    { id: "c1", text: "원/달러 1,420원 돌파 여부", why: "돌파면 B" },
    { id: "c2", text: "외국인 순매도 지속 여부", why: "지속이면 B" },
    { id: "c3", text: "코스피200 vs 코스피 갭", why: "갭 확대면 B" },
  ],
};

function krPostSnapshot(): CollectorSnapshot {
  return {
    collectedAt: new Date().toISOString(),
    slot: "kr-post",
    indexes: [
      {
        id: "kospi",
        name: "코스피",
        shortName: "KOSPI",
        region: "KR",
        value: 6258,
        change: -37.6,
        changePercent: -0.6,
        status: "closed",
        changeBasis: "prior-close",
      },
      {
        id: "kosdaq",
        name: "코스닥",
        shortName: "KOSDAQ",
        region: "KR",
        value: 798,
        change: -2.8,
        changePercent: -0.36,
        status: "closed",
        changeBasis: "prior-close",
      },
    ],
    macros: [
      {
        id: "usdkkrw",
        name: "원/달러",
        value: "1418",
        changeLabel: "-3",
        direction: "down",
      },
    ],
    temperature: "국내 약세",
    mood: "caution",
    moodLabel: "주의",
    asOfLabel: "test",
    events: [],
  };
}

describe("sessionCloseLead / kr-post quality", () => {
  it("seed post leads with KOSPI close direction and %", () => {
    const draft = seedBriefing(krPostSnapshot(), "kr");
    assert.match(draft.headline, /코스피/);
    assert.match(draft.headline, /-0\.60%/);
    assert.match(draft.headline, /하락|마감/);
    assert.match(draft.bullets[0] ?? "", /코스피 마감/);
    assert.match(draft.bullets[0] ?? "", /-0\.60%/);
    assert.equal(/정리합니다|무엇을\s*흐름을\s*주도했는지\s*봅니다/.test(draft.bullets[0] ?? ""), false);
    assert.equal(/전쟁\s*결과\s*예측\s*금지/.test(draft.bullets.join("\n")), false);
  });

  it("seed/thin post bullets stay ant-facing (no Evidence meta)", () => {
    const seed = seedBriefing(krPostSnapshot(), "kr");
    const thin = buildThinEvidenceDrafts(krPostSnapshot(), "kr");
    const forbid =
      /Evidence|플래그\s*\(\s*Evidence\s*\)|연결합니다|로만\s*짧게|방향\s*예측\s*금지/;
    for (const draft of [seed, thin.briefing]) {
      const prose = [draft.headline, ...draft.bullets].join("\n");
      assert.equal(forbid.test(prose), false, prose);
    }
    assert.match(seed.bullets[0] ?? "", /코스피 마감 하락 -0\.60%/);
    assert.match(seed.bullets[0] ?? "", /코스닥 마감 하락 -0\.36%/);
    assert.equal(/\.\s*$/.test(seed.bullets[0] ?? ""), true);
  });

  it("thin post headline+first bullet use session close", () => {
    const thin = buildThinEvidenceDrafts(krPostSnapshot(), "kr");
    assert.match(thin.briefing.headline, /코스피/);
    assert.match(thin.briefing.headline, /-0\.60%/);
    assert.match(thin.briefing.bullets[0] ?? "", /마감/);
    assert.match(thin.briefing.bullets[0] ?? "", /-0\.60%/);
  });

  it("Guard blocks checklist-only kr-post without index close", () => {
    const briefing: BriefingDraft = {
      headline: "오늘 국내 세션 마감 정리 · 지수와 체감의 차이",
      bullets: [
        "오늘 국내 세션은 지수와 시장 폭·시총 상위 체감이 같은 방향이었는지부터 정리합니다.",
        "장중 외국인·기관 수급과 코스피200 중 무엇이 흐름을 주도했는지 봅니다.",
        "지정학 플래그는 유가·환율만 짧게.",
        "다음 세션 연결은 환율 반응만 점검합니다.",
      ],
      evidenceIds: ["usdkkrw", "vix"],
    };
    const report = runGuard({
      snapshot: krPostSnapshot(),
      briefing,
      decision: okDecision,
      scope: "kr",
    });
    assert.equal(report.ok, false);
    assert.ok(
      report.findings.some((f) => f.code === "post-missing-index-close"),
    );
    const hints = findingsToRepairHints(
      report.findings.filter((f) => f.code === "post-missing-index-close"),
    );
    assert.ok(hints.some((h) => /마감 상승\/하락/.test(h)));
  });

  it("patch injects session close into checklist briefing", () => {
    const briefing: BriefingDraft = {
      headline: "오늘 국내 세션 마감 정리 · 지수와 체감의 차이",
      bullets: [
        "오늘 국내 세션은 지수와 시장 폭·시총 상위 체감이 같은 방향이었는지부터 정리합니다.",
        "장중 외국인·기관 수급과 코스피200 중 무엇이 흐름을 주도했는지 봅니다.",
      ],
      evidenceIds: ["usdkkrw"],
    };
    const patched = patchBriefingForGuardRetry(
      briefing,
      krPostSnapshot(),
      "kr",
    );
    assert.match(patched.headline, /코스피/);
    assert.match(patched.headline, /-0\.60%/);
    assert.match(patched.bullets[0] ?? "", /코스피 마감 하락/);
    const missing = missingPostCloseLeads(
      patched,
      resolvePostCloseIndexes(krPostSnapshot(), "kr"),
    );
    assert.equal(missing.length, 0);

    const report = runGuard({
      snapshot: krPostSnapshot(),
      briefing: patched,
      decision: okDecision,
      scope: "kr",
    });
    assert.equal(
      report.findings.some((f) => f.code === "post-missing-index-close"),
      false,
    );
  });

  it("ensurePostCloseLead is idempotent when already correct", () => {
    const seed = seedBriefing(krPostSnapshot(), "kr");
    const again = ensurePostCloseLead(seed, krPostSnapshot(), "kr");
    assert.equal(again.headline, seed.headline);
    assert.equal(again.bullets[0], seed.bullets[0]);
  });
});
