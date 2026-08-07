import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PENDING_RESULT_ONELINER } from "@/lib/market/earningsAnnounced";
import { mergePublishedEarningsEvidence } from "@/lib/events/mergePublishedEarnings";
import type { MarketEvent } from "@/lib/types";

const liveBase: MarketEvent = {
  id: "earnings-naver",
  dateLabel: "08.07 (금)",
  region: "KR",
  title: "NAVER 실적 발표",
  level: "high",
  oneLiner: "시장 예상 매출 약 3.4조원 · 영업이익 약 5,662억원",
  kind: "earnings",
  symbol: "035420.KS",
  dateISO: "2026-08-07T06:00:00.000Z",
  consensus: {
    revenueLabel: "약 3.4조원",
    operatingProfitLabel: "약 5,662억원",
  },
};

describe("mergePublishedEarningsEvidence", () => {
  it("overlays contextNews from published and flips pending when news printed", () => {
    const now = new Date("2026-08-07T01:00:00.000Z");
    const published: MarketEvent[] = [
      {
        ...liveBase,
        oneLiner: "시장 예상 매출 약 3.4조원 · 영업이익 약 5,662억원",
        contextNews: [
          {
            title: "[IT] 네이버, 2분기 실적 발표…엔비디아와 AI 팩토리",
            publisher: "굿모닝",
            publishedAt: "2026-08-07T03:29:43.000Z",
            snippet: "[IT] 네이버, 2분기 실적 발표…엔비디아와 AI 팩토리",
          },
        ],
      },
    ];
    const out = mergePublishedEarningsEvidence([liveBase], published, now);
    assert.equal(out[0]!.contextNews?.length, 1);
    assert.equal(out[0]!.oneLiner, PENDING_RESULT_ONELINER);
  });

  it("keeps live structured actual over published pending", () => {
    const now = new Date("2026-08-07T07:00:00.000Z");
    const live: MarketEvent = {
      ...liveBase,
      oneLiner: "발표됨 · 영업이익 약 5,203억원",
      actual: {
        operatingProfitActual: 520_300_000_000,
        operatingProfitActualLabel: "약 5,203억원",
      },
    };
    const published: MarketEvent[] = [
      {
        ...liveBase,
        oneLiner: PENDING_RESULT_ONELINER,
        contextNews: [
          {
            title: "네이버 2분기 실적 발표…",
            publisher: "x",
            publishedAt: "2026-08-07T03:00:00.000Z",
            snippet: "네이버 2분기 실적 발표…",
          },
        ],
      },
    ];
    const out = mergePublishedEarningsEvidence([live], published, now);
    assert.match(out[0]!.oneLiner, /5,203/);
    assert.equal(out[0]!.contextNews?.length, 1);
    assert.equal(out[0]!.actual?.operatingProfitActualLabel, "약 5,203억원");
  });

  it("field-merges published OP/매출 onto live EPS-only actual", () => {
    const now = new Date("2026-08-07T07:00:00.000Z");
    const live: MarketEvent = {
      ...liveBase,
      oneLiner: "발표됨 · 주당순이익(EPS) 3,800원 vs 예상 3,735원",
      consensus: {
        epsLabel: "약 3,735원",
        revenueLabel: "약 3.4조원",
        sources: ["yahoo"],
      },
      actual: {
        epsActual: 3800,
        epsEstimate: 3735,
      },
    };
    const published: MarketEvent[] = [
      {
        ...liveBase,
        oneLiner: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
        consensus: {
          revenueLabel: "약 3.4조원",
          operatingProfitLabel: "약 5,662억원",
          sources: ["yahoo", "naver"],
        },
        actual: {
          operatingProfitActual: 520_300_000_000,
          operatingProfitActualLabel: "약 5,203억원",
          revenueActual: 3_388_800_000_000,
          revenueActualLabel: "약 3.4조원",
        },
      },
    ];
    const out = mergePublishedEarningsEvidence([live], published, now);
    assert.equal(out[0]!.actual?.epsActual, 3800);
    assert.equal(out[0]!.actual?.operatingProfitActualLabel, "약 5,203억원");
    assert.equal(out[0]!.actual?.revenueActualLabel, "약 3.4조원");
    assert.equal(out[0]!.consensus?.operatingProfitLabel, "약 5,662억원");
    assert.match(out[0]!.oneLiner, /5,203/);
    assert.match(out[0]!.oneLiner, /EPS|주당순이익/);
  });

  it("rebuilds post oneLiner when live stays pre-report but published has actual", () => {
    const now = new Date("2026-08-07T07:00:00.000Z");
    const live: MarketEvent = {
      ...liveBase,
      oneLiner: "시장 예상 매출 약 3.4조원 · 영업이익 약 5,662억원",
    };
    const published: MarketEvent[] = [
      {
        ...liveBase,
        oneLiner: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
        actual: {
          operatingProfitActual: 520_300_000_000,
          operatingProfitActualLabel: "약 5,203억원",
          revenueActual: 3_388_800_000_000,
          revenueActualLabel: "약 3.4조원",
        },
      },
    ];
    const out = mergePublishedEarningsEvidence([live], published, now);
    assert.match(out[0]!.oneLiner, /발표됨/);
    assert.match(out[0]!.oneLiner, /5,203/);
    assert.doesNotMatch(out[0]!.oneLiner, /시장\s*예상/);
  });
});
