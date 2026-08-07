import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUserEarningsBullet } from "./userFacingCopy";
import type { MarketEvent } from "@/lib/types";

describe("formatUserEarningsBullet", () => {
  it("builds NAVER fact + news so-what without meta", () => {
    const ev: MarketEvent = {
      id: "earnings-naver",
      dateLabel: "오늘",
      region: "KR",
      title: "NAVER 실적 발표",
      level: "high",
      oneLiner: "발표됨 · 매출 약 3.4조원 · 영업이익 약 5,203억원",
      kind: "earnings",
      symbol: "035420.KS",
      megaCapId: "naver",
      dateISO: new Date().toISOString(),
      consensus: {
        isEstimate: true,
        revenueAvg: 3_365_900_000_000,
        revenueLabel: "약 3.4조원",
        operatingProfitAvg: 566_200_000_000,
        operatingProfitLabel: "약 5,662억원",
        sources: ["naver"],
      },
      actual: {
        operatingProfitActual: 520_300_000_000,
        operatingProfitActualLabel: "약 5,203억원",
        revenueActual: 3_388_800_000_000,
        revenueActualLabel: "약 3.4조원",
      },
      contextNews: [
        {
          title: "‘AI·비용 절감’ 통했다…네이버·카카오, 상반기 실적 승승장구",
          publisher: "test",
          publishedAt: new Date().toISOString(),
          snippet: "네이버-카카오 2Q…영업이익은 '희비'",
        },
      ],
    };
    const line = formatUserEarningsBullet(ev);
    assert.match(line, /매출 약 3\.4조원/);
    assert.match(line, /5,203/);
    assert.match(line, /시장 예상 하회/);
    assert.match(line, /뉴스상/);
    assert.match(line, /AI/);
    assert.equal(/Evidence|방향\s*예측\s*금지|가이던스\s*점검/.test(line), false);
  });
});
