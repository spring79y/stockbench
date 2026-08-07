import { runGuard } from "@/lib/pipeline/guard";
import { sanitizeEditorialView } from "@/lib/pipeline/publishSanitize";
import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  EditorialView,
  MarketScope,
  PublishedBundle,
} from "@/lib/pipeline/types";
import type { MarketEvent } from "@/lib/types";

export function publishBundle(input: {
  snapshot: CollectorSnapshot;
  views: Record<MarketScope, { briefing: BriefingDraft; decision: DecisionDraft }>;
  events: MarketEvent[];
}): PublishedBundle {
  const findings = (["all", "kr", "us"] as MarketScope[]).flatMap((scope) => {
    const view = input.views[scope];
    return runGuard({
      snapshot: input.snapshot,
      briefing: view.briefing,
      decision: view.decision,
      scope,
    }).findings.map((f) => ({ ...f, message: `[${scope}] ${f.message}` }));
  });

  const guard = {
    ok: findings.every((f) => f.severity !== "block"),
    findings,
  };

  const views = Object.fromEntries(
    (["all", "kr", "us"] as MarketScope[]).map((scope) => {
      const view = input.views[scope];
      const editorial: EditorialView = sanitizeEditorialView({
        briefing: {
          headline: view.briefing.headline,
          bullets: view.briefing.bullets,
          evidenceIds: view.briefing.evidenceIds,
        },
        scenarios: view.decision.scenarios,
        checkItems: view.decision.checkItems,
      });
      return [scope, editorial];
    }),
  ) as Record<MarketScope, EditorialView>;

  return {
    version: 2,
    slot: input.snapshot.slot,
    publishedAt: new Date().toISOString(),
    source: "pipeline",
    market: {
      temperature: input.snapshot.temperature,
      mood: input.snapshot.mood,
      moodLabel: input.snapshot.moodLabel,
      asOfLabel: input.snapshot.asOfLabel,
    },
    views,
    events: input.events,
    guard,
  };
}
