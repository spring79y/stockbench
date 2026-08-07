import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedBriefing } from "./seed";
import { buildThinEvidenceDrafts } from "./degradedPublish";
import { buildEarningsPatchBullet } from "./guard";
import {
  briefingHasPublishMeta,
  sanitizeBriefingDraft,
  sanitizeUserFacingText,
  textHasPublishMeta,
} from "./publishSanitize";
import type { BriefingDraft, CollectorSnapshot } from "./types";
import type { MarketEvent } from "@/lib/types";

describe("publishSanitize", () => {
  it("strips Evidence tails while keeping close facts", () => {
    const cleaned = sanitizeUserFacingText(
      "코스피 마감 하락 -0.60%, 코스닥 마감 하락 -0.36% — Evidence 세션 마감 사실.",
    );
    assert.match(cleaned, /코스피 마감 하락 -0\.60%/);
    assert.match(cleaned, /코스닥/);
    assert.equal(textHasPublishMeta(cleaned), false);
  });

  it("rewrites risk/earnings lecture meta into ant prose", () => {
    const risk = sanitizeUserFacingText(
      "지정학·공급 리스크 플래그(Evidence) — 유가($77.20)·환율·VIX와 흔들림 원인 후보로만 짧게.",
    );
    assert.equal(/Evidence|플래그\s*\(/.test(risk), false);
    assert.match(risk, /유가|\$77\.20/);

    const earn = sanitizeUserFacingText(
      "NAVER 실적 발표됨 · 매출 약 3.4조원 — Evidence뉴스 반응·가이던스 점검 (방향 예측 금지)",
    );
    assert.equal(/Evidence|예측\s*금지/.test(earn), false);
    assert.match(earn, /NAVER|3\.4조원/);
  });

  it("sanitizeBriefingDraft drops process-only lines", () => {
    const dirty: BriefingDraft = {
      headline: "코스피 마감 하락 -0.60%",
      bullets: [
        "코스피 마감 하락 -0.60% — Evidence 세션 마감 사실.",
        "짧게 연결합니다.",
        "유가($77)·VIX 점검 (방향 예측 금지)",
      ],
      evidenceIds: ["vix"],
    };
    const clean = sanitizeBriefingDraft(dirty);
    assert.equal(briefingHasPublishMeta(clean), false);
    assert.ok(clean.bullets.some((b) => /코스피/.test(b)));
    assert.equal(clean.bullets.some((b) => /^짧게\s*연결합니다/.test(b)), false);
  });

  it("seed and thin builders emit no publish meta", () => {
    const snapshot: CollectorSnapshot = {
      collectedAt: new Date().toISOString(),
      slot: "kr-post",
      indexes: [
        {
          id: "kospi",
          name: "코스피",
          shortName: "KOSPI",
          region: "KR",
          value: 6258,
          change: -37.6,
          changePercent: -0.6,
          status: "closed",
          changeBasis: "prior-close",
        },
      ],
      macros: [],
      temperature: "국내 약세",
      mood: "caution",
      moodLabel: "주의",
      asOfLabel: "test",
      events: [],
      evidence: {
        session: {
          slot: "kr-post",
          slotLabel: "한국 장후",
          collectedAt: new Date().toISOString(),
          asOfLabel: "test",
          focusHint: "post",
        },
        temperature: {
          label: "국내 약세",
          mood: "caution",
          moodLabel: "주의",
          krAvgPct: -0.6,
          usAvgPct: null,
          decouplingPct: 0,
          decouplingNote: "",
        },
        indexes: {
          kr: [
            {
              id: "kospi",
              name: "코스피",
              changePercent: -0.6,
              status: "closed",
              changeBasis: "prior-close",
              priorSessionChangePercent: -1,
            },
          ],
          us: [],
        },
        macros: [],
        flow: {
          status: "pending",
          asOfLabel: "",
          todaySummary: "",
          weekSummary: "",
          foreignStreakNote: "",
        },
        megaCaps: {
          summary: "",
          items: [],
          avgChangePct: null,
          dispersionPct: null,
          upCount: 0,
          downCount: 0,
          dispersionNote: "",
        },
        signals: { summary: "", ks200: "" },
        events: [],
        risk: {
          elevated: true,
          status: "live",
          summary: "oil",
          note: "",
          flags: ["geopolitics"],
          headlines: [],
        },
        previous: {
          slot: null,
          publishedAt: null,
          headlines: {},
          continuity: {},
        },
      },
    };
    const seed = seedBriefing(snapshot, "kr");
    const thin = buildThinEvidenceDrafts(snapshot, "kr").briefing;
    assert.equal(briefingHasPublishMeta(seed), false);
    assert.equal(briefingHasPublishMeta(thin), false);
  });

  it("earnings patch bullets never include Evidence or 예측 금지", () => {
    const ev: MarketEvent = {
      id: "earnings-naver",
      dateLabel: "오늘",
      region: "KR",
      title: "NAVER 실적 발표",
      level: "high",
      oneLiner: "발표됨 · 매출 약 3.4조원",
      kind: "earnings",
      symbol: "035420.KS",
      dateISO: new Date().toISOString(),
      actual: {
        revenueActual: 3.4e12,
        revenueActualLabel: "약 3.4조원",
        operatingProfitActual: 5.2e11,
        operatingProfitActualLabel: "약 5,203억원",
      },
      contextNews: [
        {
          title: "네이버 실적 AI 투자",
          publisher: "test",
          publishedAt: new Date().toISOString(),
          snippet: "AI 비용",
        },
      ],
    };
    const bullet = buildEarningsPatchBullet(ev);
    assert.equal(textHasPublishMeta(bullet), false);
    assert.match(bullet, /NAVER|3\.4조원/);
  });
});
