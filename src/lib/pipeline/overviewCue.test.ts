import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOverviewMarketCue,
  slimOverviewDecision,
} from "@/lib/pipeline/overviewCue";
import type { EditorialView } from "@/lib/pipeline/types";

const sample: EditorialView = {
  briefing: {
    headline: "풀 브리핑 헤드라인은 개요에 안 씀",
    bullets: ["a", "b", "c"],
    evidenceIds: ["x"],
  },
  scenarios: [
    {
      id: "base",
      label: "A · 기본",
      title: "낙폭 축소에 원화 강세 유지",
      summary: "긴 시나리오 본문",
      implication: "긴 함의",
    },
    {
      id: "risk",
      label: "B · 주의",
      title: "변동성 확대",
      summary: "리스크",
      implication: "경계",
    },
  ],
  checkItems: [
    { id: "c1", text: "원/달러 1,425원 상회 여부", why: "why1" },
    { id: "c2", text: "시총 상위 평균 -1% 이하 전환", why: "why2" },
    { id: "c3", text: "VIX 16 상회 여부", why: "why3" },
  ],
  publishedAt: "2026-08-07T05:10:16.647Z",
};

describe("overviewCue", () => {
  it("builds 1 cue + ≤2 checks from Decision", () => {
    const cue = buildOverviewMarketCue(sample);
    assert.ok(cue);
    assert.equal(cue!.cue, "오늘은 낙폭 축소에 원화 강세 유지만 보면 된다");
    assert.equal(cue!.checks.length, 2);
    assert.equal(cue!.checks[0]!.text, "원/달러 1,425원 상회 여부");
  });

  it("returns null when empty", () => {
    assert.equal(
      buildOverviewMarketCue({ scenarios: [], checkItems: [] }),
      null,
    );
  });

  it("slims to base title + ≤2 checks; briefing kept by slimBoard caller", () => {
    const slim = slimOverviewDecision(sample);
    assert.equal(slim.briefing.headline, "");
    assert.equal(slim.briefing.bullets.length, 0);
    assert.equal(slim.scenarios.length, 1);
    assert.equal(slim.scenarios[0]!.title, "낙폭 축소에 원화 강세 유지");
    assert.equal(slim.scenarios[0]!.summary, "");
    assert.equal(slim.checkItems.length, 2);
  });
});
