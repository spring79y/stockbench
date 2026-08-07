/**
 * Live Yahoo calendar events lack pipeline Evidence (contextNews / Naver actuals).
 * Overlay published earnings fields so detail UI can show 결과 + headlines.
 */
import { revenueOpActualFactPhrase } from "@/lib/events/earningsCopy";
import { earningsResultOneLiner } from "@/lib/market/earningsBeat";
import {
  applyAnnouncedEarningsStatus,
  hasStructuredEarningsActual,
  isPendingResultOneLiner,
  looksPreReportOneLiner,
} from "@/lib/market/earningsAnnounced";
import type {
  EarningsActual,
  EarningsConsensus,
  EventDetailSummary,
  MarketEvent,
} from "@/lib/types";

export { looksPreReportOneLiner };

/** Field-merge: never let live EPS-only erase published OP/매출. */
export function mergeEarningsActual(
  live: EarningsActual | undefined,
  pub: EarningsActual | undefined,
): EarningsActual | undefined {
  if (!live && !pub) return undefined;
  if (!live) return pub;
  if (!pub) return live;
  return {
    ...pub,
    ...live,
    epsActual: live.epsActual ?? pub.epsActual,
    epsEstimate: live.epsEstimate ?? pub.epsEstimate,
    surprisePct: live.surprisePct ?? pub.surprisePct,
    beatLabel: live.beatLabel ?? pub.beatLabel,
    reportedDateISO: live.reportedDateISO ?? pub.reportedDateISO,
    operatingProfitActual: live.operatingProfitActual ?? pub.operatingProfitActual,
    operatingProfitActualLabel:
      live.operatingProfitActualLabel ?? pub.operatingProfitActualLabel,
    revenueActual: live.revenueActual ?? pub.revenueActual,
    revenueActualLabel: live.revenueActualLabel ?? pub.revenueActualLabel,
  };
}

/** Prefer richer company-scale consensus labels (Naver OP) when live is Yahoo-thin. */
export function mergeEarningsConsensus(
  live: EarningsConsensus | undefined,
  pub: EarningsConsensus | undefined,
): EarningsConsensus | undefined {
  if (!live && !pub) return undefined;
  if (!live) return pub;
  if (!pub) return live;
  const sources = new Set([...(live.sources ?? []), ...(pub.sources ?? [])]);
  return {
    ...pub,
    ...live,
    operatingProfitAvg: live.operatingProfitAvg ?? pub.operatingProfitAvg,
    operatingProfitLabel: live.operatingProfitLabel ?? pub.operatingProfitLabel,
    revenueAvg: live.revenueAvg ?? pub.revenueAvg,
    revenueLabel: live.revenueLabel ?? pub.revenueLabel,
    epsAvg: live.epsAvg ?? pub.epsAvg,
    epsLow: live.epsLow ?? pub.epsLow,
    epsHigh: live.epsHigh ?? pub.epsHigh,
    epsLabel: live.epsLabel ?? pub.epsLabel,
    sources: sources.size > 0 ? ([...sources] as EarningsConsensus["sources"]) : live.sources ?? pub.sources,
    isEstimate: live.isEstimate ?? pub.isEstimate,
  };
}

function mergeDetailSummary(
  live: EventDetailSummary | undefined,
  pub: EventDetailSummary | undefined,
): EventDetailSummary | undefined {
  if (!live && !pub) return undefined;
  if (!live) return pub;
  if (!pub) return live;
  const merged: EventDetailSummary = {
    expectation: live.expectation ?? pub.expectation,
    meaning: live.meaning ?? pub.meaning,
    result: live.result ?? pub.result,
    reaction: live.reaction ?? pub.reaction,
    implication: live.implication ?? pub.implication,
  };
  return Object.values(merged).some(Boolean) ? merged : undefined;
}

function rebuildPostOneLiner(event: MarketEvent, actual: EarningsActual): string {
  const companyScaleActualLine = revenueOpActualFactPhrase({
    revenueLabel: actual.revenueActualLabel,
    opLabel: actual.operatingProfitActualLabel,
  });
  return earningsResultOneLiner(actual.beatLabel, {
    epsActual: actual.epsActual,
    epsEstimate: actual.epsEstimate,
    region: event.region === "KR" ? "KR" : "US",
    companyScaleActualLine,
  });
}

/**
 * Prefer live schedule/consensus freshness; fill Evidence gaps from published.
 * Then re-apply announced/pending oneLiner rules (never invent numbers).
 */
export function mergePublishedEarningsEvidence(
  liveEvents: MarketEvent[],
  publishedEvents: MarketEvent[],
  now: Date = new Date(),
): MarketEvent[] {
  const pubById = new Map(
    publishedEvents.filter((e) => e.kind === "earnings").map((e) => [e.id, e]),
  );
  // Non-earnings: still overlay detailSummary / contextNews when published has them.
  const pubAnyById = new Map(publishedEvents.map((e) => [e.id, e]));

  const merged = liveEvents.map((live) => {
    if (live.kind !== "earnings") {
      const pub = pubAnyById.get(live.id);
      if (!pub) return live;
      const detailSummary = mergeDetailSummary(live.detailSummary, pub.detailSummary);
      const contextNews =
        live.contextNews && live.contextNews.length > 0
          ? live.contextNews
          : pub.contextNews;
      if (detailSummary === live.detailSummary && contextNews === live.contextNews) {
        return live;
      }
      return { ...live, detailSummary, contextNews };
    }

    const pub = pubById.get(live.id);
    if (!pub) return live;

    const contextNews =
      live.contextNews && live.contextNews.length > 0
        ? live.contextNews
        : pub.contextNews;

    const actual = mergeEarningsActual(live.actual, pub.actual);
    const consensus = mergeEarningsConsensus(live.consensus, pub.consensus);
    const detailSummary = mergeDetailSummary(live.detailSummary, pub.detailSummary);

    let oneLiner = live.oneLiner;
    if (hasStructuredEarningsActual(actual) && actual) {
      const livePre = looksPreReportOneLiner(live.oneLiner);
      const pubPost =
        Boolean(pub.oneLiner) &&
        !looksPreReportOneLiner(pub.oneLiner) &&
        !isPendingResultOneLiner(pub.oneLiner);
      const companyScaleFilled =
        Boolean(actual.operatingProfitActualLabel || actual.revenueActualLabel) &&
        Boolean(live.oneLiner) &&
        !/매출|영업이익/.test(live.oneLiner!);
      if (livePre && pubPost) {
        oneLiner = pub.oneLiner!;
      } else if (livePre || companyScaleFilled) {
        oneLiner = rebuildPostOneLiner(live, actual);
      }
    } else if (
      looksPreReportOneLiner(live.oneLiner) &&
      (isPendingResultOneLiner(pub.oneLiner) ||
        (pub.oneLiner && !looksPreReportOneLiner(pub.oneLiner)))
    ) {
      oneLiner = pub.oneLiner!;
    }

    if (
      contextNews === live.contextNews &&
      actual === live.actual &&
      oneLiner === live.oneLiner &&
      consensus === live.consensus &&
      detailSummary === live.detailSummary
    ) {
      return live;
    }

    return {
      ...live,
      contextNews,
      actual,
      oneLiner,
      consensus,
      detailSummary,
    };
  });

  return applyAnnouncedEarningsStatus(merged, now);
}
