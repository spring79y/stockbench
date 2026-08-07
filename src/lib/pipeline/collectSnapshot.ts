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
import { fetchPriorSessionChanges } from "@/lib/market/fetchPriorSessionChanges";
import { fetchRiskContext } from "@/lib/market/fetchRiskContext";
import {
  KS200_SYMBOL,
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
  buildRetailScan,
  toCollectorRetailScan,
} from "@/lib/market/retailScan";
import {
  buildAllScopeCarryForward,
} from "@/lib/pipeline/carryForward";
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
import { buildUpcomingEvents } from "@/lib/events/buildUpcomingEvents";
import { defaultPipelineEvents } from "@/lib/events/defaultEvents";
import { attachEventDetailSummaries } from "@/lib/events/attachEventDetailSummaries";
import { attachEarningsContextNews } from "@/lib/market/fetchEarningsContextNews";

export { defaultPipelineEvents } from "@/lib/events/defaultEvents";

async function loadPublishedBundle(cwd: string): Promise<PublishedBundle | null> {
  try {
    const path = join(cwd, "src/data/published/latest.json");
    const raw = await readFile(path, "utf8");
    const published = JSON.parse(raw) as PublishedBundle;
    if (published.version === 2 && published.views) return published;
    return null;
  } catch {
    return null;
  }
}

function previousFromPublished(
  published: PublishedBundle | null,
  continuity: EvidencePack["previous"]["continuity"],
): EvidencePack["previous"] {
  if (!published) {
    return { slot: null, publishedAt: null, headlines: {}, continuity };
  }
  const headlines: Partial<Record<MarketScope, string>> = {};
  (["all", "kr", "us"] as MarketScope[]).forEach((scope) => {
    const h = published.views[scope]?.briefing?.headline;
    if (h) headlines[scope] = h;
  });
  return {
    slot: published.slot ?? null,
    publishedAt: published.publishedAt ?? null,
    headlines,
    continuity,
  };
}

export async function collectSnapshot(
  slot: PipelineSlot,
  options?: { cwd?: string; events?: MarketEvent[] },
): Promise<CollectorSnapshot> {
  const cwd = options?.cwd ?? process.cwd();
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const eventsBase =
    options?.events ??
    (await buildUpcomingEvents(yf).catch(() => defaultPipelineEvents()));
  const eventsWithNews = await attachEarningsContextNews(eventsBase).catch((error) => {
    console.error("[collect] earnings context news failed", error);
    return eventsBase;
  });
  const events = attachEventDetailSummaries(eventsWithNews);
  const symbols = [
    ...INDEX_DEFINITIONS.map((d) => d.symbol),
    ...MACRO_DEFINITIONS.map((d) => d.symbol),
    KS200_SYMBOL,
    ...MEGA_CAP_CANDIDATES_KR.map((d) => d.symbol),
    ...MEGA_CAP_CANDIDATES_US.map((d) => d.symbol),
  ];

  const [rawResult, investorFlow, published] = await Promise.all([
    yf.quote(symbols, { return: "object" }) as Promise<Record<string, YahooQuoteLike>>,
    fetchInvestorFlow(MEGA_CAP_CANDIDATES_KR),
    loadPublishedBundle(cwd),
  ]);

  const indexesBase = INDEX_DEFINITIONS.map((def) => toIndexQuote(def, rawResult[def.symbol])).filter(
    (q): q is IndexQuote => Boolean(q),
  );

  const marketStates: Record<string, string | undefined> = {};
  const livePercents: Record<string, number | undefined> = {};
  for (const def of INDEX_DEFINITIONS) {
    marketStates[def.symbol] = rawResult[def.symbol]?.marketState;
    livePercents[def.symbol] = rawResult[def.symbol]?.regularMarketChangePercent;
  }
  const priorBySymbol = await fetchPriorSessionChanges(yf, marketStates, livePercents).catch(
    () => ({}) as Awaited<ReturnType<typeof fetchPriorSessionChanges>>,
  );

  const indexes = indexesBase.map((q) => {
    const def = INDEX_DEFINITIONS.find((d) => d.id === q.id);
    const prior = def ? priorBySymbol[def.symbol] : undefined;
    return {
      ...q,
      priorSessionChangePercent: prior?.priorSessionChangePercent ?? null,
      changeBasis: prior?.changeBasis ?? "unknown",
    };
  });

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

  // Build pack first without continuity, then attach resolved carry-forward
  const evidenceBase = buildEvidencePack({
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
    previous: previousFromPublished(published, undefined),
    risk,
  });

  const continuity = buildAllScopeCarryForward({
    published,
    pack: evidenceBase,
    currentEvents: events,
  });

  const evidence: EvidencePack = {
    ...evidenceBase,
    previous: previousFromPublished(published, continuity),
  };

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
