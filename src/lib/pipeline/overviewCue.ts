import type { CheckItem, Scenario } from "@/lib/types";
import type { EditorialView } from "@/lib/pipeline/types";

/** Overview-only Decision cue — not full A/B or full checklist. */
export type OverviewMarketCue = {
  cue: string;
  checks: Array<Pick<CheckItem, "id" | "text">>;
};

function baseScenario(scenarios: Scenario[] | undefined): Scenario | undefined {
  if (!scenarios?.length) return undefined;
  return scenarios.find((s) => s.id === "base") ?? scenarios[0];
}

/**
 * 한 시장: Decision에서 1줄 큐 + 점검 ≤2.
 * 시나리오 A/B 본문·체크 전체는 넣지 않음. 내용 없으면 null (섹션 숨김).
 */
export function buildOverviewMarketCue(
  view: Pick<EditorialView, "scenarios" | "checkItems">,
): OverviewMarketCue | null {
  const checks = (view.checkItems ?? [])
    .filter((c) => c.text?.trim())
    .slice(0, 2)
    .map((c) => ({ id: c.id, text: c.text.trim() }));

  const base = baseScenario(view.scenarios);
  const title = base?.title?.trim();

  let cue = "";
  if (title) {
    cue = `오늘은 ${title}만 보면 된다`;
  } else if (checks[0]) {
    cue = `오늘은 ${checks[0].text}만 보면 된다`;
  }

  if (!cue && checks.length === 0) return null;
  return { cue, checks };
}

/** Slim overview payload: cue source (base scenario title) + ≤2 checks. */
export function slimOverviewDecision(view: EditorialView): EditorialView {
  const base = baseScenario(view.scenarios);
  return {
    briefing: {
      headline: "",
      bullets: [],
      evidenceIds: [],
    },
    scenarios: base
      ? [
          {
            id: base.id,
            label: base.label,
            title: base.title,
            summary: "",
            implication: "",
          },
        ]
      : [],
    checkItems: (view.checkItems ?? []).slice(0, 2).map((c) => ({
      id: c.id,
      text: c.text,
      why: "",
    })),
    publishedAt: view.publishedAt,
    slot: view.slot,
    mode: view.mode,
  };
}
