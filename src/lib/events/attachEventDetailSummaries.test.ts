import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachEventDetailSummaries,
  buildEventDetailSummary,
} from "@/lib/events/attachEventDetailSummaries";
import type { MarketEvent } from "@/lib/types";

describe("buildEventDetailSummary", () => {
  it("fills pre fields for earnings without inventing results", () => {
    const event: MarketEvent = {
      id: "earnings-x",
      dateLabel: "08.10 (월)",
      region: "KR",
      title: "테스트 실적 발표",
      level: "high",
      oneLiner: "시장 예상 매출 약 1조원 · 영업이익 약 1,000억원",
      kind: "earnings",
      dateISO: "2026-08-10T06:00:00.000Z",
      consensus: {
        revenueLabel: "약 1조원",
        operatingProfitLabel: "약 1,000억원",
      },
    };
    const s = buildEventDetailSummary(event, new Date("2026-08-01T00:00:00.000Z"));
    assert.match(s.expectation ?? "", /시장 예상/);
    assert.ok(s.meaning);
    assert.equal(s.result, undefined);
    assert.equal(s.reaction, undefined);
  });

  it("posts result + news reaction; implication only with Evidence", () => {
    const now = new Date("2026-08-07T07:00:00.000Z");
    const event: MarketEvent = {
      id: "earnings-naver",
      dateLabel: "08.07 (금)",
      region: "KR",
      title: "NAVER 실적 발표",
      level: "high",
      oneLiner: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
      kind: "earnings",
      dateISO: "2026-08-07T06:00:00.000Z",
      consensus: {
        revenueLabel: "약 3.4조원",
        operatingProfitLabel: "약 5,662억원",
      },
      actual: {
        operatingProfitActualLabel: "약 5,203억원",
        revenueActualLabel: "약 3.4조원",
        operatingProfitActual: 520_300_000_000,
      },
      contextNews: [
        {
          title: "매출은 뛰고 이익은 멈췄다···네이버, 2분기 실적 '명암'",
          publisher: "뉴스",
          publishedAt: "2026-08-07T03:28:10.000Z",
          snippet: "매출은 뛰고 이익은 멈췄다···네이버, 2분기 실적 '명암'",
        },
        {
          title: "네이버, 2분기 실적 발표…AI 팩토리",
          publisher: "x",
          publishedAt: "2026-08-07T03:29:00.000Z",
          snippet: "네이버, 2분기 실적 발표…AI 팩토리",
        },
      ],
    };
    const s = buildEventDetailSummary(event, now);
    assert.match(s.result ?? "", /5,203/);
    assert.ok(s.reaction);
    assert.ok((s.reaction!.split("\n").length) <= 2);
    assert.ok(s.implication);
    assert.doesNotMatch(s.implication!, /매수|매도/);
  });

  it("uses 반응 근거 부족 when post without news", () => {
    const now = new Date("2026-08-07T07:00:00.000Z");
    const event: MarketEvent = {
      id: "earnings-x",
      dateLabel: "08.07 (금)",
      region: "US",
      title: "X 실적 발표",
      level: "high",
      oneLiner: "발표됨 · 결과 집계 대기",
      kind: "earnings",
      dateISO: "2026-08-07T06:00:00.000Z",
    };
    const s = buildEventDetailSummary(event, now);
    assert.equal(s.reaction, "반응 근거 부족");
    assert.equal(s.implication, undefined);
  });

  it("templates macro meaning", () => {
    const event: MarketEvent = {
      id: "nfp",
      dateLabel: "08.07 (금)",
      region: "US",
      title: "미국 고용보고서 (NFP)",
      level: "high",
      oneLiner: "일자리 성적표 — 금리 기대와 달러·미 지수에 영향",
      kind: "macro",
      dateISO: "2026-08-07T12:30:00-04:00",
    };
    const [out] = attachEventDetailSummaries([event]);
    assert.match(out!.detailSummary?.meaning ?? "", /고용/);
    assert.equal(out!.detailSummary?.expectation, event.oneLiner);
  });
});
