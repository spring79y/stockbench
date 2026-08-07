import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fiscalQuarterEndKeyFromEarningsDate,
  normalizeNaverPeriodKey,
  parseNaverOpConsensus,
} from "./fetchNaverOpConsensus";

describe("normalizeNaverPeriodKey", () => {
  it("normalizes KR YYYYMM and dotted keys", () => {
    assert.equal(normalizeNaverPeriodKey("202606"), "202606");
    assert.equal(normalizeNaverPeriodKey("2026.06."), "202606");
    assert.equal(normalizeNaverPeriodKey("2026.06.27"), "202606");
  });
});

describe("fiscalQuarterEndKeyFromEarningsDate", () => {
  it("maps announce dates to prior fiscal quarter end", () => {
    // NAVER-style early Aug announce → June quarter
    assert.equal(fiscalQuarterEndKeyFromEarningsDate("2026-08-07T06:00:00.000Z"), "202606");
    // Late Jul → June quarter
    assert.equal(fiscalQuarterEndKeyFromEarningsDate("2026-07-30T06:00:00.000Z"), "202606");
    // Late Oct → September quarter
    assert.equal(fiscalQuarterEndKeyFromEarningsDate("2026-10-28T06:00:00.000Z"), "202609");
  });
});

const sampleKrQuarter = {
  financeInfo: {
    trTitleList: [
      { isConsensus: "N", title: "2026.03.", key: "202603" },
      { isConsensus: "Y", title: "2026.06.", key: "202606" },
    ],
    rowList: [
      {
        title: "매출액",
        columns: {
          "202603": { value: "32,411", cx: null },
          "202606": { value: "33,659", cx: null },
        },
      },
      {
        title: "영업이익",
        columns: {
          "202603": { value: "5,418", cx: null },
          "202606": { value: "5,662", cx: null },
        },
      },
    ],
  },
};

describe("parseNaverOpConsensus", () => {
  it("parses matched KR consensus OP+revenue in 원 (억원×1e8)", () => {
    const hit = parseNaverOpConsensus(sampleKrQuarter, {
      expectedPeriodKey: "202606",
      region: "KR",
    });
    assert.ok(hit);
    assert.equal(hit!.periodKey, "202606");
    assert.equal(hit!.source, "naver");
    assert.equal(hit!.operatingProfitAvg, 5_662 * 100_000_000);
    assert.equal(hit!.revenueAvg, 33_659 * 100_000_000);
  });

  it("omits when quarter does not match (no invent)", () => {
    assert.equal(
      parseNaverOpConsensus(sampleKrQuarter, {
        expectedPeriodKey: "202609",
        region: "KR",
      }),
      null,
    );
  });

  it("parses negative OP via cx=minus", () => {
    const payload = {
      financeInfo: {
        trTitleList: [{ isConsensus: "Y", title: "2026.06.", key: "202606" }],
        rowList: [
          {
            title: "영업이익",
            columns: { "202606": { value: "356", cx: "minus" } },
          },
        ],
      },
    };
    const hit = parseNaverOpConsensus(payload, {
      expectedPeriodKey: "202606",
      region: "KR",
    });
    assert.ok(hit);
    assert.equal(hit!.operatingProfitAvg, -356 * 100_000_000);
  });

  it("does not use EBIT as operating profit", () => {
    const payload = {
      unit: "USD(백만). %, 배 생략",
      financeInfo: {
        trTitleList: [{ isConsensus: "Y", title: "2026.06.27", key: "2026.06.27" }],
        rowList: [
          {
            title: "EBIT",
            columns: { "2026.06.27": { value: "12,345", cx: null } },
          },
        ],
      },
    };
    assert.equal(
      parseNaverOpConsensus(payload, {
        expectedPeriodKey: "202606",
        region: "US",
      }),
      null,
    );
  });

  it("omits dash / empty OP values", () => {
    const payload = {
      financeInfo: {
        trTitleList: [{ isConsensus: "Y", title: "2026.06.", key: "202606" }],
        rowList: [
          {
            title: "영업이익",
            columns: { "202606": { value: "-", cx: null } },
          },
        ],
      },
    };
    assert.equal(
      parseNaverOpConsensus(payload, {
        expectedPeriodKey: "202606",
        region: "KR",
      }),
      null,
    );
  });
});
