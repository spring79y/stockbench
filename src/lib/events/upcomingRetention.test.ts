import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addKstCalendarDays,
  eventResultComment,
  isClearlyPostResultOneLiner,
  shouldRetainUpcomingEvent,
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

/** Build a Date for a Seoul wall-clock time (KST = UTC+9). */
function kst(ymd: string, hour = 12, minute = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9, minute, 0));
}

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

describe("shouldRetainUpcomingEvent (D-day+1)", () => {
  const cpi: Pick<MarketEvent, "dateISO" | "dateLabel"> = {
    dateLabel: "08.12 (수)",
    dateISO: "2026-08-12T08:30:00-04:00",
  };

  it("keeps event on D-day", () => {
    assert.equal(shouldRetainUpcomingEvent(cpi, kst("2026-08-12", 20)), true);
  });

  it("keeps event on D-day + 1", () => {
    assert.equal(shouldRetainUpcomingEvent(cpi, kst("2026-08-13", 9)), true);
  });

  it("drops event on D-day + 2", () => {
    assert.equal(shouldRetainUpcomingEvent(cpi, kst("2026-08-14", 9)), false);
  });

  it("addKstCalendarDays crosses months", () => {
    assert.equal(addKstCalendarDays("2026-08-31", 1), "2026-09-01");
    assert.equal(addKstCalendarDays("2026-08-13", -1), "2026-08-12");
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

  it("shows result line for past-announce macro on D-day+1", () => {
    const event: MarketEvent = {
      id: "cpi",
      dateLabel: "08.12 (수)",
      dateISO: "2026-08-12T08:30:00-04:00",
      region: "US",
      title: "미국 소비자물가 (CPI)",
      level: "high",
      oneLiner: "물가 지표 — 금리 인하 기대를 흔드는 핵심 숫자",
      kind: "macro",
    };
    const line = eventResultComment(event, kst("2026-08-13", 9));
    assert.ok(line);
    assert.match(line!, /발표됨|결과/);
  });

  it("prefers enriched macro print oneLiner", () => {
    const event: MarketEvent = {
      id: "cpi",
      dateLabel: "08.12 (수)",
      dateISO: "2026-08-12T08:30:00-04:00",
      region: "US",
      title: "미국 소비자물가 (CPI)",
      level: "high",
      oneLiner: "발표됨 · CPI 전년비 2.7% · 근원 CPI 전년비 2.9%",
      kind: "macro",
    };
    assert.equal(
      eventResultComment(event, kst("2026-08-13", 9)),
      "발표됨 · CPI 전년비 2.7% · 근원 CPI 전년비 2.9%",
    );
  });
});
