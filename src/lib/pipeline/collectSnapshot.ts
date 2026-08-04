import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";
import {
  INDEX_DEFINITIONS,
  MACRO_DEFINITIONS,
  buildMood,
  buildTemperature,
  formatAsOfLabel,
  parseYahooTime,
  toIndexQuote,
  toMacroChip,
  type YahooQuoteLike,
} from "@/lib/market/map";
import { fetchInvestorFlow } from "@/lib/market/fetchInvestorFlow";
import { fetchRiskContext } from "@/lib/market/fetchRiskContext";
import {
  KS200_SYMBOL,
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
  buildRetailScan,
  toCollectorRetailScan,
} from "@/lib/market/retailScan";
import {
  buildEvidencePack,
  type EvidencePack,
} from "@/lib/pipeline/evidencePack";
import type {
  CollectorSnapshot,
  MarketScope,
  PipelineSlot,
  PublishedBundle,
} from "@/lib/pipeline/types";
import type { IndexQuote, MacroChip, MarketEvent } from "@/lib/types";

export function defaultPipelineEvents(): MarketEvent[] {
  return [
    {
      id: "nfp",
      dateLabel: "08.07 (금)",
      region: "US",
      title: "미국 고용보고서 (NFP)",
      level: "high",
      oneLiner: "일자리 성적표 — 금리 기대와 달러·미 지수에 영향",
    },
    {
      id: "cpi",
      dateLabel: "08.12 (수)",
      region: "US",
      title: "미국 소비자물가 (CPI)",
      level: "high",
      oneLiner: "물가 지표 — 금리 인하 기대를 흔드는 핵심 숫자",
    },
    {
      id: "krx-option",
      dateLabel: "08.13 (목)",
      region: "KR",
      title: "국내 옵션 만기",
      level: "medium",
      oneLiner: "수급·변동성 확대 가능 — 재료보다 흔들림에 주의",
    },
    {
      id: "fomc-minutes",
      dateLabel: "08.20 (목)",
      region: "US",
      title: "FOMC 의사록",
      level: "medium",
      oneLiner: "연준 회의 속마음 — 다음 금리 경로 힌트 확인",
    },
  ];
}

async function loadPreviousBriefing(cwd: string): Promise<EvidencePack["previous"]> {
  try {
    const path = join(cwd, "src/data/published/latest.json");
    const raw = await readFile(path, "utf8");
    const published = JSON.parse(raw) as PublishedBundle;
    const headlines: Partial<Record<MarketScope, string>> = {};
    if (published.views) {
      (["all", "kr", "us"] as MarketScope[]).forEach((scope) => {
        const h = published.views[scope]?.briefing?.headline;
        if (h) headlines[scope] = h;
      });
    }
    return {
      slot: published.slot ?? null,
      publishedAt: published.publishedAt ?? null,
      headlines,
    };
  } catch {
    return { slot: null, publishedAt: null, headlines: {} };
  }
}

export async function collectSnapshot(
  slot: PipelineSlot,
  options?: { cwd?: string; events?: MarketEvent[] },
): Promise<CollectorSnapshot> {
  const cwd = options?.cwd ?? process.cwd();
  const events = options?.events ?? defaultPipelineEvents();
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const symbols = [
    ...INDEX_DEFINITIONS.map((d) => d.symbol),
    ...MACRO_DEFINITIONS.map((d) => d.symbol),
    KS200_SYMBOL,
    ...MEGA_CAP_CANDIDATES_KR.map((d) => d.symbol),
    ...MEGA_CAP_CANDIDATES_US.map((d) => d.symbol),
  ];

  const [rawResult, investorFlow, previous] = await Promise.all([
    yf.quote(symbols, { return: "object" }) as Promise<Record<string, YahooQuoteLike>>,
    fetchInvestorFlow(MEGA_CAP_CANDIDATES_KR),
    loadPreviousBriefing(cwd),
  ]);

  const indexes = INDEX_DEFINITIONS.map((def) => toIndexQuote(def, rawResult[def.symbol])).filter(
    (q): q is IndexQuote => Boolean(q),
  );

  const macros = MACRO_DEFINITIONS.map((def) => {
    const hit =
      rawResult[def.symbol] ?? (def.symbol === "USDKRW=X" ? rawResult["KRW=X"] : undefined);
    return toMacroChip(def, hit);
  }).filter((q): q is MacroChip => Boolean(q));

  const times = Object.values(rawResult).map((q) => parseYahooTime(q?.regularMarketTime));
  const { mood, moodLabel } = buildMood(indexes);
  const collectedAt = new Date().toISOString();
  const asOfLabel = formatAsOfLabel(times);
  const temperature = buildTemperature(indexes);

  const risk = await fetchRiskContext(macros);

  const retailBundle = buildRetailScan(rawResult, indexes, macros, {
    status: investorFlow.status,
    summary: investorFlow.summary,
    note: investorFlow.note,
    asOfLabel: investorFlow.asOfLabel,
    kospi: investorFlow.kospi,
    kosdaq: investorFlow.kosdaq,
    kospiHistory: investorFlow.kospiHistory,
    kosdaqHistory: investorFlow.kosdaqHistory,
    byStock: investorFlow.byStock,
  });

  const evidence = buildEvidencePack({
    slot,
    collectedAt,
    asOfLabel,
    temperature,
    mood,
    moodLabel,
    indexes,
    macros,
    flow: {
      status: investorFlow.status,
      asOfLabel: investorFlow.asOfLabel,
      summary: investorFlow.summary,
      kospiHistory: investorFlow.kospiHistory,
      kosdaqHistory: investorFlow.kosdaqHistory,
    },
    megaCaps: [
      ...retailBundle.topCapsKr.map((q) => ({
        name: `KR·${q.name}`,
        changePercent: q.changePercent,
      })),
      ...retailBundle.topCapsUs.map((q) => ({
        name: `US·${q.name}`,
        changePercent: q.changePercent,
      })),
    ],
    signalsSummary: retailBundle.summaries.signal,
    ks200Label: retailBundle.summaries.ks200,
    events,
    previous,
    risk,
  });

  return {
    collectedAt,
    slot,
    indexes,
    macros,
    temperature,
    mood,
    moodLabel,
    asOfLabel,
    retailScan: toCollectorRetailScan(retailBundle),
    evidence,
    events,
  };
}
