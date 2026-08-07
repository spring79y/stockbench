/**
 * Live Yahoo calendar events lack pipeline Evidence (contextNews / Naver actuals).
 * Overlay published earnings fields so detail UI can show 결과 + headlines.
 */
import {
  applyAnnouncedEarningsStatus,
  hasStructuredEarningsActual,
  isPendingResultOneLiner,
} from "@/lib/market/earningsAnnounced";
import type { MarketEvent } from "@/lib/types";

function looksPreReportOneLiner(oneLiner: string | undefined | null): boolean {
  if (!oneLiner) return true;
  if (isPendingResultOneLiner(oneLiner)) return false;
  if (/발표됨|발표\s*결과|주당순이익\(EPS\)\s+\d/.test(oneLiner)) return false;
  return /시장\s*예상|실적\s*발표\s*예정|예정\s*\(/.test(oneLiner);
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

  const merged = liveEvents.map((live) => {
    if (live.kind !== "earnings") return live;
    const pub = pubById.get(live.id);
    if (!pub) return live;

    const contextNews =
      live.contextNews && live.contextNews.length > 0
        ? live.contextNews
        : pub.contextNews;

    const actual = hasStructuredEarningsActual(live.actual)
      ? live.actual
      : hasStructuredEarningsActual(pub.actual)
        ? pub.actual
        : (live.actual ?? pub.actual);

    let oneLiner = live.oneLiner;
    if (
      !hasStructuredEarningsActual(actual) &&
      looksPreReportOneLiner(live.oneLiner) &&
      (isPendingResultOneLiner(pub.oneLiner) ||
        (pub.oneLiner && !looksPreReportOneLiner(pub.oneLiner)))
    ) {
      oneLiner = pub.oneLiner!;
    }

    const consensus = live.consensus ?? pub.consensus;

    if (
      contextNews === live.contextNews &&
      actual === live.actual &&
      oneLiner === live.oneLiner &&
      consensus === live.consensus
    ) {
      return live;
    }

    return {
      ...live,
      contextNews,
      actual,
      oneLiner,
      consensus,
    };
  });

  return applyAnnouncedEarningsStatus(merged, now);
}
