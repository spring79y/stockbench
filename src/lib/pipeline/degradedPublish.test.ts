import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FINAL_ATTEMPT_DEMOTE_CODES,
  HARD_NEVER_DEMOTE_CODES,
  appendDegradedAsOf,
  blockingCodes,
  buildThinEvidenceDrafts,
  classifyFinalAttempt,
  demoteFinalAttemptFindings,
  hasHardBlocks,
  markDegradedView,
  summarizeDegradedPublish,
} from "./degradedPublish";
import type { EditorialView, GuardFinding, GuardReport } from "./types";
import type { CollectorSnapshot } from "./types";

function finding(
  code: string,
  severity: GuardFinding["severity"] = "block",
): GuardFinding {
  return { code, severity, message: `${code} msg` };
}

describe("degradedPublish demotion policy", () => {
  it("demotes only carry-forward soft codes on final attempt", () => {
    const input: GuardFinding[] = [
      finding("carry-forward-omission"),
      finding("carry-forward-no-reeval"),
      finding("invented-event-result"),
      finding("jargon-wall", "warn"),
    ];
    const out = demoteFinalAttemptFindings(input);
    assert.equal(out[0]?.severity, "warn");
    assert.equal(out[1]?.severity, "warn");
    assert.equal(out[2]?.severity, "block");
    assert.equal(out[3]?.severity, "warn");
    assert.ok(out[0]?.message.includes("제한 연속성"));
  });

  it("never lists hard codes in demote set", () => {
    for (const code of HARD_NEVER_DEMOTE_CODES) {
      assert.equal(
        FINAL_ATTEMPT_DEMOTE_CODES.has(code),
        false,
        `${code} must stay hard`,
      );
    }
    assert.equal(FINAL_ATTEMPT_DEMOTE_CODES.has("earnings-reaction-omission"), false);
    assert.equal(FINAL_ATTEMPT_DEMOTE_CODES.has("empty-briefing"), false);
    assert.equal(FINAL_ATTEMPT_DEMOTE_CODES.has("slot-tone-mismatch"), false);
    assert.equal(FINAL_ATTEMPT_DEMOTE_CODES.has("prior-label-mismatch"), false);
    assert.equal(FINAL_ATTEMPT_DEMOTE_CODES.has("recommendation-or-prediction"), false);
    assert.equal(FINAL_ATTEMPT_DEMOTE_CODES.has("earnings-beat-polarity"), false);
    assert.equal(HARD_NEVER_DEMOTE_CODES.has("post-missing-index-close"), true);
  });

  it("classifies soft-only final attempt as degraded-draft", () => {
    const report: GuardReport = {
      ok: false,
      findings: [
        finding("carry-forward-omission"),
        finding("carry-forward-no-reeval"),
      ],
    };
    const result = classifyFinalAttempt(report);
    assert.equal(result.kind, "degraded-draft");
    assert.equal(hasHardBlocks(result.findings), false);
    assert.deepEqual(blockingCodes(result.findings), []);
  });

  it("classifies hard remaining as thin-evidence (never degraded LLM draft)", () => {
    const report: GuardReport = {
      ok: false,
      findings: [
        finding("carry-forward-omission"),
        finding("invented-event-result"),
        finding("prior-label-mismatch"),
      ],
    };
    const result = classifyFinalAttempt(report);
    assert.equal(result.kind, "thin-evidence");
    assert.ok(hasHardBlocks(result.findings));
    assert.ok(blockingCodes(result.findings).includes("invented-event-result"));
    assert.ok(blockingCodes(result.findings).includes("prior-label-mismatch"));
    // soft was demoted
    assert.equal(
      result.findings.find((f) => f.code === "carry-forward-omission")?.severity,
      "warn",
    );
  });

  it("marks view with 제한 연속성 and asOf note", () => {
    const view: EditorialView = {
      briefing: { headline: "h", bullets: ["b"], evidenceIds: ["vix"] },
      scenarios: [],
      checkItems: [],
      publishedAt: "2026-08-07T06:40:00.000Z",
      slot: "kr-post",
      mode: "full",
    };
    const marked = markDegradedView(view, "degraded-draft");
    assert.equal(marked.degraded, true);
    assert.equal(marked.degradedLabel, "제한 연속성");
    assert.ok(marked.changeLines?.[0]?.includes("제한 연속성"));
    assert.equal(
      appendDegradedAsOf("2026. 08. 07. 15:40 · Yahoo 참고", true),
      "2026. 08. 07. 15:40 · Yahoo 참고 · 제한 연속성",
    );
  });

  it("marks thin-evidence view with 제한 연속성 only (no Evidence chrome jargon)", () => {
    const view: EditorialView = {
      briefing: { headline: "h", bullets: ["b"], evidenceIds: ["vix"] },
      scenarios: [],
      checkItems: [],
      publishedAt: "2026-08-07T06:40:00.000Z",
      slot: "kr-post",
      mode: "full",
    };
    const marked = markDegradedView(view, "thin-evidence");
    assert.equal(marked.degradedLabel, "제한 연속성");
    assert.equal(/Evidence/.test(marked.degradedLabel ?? ""), false);
  });

  it("summarizes degraded status for status.json", () => {
    const summary = summarizeDegradedPublish({
      degraded: true,
      findings: [
        finding("carry-forward-omission", "warn"),
        finding("carry-forward-no-reeval", "warn"),
      ],
    });
    assert.match(summary, /^degraded ·/);
    assert.ok(summary.includes("carry-forward-omission"));
  });

  it("builds thin evidence drafts from snapshot anchors (no invented polarity)", () => {
    const snapshot: CollectorSnapshot = {
      collectedAt: new Date().toISOString(),
      slot: "kr-post",
      indexes: [
        {
          id: "kospi",
          name: "코스피",
          shortName: "KOSPI",
          region: "KR",
          value: 2500,
          change: -10,
          changePercent: -0.4,
          status: "closed",
          changeBasis: "prior-close",
        },
      ],
      macros: [
        {
          id: "usdkkrw",
          name: "원/달러",
          value: "1380",
          changeLabel: "+2",
          direction: "up",
        },
      ],
      temperature: "국내 약세",
      mood: "risk-off",
      moodLabel: "위험",
      asOfLabel: "test",
      events: [],
    };
    const thin = buildThinEvidenceDrafts(snapshot, "kr");
    assert.ok(thin.briefing.headline.length > 0);
    assert.ok(thin.briefing.bullets.length >= 2);
    // Locked: scenarios/checkItems may be empty on thin path
    assert.equal(thin.decision.scenarios.length, 0);
    assert.equal(thin.decision.checkItems.length, 0);
    const prose = [thin.briefing.headline, ...thin.briefing.bullets].join(" ");
    assert.equal(/사라|매수|매도 추천|서프라이즈|미스/.test(prose), false);
    assert.ok(prose.includes("코스피"));
    assert.equal(/Evidence|연결합니다|플래그\s*\(\s*Evidence\s*\)/.test(prose), false);
    assert.match(thin.briefing.headline, /코스피/);
    assert.match(thin.briefing.headline, /-0\.40%/);
    assert.match(thin.briefing.bullets[0] ?? "", /마감/);
  });

  it("does not dump English geopolitics headlines on KR thin path", () => {
    const snapshot: CollectorSnapshot = {
      collectedAt: new Date().toISOString(),
      slot: "kr-post",
      indexes: [
        {
          id: "kospi",
          name: "코스피",
          shortName: "KOSPI",
          region: "KR",
          value: 2500,
          change: -10,
          changePercent: -0.4,
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
      evidence: {
        session: {
          slot: "kr-post",
          slotLabel: "한국 장후",
          collectedAt: new Date().toISOString(),
          asOfLabel: "test",
          focusHint: "post",
        },
        temperature: {
          label: "국내 약세",
          mood: "caution",
          moodLabel: "주의",
          krAvgPct: -0.4,
          usAvgPct: null,
          decouplingPct: 0,
          decouplingNote: "",
        },
        indexes: {
          kr: [
            {
              id: "kospi",
              name: "코스피",
              changePercent: -0.4,
              status: "closed",
              changeBasis: "prior-close",
              priorSessionChangePercent: -1.1,
            },
          ],
          us: [],
        },
        macros: [
          {
            id: "usdkkrw",
            name: "원/달러",
            value: "1418",
            changeLabel: "-3",
            direction: "down",
          },
        ],
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
          elevated: true,
          status: "live",
          summary: "oil",
          note: "",
          flags: ["geopolitics"],
          headlines: [
            {
              title:
                "Investors scored on Iran war's oil market boom. Staying long the trade will get trickier",
              publisher: "Reuters",
              publishedAt: new Date().toISOString(),
            },
          ],
        },
        previous: {
          slot: null,
          publishedAt: null,
          headlines: {},
          continuity: {},
        },
      },
    };
    const thin = buildThinEvidenceDrafts(snapshot, "kr");
    const joined = thin.briefing.bullets.join("\n");
    assert.equal(/Iran|Investors scored/i.test(joined), false);
    assert.ok(/지정학|리스크|유가|VIX|환율/.test(joined));
    assert.equal(/Evidence|연결합니다|플래그\s*\(\s*Evidence\s*\)/.test(joined), false);
  });
});
