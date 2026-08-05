import type { MarketScope } from "@/lib/market/scope";
import type { BoardEditorial } from "@/lib/pipeline/loadPublished";
import type { EditorialView } from "@/lib/pipeline/types";

function briefOnly(view: EditorialView): EditorialView {
  return {
    briefing: {
      headline: view.briefing.headline,
      bullets: view.briefing.bullets.slice(0, 2),
      evidenceIds: [],
    },
    scenarios: [],
    checkItems: [],
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
    // Overview: dual brief + events only — no scenarios/checklists.
    return {
      slot: board.slot,
      publishedAt: board.publishedAt,
      fromPipeline: board.fromPipeline,
      events: board.events,
      views: {
        all: briefOnly(board.views.all),
        kr: briefOnly(board.views.kr),
        us: briefOnly(board.views.us),
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
