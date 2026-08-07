import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  epsDisplayLabel,
  formatEps,
  formatRevenue,
  operatingProfitDisplayLabel,
  revenueDisplayLabel,
} from "./earningsFormat";

describe("formatRevenue", () => {
  it("formats KR Naver-scale revenue in 조원 (Event UI unit)", () => {
    assert.equal(formatRevenue(3_380_004_220_000, "KR"), "약 3.4조원");
  });

  it("formats mid KR revenue in 억원", () => {
    assert.equal(formatRevenue(250_000_000_000, "KR"), "약 2,500억원");
  });

  it("formats US mega-cap revenue in $B", () => {
    assert.equal(formatRevenue(98_784_000_000, "US"), "약 $98.8B");
  });

  it("formats smaller US revenue in $M", () => {
    assert.equal(formatRevenue(450_000_000, "US"), "약 $450M");
  });
});

describe("formatEps", () => {
  it("keeps KR EPS in 원/주당 — never 조", () => {
    assert.equal(formatEps(1842.4, "KR"), "약 1,842원");
  });

  it("formats US EPS in $", () => {
    assert.equal(formatEps(39.25, "US"), "약 $39.25");
  });
});

describe("revenueDisplayLabel / epsDisplayLabel / operatingProfitDisplayLabel", () => {
  it("prefers stored label over raw", () => {
    assert.equal(
      revenueDisplayLabel(
        { revenueAvg: 3_380_004_220_000, revenueLabel: "약 3.4조원" },
        "KR",
      ),
      "약 3.4조원",
    );
  });

  it("formats from raw when label missing", () => {
    assert.equal(
      revenueDisplayLabel({ revenueAvg: 3_380_004_220_000 }, "KR"),
      "약 3.4조원",
    );
    assert.equal(epsDisplayLabel({ epsAvg: 1842 }, "KR"), "약 1,842원");
  });

  it("formats operating profit in the same company-scale units as revenue", () => {
    assert.equal(
      operatingProfitDisplayLabel({ operatingProfitAvg: 566_200_000_000 }, "KR"),
      "약 5,662억원",
    );
    assert.equal(
      operatingProfitDisplayLabel(
        { operatingProfitAvg: 1, operatingProfitLabel: "약 5.7조원" },
        "KR",
      ),
      "약 5.7조원",
    );
  });
});
