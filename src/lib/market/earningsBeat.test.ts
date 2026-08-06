import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSurprisePct,
  isConsensusLikelyRolledForward,
  parseFiniteNumber,
  resolveEarningsBeat,
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
  it("labels clear beat and miss", () => {
    const beat = resolveEarningsBeat({ epsActual: 39.25, epsEstimate: 34.515 });
    assert.equal(beat.reason, "ok");
    assert.equal(beat.beatLabel, "서프라이즈");
    assert.ok(beat.surprisePct != null && beat.surprisePct > 0);

    const miss = resolveEarningsBeat({ epsActual: 1.0, epsEstimate: 1.5 });
    assert.equal(miss.reason, "ok");
    assert.equal(miss.beatLabel, "미스");
    assert.ok(miss.surprisePct != null && miss.surprisePct < 0);
  });

  it("omits label when estimate missing or equal", () => {
    assert.equal(
      resolveEarningsBeat({ epsActual: 1, epsEstimate: null }).reason,
      "missing",
    );
    assert.equal(
      resolveEarningsBeat({ epsActual: 2.0, epsEstimate: 2.0 }).reason,
      "inline",
    );
    assert.equal(
      resolveEarningsBeat({ epsActual: 2.0, epsEstimate: 2.0 }).beatLabel,
      undefined,
    );
  });

  it("omits when Yahoo surprisePct sign conflicts with actual vs estimate", () => {
    const r = resolveEarningsBeat({
      epsActual: 1.0,
      epsEstimate: 2.0,
      yahooSurprisePct: 10,
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

  it("allows beat when rolled calendar is not used as altEstimate", () => {
    const r = resolveEarningsBeat({
      epsActual: 39.25,
      epsEstimate: 34.515,
      yahooSurprisePct: 13.72,
      // Caller must omit alt when isConsensusLikelyRolledForward
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
