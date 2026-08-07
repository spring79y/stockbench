import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FORBIDDEN_SEED_VOICE_FRAGMENTS,
  briefingHasForbiddenSeedVoice,
  containsForbiddenSeedVoice,
  seedBriefing,
  seedDecision,
} from "./seed";
import type { CollectorSnapshot } from "./types";

function snapshot(slot: CollectorSnapshot["slot"] = "kr-post"): CollectorSnapshot {
  return {
    collectedAt: new Date().toISOString(),
    slot,
    indexes: [
      {
        id: "kospi",
        name: "코스피",
        shortName: "KOSPI",
        region: "KR",
        value: 2500,
        change: -15,
        changePercent: -0.6,
        status: "closed",
        changeBasis: "prior-close",
        priorSessionChangePercent: -0.4,
      },
      {
        id: "kosdaq",
        name: "코스닥",
        shortName: "KOSDAQ",
        region: "KR",
        value: 800,
        change: -3,
        changePercent: -0.36,
        status: "closed",
        changeBasis: "prior-close",
        priorSessionChangePercent: -0.2,
      },
      {
        id: "nasdaq",
        name: "나스닥",
        shortName: "NDX",
        region: "US",
        value: 18000,
        change: -10,
        changePercent: -0.06,
        status: "closed",
        changeBasis: "prior-close",
        priorSessionChangePercent: 0.1,
      },
    ],
    macros: [
      {
        id: "usdkkrw",
        name: "원/달러",
        value: "1,380",
        changeLabel: "+2",
        direction: "up",
      },
      {
        id: "wti",
        name: "WTI",
        value: "$76.71",
        changeLabel: "+0.4",
        direction: "up",
      },
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
    temperature: "국내 약세",
    mood: "mixed",
    moodLabel: "혼조",
    asOfLabel: "test",
    evidence: {
      session: {
        slot,
        slotLabel: "한국 장후",
        collectedAt: new Date().toISOString(),
        asOfLabel: "test",
        focusHint: "kr",
      },
      temperature: {
        label: "국내 약세",
        mood: "mixed",
        moodLabel: "혼조",
        krAvgPct: -0.5,
        usAvgPct: -0.1,
        decouplingPct: 0.4,
        decouplingNote: "",
      },
      indexes: { kr: [], us: [] },
      macros: [],
      flow: {
        status: "live",
        asOfLabel: "08.07",
        todaySummary:
          "코스피 08.07· 외국인 -8,651억· 기관 +5,854억· 개인 +2,675억",
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
      risk: {
        status: "live",
        elevated: true,
        summary: "",
        flags: [],
        headlines: [{ title: "중동 긴장", publisher: "t", publishedAt: "" }],
        note: "",
      },
      events: [],
      previous: {
        slot: null,
        publishedAt: null,
        headlines: {},
        continuity: {},
      },
    },
    events: [
      {
        id: "earnings-naver",
        kind: "earnings",
        level: "high",
        region: "KR",
        title: "NAVER 실적 발표",
        dateLabel: "오늘",
        dateISO: new Date().toISOString(),
        oneLiner: "발표됨",
        actual: {
          revenueActualLabel: "약 3.4조원",
          operatingProfitActualLabel: "약 5,203억원",
        },
      },
    ],
  };
}

describe("seedBriefing facts-only", () => {
  it("never emits forbidden seed-voice fragments", () => {
    for (const scope of ["kr", "us", "all"] as const) {
      for (const slot of ["kr-pre", "kr-post", "kr-mid", "us-pre", "us-post", "us-mid", "us-noon"] as const) {
        const draft = seedBriefing({ ...snapshot(slot), slot }, scope);
        const blob = [draft.headline, ...draft.bullets].join("\n");
        for (const frag of FORBIDDEN_SEED_VOICE_FRAGMENTS) {
          assert.equal(
            blob.includes(frag),
            false,
            `scope=${scope} slot=${slot} leaked "${frag}" in:\n${blob}`,
          );
        }
        assert.equal(briefingHasForbiddenSeedVoice(draft), false);
        assert.ok(draft.bullets.length >= 3);
      }
    }
  });

  it("includes index and earnings fact anchors for kr-post", () => {
    const draft = seedBriefing(snapshot("kr-post"), "kr");
    const blob = draft.bullets.join("\n");
    assert.match(blob, /코스피/);
    assert.match(blob, /-0\.60%/);
    assert.match(blob, /NAVER/);
    assert.match(blob, /3\.4조원/);
    assert.equal(containsForbiddenSeedVoice("같이 움직이면 원인 후보다"), true);
  });

  it("seedDecision also avoids classic template fragments", () => {
    const decision = seedDecision(snapshot("kr-post"), "kr");
    const blob = decision.scenarios
      .flatMap((s) => [s.title, s.summary, s.implication])
      .join("\n");
    for (const frag of ["같이 움직이면", "흔들림 원인 후보", "가늠하는 때"] as const) {
      assert.equal(blob.includes(frag), false, `decision leaked "${frag}"`);
    }
  });
});
