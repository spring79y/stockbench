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
    assert.match(s.meaning ?? "", /^점검 포인트는/);
    assert.doesNotMatch(s.meaning ?? "", /단정|매수|매도/);
    assert.equal(s.result, undefined);
    assert.equal(s.reaction, undefined);
  });

  it("posts fact→news reaction; never oneLiner · fragments", () => {
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
        operatingProfitAvg: 566_200_000_000,
        revenueAvg: 3_365_900_000_000,
      },
      actual: {
        operatingProfitActualLabel: "약 5,203억원",
        revenueActualLabel: "약 3.4조원",
        operatingProfitActual: 520_300_000_000,
        revenueActual: 3_388_800_000_000,
      },
      contextNews: [
        {
          title: "'AI 투자' 네이버, 2분기 이익 주춤…내년 'AI 팩토리' 실적 낸다",
          publisher: "뉴스",
          publishedAt: "2026-08-07T03:28:10.000Z",
          snippet: "'AI 투자' 네이버, 2분기 이익 주춤…내년 'AI 팩토리' 실적 낸다",
        },
        {
          title: "네이버 주가 급락…실적 후 반응",
          publisher: "x",
          publishedAt: "2026-08-07T03:29:00.000Z",
          snippet: "네이버 주가 급락…실적 후 반응",
        },
      ],
    };
    const s = buildEventDetailSummary(event, now);
    assert.match(s.result ?? "", /5,203/);
    assert.ok(s.reaction);
    assert.match(s.reaction!, /하회/);
    assert.match(s.reaction!, /뉴스에서는/);
    assert.match(s.reaction!, /AI|이익|주가/);
    assert.doesNotMatch(s.reaction!, /^발표됨$/m);
    assert.doesNotMatch(s.reaction!, /^매출 약/);
    assert.doesNotMatch(s.reaction!, /매수|매도|단정/);
    assert.doesNotMatch(s.reaction!, /\d+(\.\d+)?\s*%/);
    assert.ok((s.reaction!.split("\n").length) <= 2);
    assert.match(s.implication ?? "", /^점검 포인트는/);
    assert.doesNotMatch(s.implication!, /단정|매수|매도/);
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

  it("templates macro meaning as 점검 포인트", () => {
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
    assert.match(out!.detailSummary?.meaning ?? "", /^점검 포인트는/);
    assert.match(out!.detailSummary?.meaning ?? "", /고용/);
    assert.equal(out!.detailSummary?.expectation, event.oneLiner);
    assert.equal(out!.detailSummary?.reaction, undefined);
  });
});
