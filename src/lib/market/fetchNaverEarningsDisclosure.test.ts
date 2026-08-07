import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isConsolidatedEarningsDisclosureTitle,
  isPlausibleVsConsensus,
  parseNaverEarningsDisclosureActual,
  periodKeyFromDisclosureText,
  rankEarningsDisclosureCandidates,
  resetDisclosureSoftFailCounts,
} from "./fetchNaverEarningsDisclosure";

const CONSOLIDATED_HTML = `
<div class="xforms">
  <span>연결재무제표 기준 영업(잠정)실적(공정공시)</span>
  <span>당기실적 2026-04-01 ~ 2026-06-30</span>
  <span>단위 : 억원, %</span>
  <td><span>매출액</span></td>
  <td><span>당해실적</span></td>
  <td><span class="xforms_input">33,888</span></td>
  <td><span class="xforms_input">32,411</span></td>
  <td><span>영업이익</span></td>
  <td><span>당해실적</span></td>
  <td><span class="xforms_input">5,203</span></td>
  <td><span class="xforms_input">5,418</span></td>
</div>
`;

describe("periodKeyFromDisclosureText", () => {
  it("reads 당기실적 end date as YYYYMM", () => {
    assert.equal(
      periodKeyFromDisclosureText(
        "당기실적 2026-04-01 ~ 2026-06-30 전기실적 2026-01-01 ~ 2026-03-31",
      ),
      "202606",
    );
  });
});

describe("isPlausibleVsConsensus", () => {
  it("accepts same order of magnitude", () => {
    assert.equal(isPlausibleVsConsensus(520_300_000_000, 566_200_000_000), true);
  });
  it("rejects wild unit mix-ups", () => {
    assert.equal(isPlausibleVsConsensus(5_203, 566_200_000_000), false);
    assert.equal(isPlausibleVsConsensus(52_030_000_000_000, 566_200_000_000), false);
  });
});

describe("isConsolidatedEarningsDisclosureTitle", () => {
  it("accepts looser 연결 variants and rejects 별도", () => {
    assert.equal(
      isConsolidatedEarningsDisclosureTitle(
        "네이버(주) 연결재무제표기준영업(잠정)실적(공정공시)",
      ),
      true,
    );
    assert.equal(
      isConsolidatedEarningsDisclosureTitle("삼성전자 연결재무제표 잠정실적(공정공시)"),
      true,
    );
    assert.equal(
      isConsolidatedEarningsDisclosureTitle("네이버(주) 영업(잠정)실적(공정공시)"),
      false,
    );
    assert.equal(
      isConsolidatedEarningsDisclosureTitle("별도재무제표기준 영업(잠정)실적(공정공시)"),
      false,
    );
  });
});

describe("parseNaverEarningsDisclosureActual", () => {
  const consensus = {
    operatingProfitAvg: 5_662 * 100_000_000,
    revenueAvg: 33_659 * 100_000_000,
  };

  it("parses 연결 잠정실적 매출+영업이익 in 원", () => {
    const hit = parseNaverEarningsDisclosureActual(CONSOLIDATED_HTML, {
      expectedPeriodKey: "202606",
      consensus,
    });
    assert.ok(hit);
    assert.equal(hit!.periodKey, "202606");
    assert.equal(hit!.operatingProfitAvg, 5_203 * 100_000_000);
    assert.equal(hit!.revenueAvg, 33_888 * 100_000_000);
  });

  it("omits when period key mismatches", () => {
    assert.equal(
      parseNaverEarningsDisclosureActual(CONSOLIDATED_HTML, {
        expectedPeriodKey: "202603",
        consensus,
      }),
      null,
    );
  });

  it("omits when only one of 매출/영업이익 present", () => {
    const html = CONSOLIDATED_HTML.replace(/영업이익[\s\S]*$/, "");
    assert.equal(
      parseNaverEarningsDisclosureActual(html, {
        expectedPeriodKey: "202606",
        consensus,
      }),
      null,
    );
  });

  it("omits when magnitude vs consensus fails (별도-scale mix-up)", () => {
    // Separate-statement scale vs consolidated consensus
    const html = CONSOLIDATED_HTML.replace("33,888", "19,292").replace("5,203", "4,390");
    assert.equal(
      parseNaverEarningsDisclosureActual(html, {
        expectedPeriodKey: "202606",
        consensus: {
          operatingProfitAvg: 50_000 * 100_000_000, // ~10× → reject
          revenueAvg: 33_659 * 100_000_000,
        },
      }),
      null,
    );
  });

  it("omits without 억원 unit marker", () => {
    const html = CONSOLIDATED_HTML.replace("단위 : 억원, %", "단위 : 백만원, %");
    assert.equal(
      parseNaverEarningsDisclosureActual(html, {
        expectedPeriodKey: "202606",
        consensus,
      }),
      null,
    );
  });
});

describe("rankEarningsDisclosureCandidates", () => {
  it("keeps only 연결재무제표 on earnings KST day (별도 제외)", () => {
    resetDisclosureSoftFailCounts();
    const ranked = rankEarningsDisclosureCandidates(
      [
        {
          disclosureId: 1,
          title: "네이버(주) 영업(잠정)실적(공정공시)",
          datetime: "2026-08-07T08:10:28",
        },
        {
          disclosureId: 2,
          title: "네이버(주) 연결재무제표기준영업(잠정)실적(공정공시)",
          datetime: "2026-08-07T08:09:41",
        },
        {
          disclosureId: 3,
          title: "네이버(주) 추가상장(주식매수선택권 행사)",
          datetime: "2026-08-06T06:51:58",
        },
      ],
      { earningsDateISO: "2026-08-07T06:00:00.000Z" },
    );
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.disclosureId, 2);
  });

  it("accepts 연결재무제표 잠정실적 without 영업 immediately before", () => {
    const ranked = rankEarningsDisclosureCandidates(
      [
        {
          disclosureId: 9,
          title: "삼성전자 연결재무제표 잠정실적(공정공시)",
          datetime: "2026-08-07T08:00:00",
        },
      ],
      { earningsDateISO: "2026-08-07T06:00:00.000Z" },
    );
    assert.equal(ranked.length, 1);
  });
});
