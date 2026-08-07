import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eventResultComment,
  isClearlyPostResultOneLiner,
} from "@/lib/events/upcomingRetention";
import type { MarketEvent } from "@/lib/types";

const base: MarketEvent = {
  id: "earnings-naver",
  dateLabel: "08.07 (금)",
  region: "KR",
  title: "NAVER 실적 발표",
  level: "high",
  oneLiner: "시장 예상 매출 약 3.4조원 · 영업이익 약 5,662억원",
  kind: "earnings",
  dateISO: "2026-08-07T06:00:00.000Z",
};

describe("isClearlyPostResultOneLiner", () => {
  it("rejects pre-report consensus copy even with 매출/영업이익", () => {
    assert.equal(
      isClearlyPostResultOneLiner("시장 예상 매출 약 3.4조원 · 영업이익 약 5,662억원"),
      false,
    );
  });

  it("accepts 발표됨 / pending / EPS fact lines", () => {
    assert.equal(isClearlyPostResultOneLiner("발표됨 · 영업이익 약 5,203억원"), true);
    assert.equal(isClearlyPostResultOneLiner("발표됨 · 결과 집계 대기"), true);
    assert.equal(
      isClearlyPostResultOneLiner("발표됨 · 주당순이익(EPS) 3,800원 vs 예상 3,735원"),
      true,
    );
  });
});

describe("eventResultComment", () => {
  it("does not surface pre-report 시장 예상 as result when actual exists", () => {
    const event: MarketEvent = {
      ...base,
      oneLiner: "시장 예상 매출 약 3.4조원 · 영업이익 약 5,662억원",
      actual: {
        operatingProfitActual: 520_300_000_000,
        operatingProfitActualLabel: "약 5,203억원",
        revenueActualLabel: "약 3.4조원",
      },
    };
    const line = eventResultComment(event);
    assert.ok(line);
    assert.match(line!, /발표됨|5,203/);
    assert.doesNotMatch(line!, /시장\s*예상/);
  });

  it("reuses clearly post oneLiner", () => {
    const event: MarketEvent = {
      ...base,
      oneLiner: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
      actual: {
        operatingProfitActualLabel: "약 5,203억원",
        revenueActualLabel: "약 3.4조원",
      },
    };
    assert.equal(
      eventResultComment(event),
      "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
    );
  });
});
