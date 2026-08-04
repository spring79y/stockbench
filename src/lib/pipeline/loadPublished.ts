import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MarketScope } from "@/lib/market/scope";
import type { EditorialView, PublishedBundle } from "@/lib/pipeline/types";
import type { CheckItem, DailyBriefing, MarketEvent, Scenario } from "@/lib/types";
import {
  checkItems as fallbackChecks,
  dailyBriefing as fallbackBriefing,
  scenarios as fallbackScenarios,
  upcomingEvents as fallbackEvents,
} from "@/data/mock";

export type BoardEditorial = {
  slot: PublishedBundle["slot"] | null;
  publishedAt: string | null;
  views: Record<MarketScope, EditorialView>;
  events: MarketEvent[];
  fromPipeline: boolean;
};

function fallbackView(meta: Pick<DailyBriefing, "headline" | "bullets" | "evidenceIds">): EditorialView {
  return {
    briefing: {
      headline: meta.headline,
      bullets: meta.bullets,
      evidenceIds: meta.evidenceIds,
    },
    scenarios: fallbackScenarios,
    checkItems: fallbackChecks,
  };
}

export async function loadPublishedBoard(): Promise<BoardEditorial> {
  try {
    const path = join(process.cwd(), "src/data/published/latest.json");
    const raw = await readFile(path, "utf8");
    const published = JSON.parse(raw) as PublishedBundle & {
      briefing?: EditorialView["briefing"];
      scenarios?: Scenario[];
      checkItems?: CheckItem[];
    };

    if (published.guard && published.guard.ok === false) {
      throw new Error("published bundle failed guard");
    }

    // v2
    if (published.version === 2 && published.views) {
      return {
        slot: published.slot,
        publishedAt: published.publishedAt,
        views: published.views,
        events: published.events,
        fromPipeline: true,
      };
    }

    // v1 fallback migrate
    if (published.briefing && published.scenarios && published.checkItems) {
      const one: EditorialView = {
        briefing: published.briefing,
        scenarios: published.scenarios,
        checkItems: published.checkItems,
      };
      return {
        slot: published.slot,
        publishedAt: published.publishedAt,
        views: { all: one, kr: one, us: one },
        events: published.events,
        fromPipeline: true,
      };
    }

    throw new Error("unsupported published shape");
  } catch {
    const one = fallbackView(fallbackBriefing);
    return {
      slot: null,
      publishedAt: null,
      views: { all: one, kr: one, us: one },
      events: fallbackEvents,
      fromPipeline: false,
    };
  }
}
