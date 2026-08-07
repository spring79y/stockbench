import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSurprisePct,
  isConsensusLikelyRolledForward,
  parseFiniteNumber,
  resolveEarningsBeat,
  earningsResultOneLiner,
} from "./earningsBeat";

describe("parseFiniteNumber", () => {
  it("parses numbers and numeric strings", () => {
    assert.equal(parseFiniteNumber(39.25), 39.25);
    assert.equal(parseFiniteNumber("34.515"), 34.515);
    assert.equal(parseFiniteNumber("13.72"), 13.72);
  });

  it("rejects nullish and non-finite", () => {
    assert.equal(parseFiniteNumber(null), undefined);
    assert.equal(parseFiniteNumber(undefined), undefined);
    assert.equal(parseFiniteNumber(""), undefined);
    assert.equal(parseFiniteNumber("x"), undefined);
    assert.equal(parseFiniteNumber(Number.NaN), undefined);
  });
});

describe("resolveEarningsBeat", () => {
  it("labels clear beat and miss only with dual-source altEstimate", () => {
    const beat = resolveEarningsBeat({
      epsActual: 39.25,
      epsEstimate: 34.515,
      altEstimate: 34.5,
    });
    assert.equal(beat.reason, "ok");
    assert.equal(beat.beatLabel, "서프라이즈");
    assert.ok(beat.surprisePct != null && beat.surprisePct > 0);

    const miss = resolveEarningsBeat({
      epsActual: 1.0,
      epsEstimate: 1.5,
      altEstimate: 1.5,
    });
    assert.equal(miss.reason, "ok");
    assert.equal(miss.beatLabel, "미스");
    assert.ok(miss.surprisePct != null && miss.surprisePct < 0);
  });

  it("omits label when estimate missing or equal", () => {
    assert.equal(
      resolveEarningsBeat({ epsActual: 1, epsEstimate: null, altEstimate: 1 }).reason,
      "missing",
    );
    assert.equal(
      resolveEarningsBeat({ epsActual: 2.0, epsEstimate: 2.0, altEstimate: 2.0 }).reason,
      "inline",
    );
    assert.equal(
      resolveEarningsBeat({ epsActual: 2.0, epsEstimate: 2.0, altEstimate: 2.0 }).beatLabel,
      undefined,
    );
  });

  it("omits when Yahoo surprisePct sign conflicts with actual vs estimate", () => {
    const r = resolveEarningsBeat({
      epsActual: 1.0,
      epsEstimate: 2.0,
      yahooSurprisePct: 10,
      altEstimate: 2.0,
    });
    assert.equal(r.reason, "sign-conflict");
    assert.equal(r.beatLabel, undefined);
  });

  it("omits when same-quarter alt estimate flips polarity (Sandisk-style conflict)", () => {
    // Quarterly says beat vs 34.5; unrerolled calendar 44 would say miss.
    const r = resolveEarningsBeat({
      epsActual: 39.25,
      epsEstimate: 34.515,
      yahooSurprisePct: 13.72,
      altEstimate: 44.20733,
    });
    assert.equal(r.reason, "estimate-conflict");
    assert.equal(r.beatLabel, undefined);
  });

  it("omits when only Yahoo quarterly (thin source / Sandisk post-roll)", () => {
    // After fa5c81a rolled-calendar strip: alt omitted → must not ship 서프라이즈.
    // Market narrative was guidance soft (하회) while Yahoo EPS printed beat.
    const r = resolveEarningsBeat({
      epsActual: 39.25,
      epsEstimate: 34.515,
      yahooSurprisePct: 13.72,
    });
    assert.equal(r.reason, "thin-source");
    assert.equal(r.beatLabel, undefined);
    assert.equal(r.surprisePct, undefined);
  });

  it("allows beat when same-quarter calendar confirms quarterly estimate", () => {
    const r = resolveEarningsBeat({
      epsActual: 39.25,
      epsEstimate: 34.515,
      yahooSurprisePct: 13.72,
      altEstimate: 34.515,
    });
    assert.equal(r.reason, "ok");
    assert.equal(r.beatLabel, "서프라이즈");
  });
});

describe("isConsensusLikelyRolledForward", () => {
  it("detects Sandisk post-print calendar = next-quarter estimate", () => {
    assert.equal(
      isConsensusLikelyRolledForward({
        calendarEpsAvg: 44.20733,
        currentQuarterEstimate: 44.20733,
        reportedQuarterEstimate: 34.515,
      }),
      true,
    );
  });

  it("does not flag when calendar still matches reported estimate", () => {
    assert.equal(
      isConsensusLikelyRolledForward({
        calendarEpsAvg: 34.5,
        currentQuarterEstimate: 44.2,
        reportedQuarterEstimate: 34.515,
      }),
      false,
    );
  });
});

describe("computeSurprisePct", () => {
  it("computes signed percent", () => {
    const pct = computeSurprisePct(39.25, 34.515);
    assert.ok(pct != null);
    assert.ok(Math.abs(pct - 13.72) < 0.05);
  });
});

describe("earningsResultOneLiner", () => {
  it("uses 결과 미확인 when label and numbers omitted", () => {
    assert.match(earningsResultOneLiner(undefined), /결과 미확인/);
    assert.doesNotMatch(earningsResultOneLiner(undefined), /서프라이즈|미스|판정\s*보류/);
  });

  it("includes EPS numbers when provided without beatLabel (facts only)", () => {
    const line = earningsResultOneLiner(undefined, {
      epsActual: 39.25,
      epsEstimate: 34.515,
      region: "US",
    });
    assert.match(line, /\$39\.25/);
    assert.match(line, /\$34\.52|\$34\.515/);
    assert.doesNotMatch(line, /판정\s*보류|서프라이즈|미스/);
  });

  it("names beatLabel when present", () => {
    assert.match(earningsResultOneLiner("서프라이즈"), /서프라이즈/);
    assert.doesNotMatch(earningsResultOneLiner("서프라이즈"), /판정\s*보류/);
  });

  it("prefers company-scale actual line when provided", () => {
    const line = earningsResultOneLiner(undefined, {
      companyScaleActualLine: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
      epsActual: 3000,
      epsEstimate: 3700,
      region: "KR",
    });
    assert.match(line, /영업이익/);
    assert.match(line, /주당순이익/);
    assert.doesNotMatch(line, /서프라이즈|미스/);
  });
});
