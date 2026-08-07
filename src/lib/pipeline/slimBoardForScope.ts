import type { MarketScope } from "@/lib/market/scope";
import type { BoardEditorial } from "@/lib/pipeline/loadPublished";
import { slimOverviewDecision } from "@/lib/pipeline/overviewCue";
import type { EditorialView } from "@/lib/pipeline/types";

/** Overview: short dual brief + Decision cue (base title + check ≤2). No full A/B. */
function briefForOverview(view: EditorialView): EditorialView {
  const decision = slimOverviewDecision(view);
  return {
    briefing: {
      headline: view.briefing.headline,
      bullets: view.briefing.bullets.slice(0, 2),
      evidenceIds: [],
    },
    scenarios: decision.scenarios,
    checkItems: decision.checkItems,
    publishedAt: view.publishedAt,
    slot: view.slot,
    mode: view.mode,
    changeLines: view.changeLines,
  };
}

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
    return {
      slot: board.slot,
      publishedAt: board.publishedAt,
      fromPipeline: board.fromPipeline,
      events: board.events,
      views: {
        all: emptyView(),
        kr: briefForOverview(board.views.kr),
        us: briefForOverview(board.views.us),
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
