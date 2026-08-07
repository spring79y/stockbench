import type { MarketScope } from "@/lib/market/scope";
import type { BoardEditorial } from "@/lib/pipeline/loadPublished";
import { slimOverviewDecision } from "@/lib/pipeline/overviewCue";
import type { EditorialView } from "@/lib/pipeline/types";

function emptyView(): EditorialView {
  return {
    briefing: { headline: "", bullets: [], evidenceIds: [] },
    scenarios: [],
    checkItems: [],
  };
}

/** Drop unused editorial fields before hydrating the client board. */
export function slimBoardForScope(
  board: BoardEditorial,
  scope: MarketScope,
): BoardEditorial {
  if (scope === "all") {
    // Overview: Decision cue + check ≤2 per market — not full A/B or briefing clone.
    return {
      slot: board.slot,
      publishedAt: board.publishedAt,
      fromPipeline: board.fromPipeline,
      events: board.events,
      views: {
        all: emptyView(),
        kr: slimOverviewDecision(board.views.kr),
        us: slimOverviewDecision(board.views.us),
      },
    };
  }

  if (scope === "kr") {
    return {
      slot: board.slot,
      publishedAt: board.publishedAt,
      fromPipeline: board.fromPipeline,
      events: board.events,
      views: {
        all: emptyView(),
        kr: board.views.kr,
        us: emptyView(),
      },
    };
  }

  return {
    slot: board.slot,
    publishedAt: board.publishedAt,
    fromPipeline: board.fromPipeline,
    events: board.events,
    views: {
      all: emptyView(),
      kr: emptyView(),
      us: board.views.us,
    },
  };
}
