import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PENDING_RESULT_ONELINER,
  applyAnnouncedEarningsStatus,
  contextNewsSuggestsPrinted,
  isEarningsAnnounced,
  isEarningsClockPast,
  isEarningsSameKstDay,
} from "./earningsAnnounced";
import type { MarketEvent } from "@/lib/types";

describe("contextNewsSuggestsPrinted", () => {
  it("detects KR post-print OP headlines", () => {
    assert.equal(
      contextNewsSuggestsPrinted([
        {
          title: "네이버, 2Q 영업익 5203억원…비용 증가에 '어닝 쇼크'",
          publisher: "네이트",
          publishedAt: "2026-08-07T00:06:00.000Z",
          snippet: "네이버, 2Q 영업익 5203억원…비용 증가에 '어닝 쇼크'",
        },
      ]),
      true,
    );
  });

  it("rejects preview-only headlines", () => {
    assert.equal(
      contextNewsSuggestsPrinted([
        {
          title: "네이버 실적 발표 예정…관전 포인트",
          publisher: "테스트",
          publishedAt: "2026-08-06T00:00:00.000Z",
          snippet: "네이버 실적 발표 예정…관전 포인트",
        },
      ]),
      false,
    );
  });
});

describe("applyAnnouncedEarningsStatus", () => {
  const base: MarketEvent = {
    id: "earnings-naver",
    dateLabel: "08.07 (금)",
    region: "KR",
    title: "NAVER 실적 발표",
    level: "high",
    oneLiner: "실적 발표 예정",
    kind: "earnings",
    symbol: "035420.KS",
    dateISO: "2026-08-07T06:00:00.000Z",
  };

  it("keeps 예정 before clock when news is preview-only", () => {
    const now = new Date("2026-08-07T01:00:00.000Z"); // before 06:00Z
    const out = applyAnnouncedEarningsStatus(
      [
        {
          ...base,
          contextNews: [
            {
              title: "네이버 실적 발표 예정 점검",
              publisher: "x",
              publishedAt: "2026-08-06T12:00:00.000Z",
              snippet: "네이버 실적 발표 예정 점검",
            },
          ],
        },
      ],
      now,
    );
    assert.equal(out[0]!.oneLiner, "실적 발표 예정");
    assert.equal(isEarningsSameKstDay(base.dateISO!, now), true);
    assert.equal(isEarningsClockPast(base.dateISO!, now), false);
  });

  it("flips to pending when same-day news already reports OP", () => {
    const now = new Date("2026-08-07T01:00:00.000Z"); // before Yahoo stamp
    const out = applyAnnouncedEarningsStatus(
      [
        {
          ...base,
          contextNews: [
            {
              title: "네이버 2분기 실적발표…영업익 5,203억원 전년동기비 0.2% 감소",
              publisher: "IT비즈뉴스",
              publishedAt: "2026-08-07T00:00:00.000Z",
              snippet: "네이버 2분기 실적발표…영업익 5,203억원 전년동기비 0.2% 감소",
            },
          ],
        },
      ],
      now,
    );
    assert.equal(out[0]!.oneLiner, PENDING_RESULT_ONELINER);
    assert.equal(isEarningsAnnounced(out[0]!, now), true);
  });

  it("flips to pending after clock even without news", () => {
    const now = new Date("2026-08-07T07:00:00.000Z");
    const out = applyAnnouncedEarningsStatus([{ ...base }], now);
    assert.equal(out[0]!.oneLiner, PENDING_RESULT_ONELINER);
  });

  it("does not invent numbers when structured actual already present", () => {
    const now = new Date("2026-08-07T07:00:00.000Z");
    const out = applyAnnouncedEarningsStatus(
      [
        {
          ...base,
          oneLiner: "발표됨 · 주당순이익(EPS) 3,000원 vs 예상 3,700원",
          actual: { epsActual: 3000, epsEstimate: 3700 },
        },
      ],
      now,
    );
    assert.match(out[0]!.oneLiner, /주당순이익/);
  });
});
