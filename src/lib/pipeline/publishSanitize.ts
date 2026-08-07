/**
 * Defense-in-depth: strip pipeline meta from fields that reach BoardEditorial /
 * latest.json. Source builders should already emit ant-facing copy; this
 * catches LLM slips and legacy patch strings.
 */
import type {
  BriefingDraft,
  DecisionDraft,
  EditorialView,
  PublishedBundle,
} from "@/lib/pipeline/types";

/** Tokens / phrases that must never appear in published ant-facing prose. */
export const PUBLISH_META_MARKERS: RegExp[] = [
  /\bEvidence\b/i,
  /Evidence뉴스/i,
  /\bforceCite\b/i,
  /플래그\s*\(\s*Evidence\s*\)/i,
  /방향\s*예측\s*금지/,
  /전쟁\s*결과\s*예측\s*금지/,
  /서프라이즈\s*\/\s*미스\s*단정\s*금지/,
  /숫자\s*창작\s*금지/,
  /가이던스\s*추측/,
  /영문\s*헤드라인\s*생략/,
  /짧게\s*연결합니다/,
  /로만\s*짧게/,
  /반응만\s*점검합니다/,
];

export function textHasPublishMeta(text: string): boolean {
  return PUBLISH_META_MARKERS.some((re) => re.test(text));
}

export function briefingHasPublishMeta(briefing: {
  headline: string;
  bullets: string[];
}): boolean {
  return [briefing.headline, ...briefing.bullets].some(textHasPublishMeta);
}

/**
 * Rewrite leaked meta into ant-facing prose when possible.
 * Prefer keeping factual stems (close %, earnings numbers) over silent delete.
 */
export function sanitizeUserFacingText(text: string): string {
  let out = text;

  // Lecture parentheses / brackets
  out = out.replace(
    /\s*[（(][^）)]*(?:예측\s*금지|단정\s*금지|창작\s*금지|가이던스\s*추측|영문\s*헤드라인\s*생략)[^）)]*[）)]/g,
    "",
  );

  // Em-dash Evidence-labeled tails (keep the fact before the dash)
  out = out.replace(/\s*[—–]\s*Evidence[^.。\n]*/gi, "");

  // Inline Evidence labels
  out = out.replace(/Evidence뉴스/gi, "뉴스");
  out = out.replace(/플래그\s*\(\s*Evidence\s*\)/gi, "리스크");
  out = out.replace(/\(\s*Evidence[^)]*\)/gi, "");
  out = out.replace(
    /\bEvidence(?:\s*(?:앵커|지수\s*사실|매크로|일정\s*앵커|세션\s*마감\s*사실))?/gi,
    "",
  );
  out = out.replace(/\bforceCite\b/gi, "");

  // Process / checklist voice leftovers
  out = out.replace(/짧게\s*연결합니다\.?/g, "체감 차이를 가른다");
  out = out.replace(/반응만\s*점검합니다\.?/g, "반응으로 온도를 가늠한다");
  out = out.replace(/로만\s*짧게\.?/g, "만 참고한다");
  out = out.replace(/원인\s*후보로만\s*짧게\.?/g, "원인 후보다");

  // Cleanup artifacts from stripping
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/\s+([.,·])/g, "$1");
  out = out.replace(/\s*[—–-]\s*$/g, "");
  out = out.replace(/\s*[—–]\s*\./g, ".");
  out = out.replace(/\(\s*\)/g, "");
  out = out.replace(/\s*[—–-]\s*$/g, "").trim();
  // After stripping an Evidence tail, restore a period on fact lines
  if (out.length > 0 && /[0-9%]/.test(out) && !/[.。!?]$/.test(out)) {
    out = `${out}.`;
  }
  return out;
}

/** Imperative-only process lines with no market fact — drop rather than publish. */
function isProcessOnlyLine(text: string): boolean {
  if (/\d/.test(text)) return false;
  if (
    /코스피|코스닥|나스닥|다우|S&P|환율|금리|VIX|유가|실적|마감|수급|시총/.test(
      text,
    )
  ) {
    return false;
  }
  return /연결합니다|점검합니다|요약합니다|관측합니다|로만\s*짧게|짧게\s*연결/.test(
    text,
  );
}

export function sanitizeBriefingDraft(briefing: BriefingDraft): BriefingDraft {
  const headline = sanitizeUserFacingText(briefing.headline);
  const bullets = briefing.bullets
    .map(sanitizeUserFacingText)
    .map((b) => b.replace(/\.\.+$/, "."))
    .filter((b) => b.length > 0 && !isProcessOnlyLine(b));

  // Never leave an empty briefing — keep a minimal cleaned headline line
  const safeBullets =
    bullets.length > 0
      ? bullets.slice(0, 5)
      : headline
        ? [headline]
        : ["오늘 시장 요약을 확인하지 못했습니다."];

  return {
    ...briefing,
    headline: headline || safeBullets[0]!,
    bullets: safeBullets,
  };
}

export function sanitizeDecisionDraft(decision: DecisionDraft): DecisionDraft {
  return {
    scenarios: decision.scenarios.map((s) => ({
      ...s,
      title: sanitizeUserFacingText(s.title),
      summary: sanitizeUserFacingText(s.summary),
      implication: sanitizeUserFacingText(s.implication),
    })),
    checkItems: decision.checkItems.map((c) => ({
      ...c,
      text: sanitizeUserFacingText(c.text),
      why: sanitizeUserFacingText(c.why),
    })),
  };
}

export function sanitizeEditorialView(view: EditorialView): EditorialView {
  const briefing = sanitizeBriefingDraft({
    headline: view.briefing.headline,
    bullets: view.briefing.bullets,
    evidenceIds: view.briefing.evidenceIds ?? [],
  });
  const decision = sanitizeDecisionDraft({
    scenarios: view.scenarios,
    checkItems: view.checkItems,
  });
  return {
    ...view,
    briefing: {
      headline: briefing.headline,
      bullets: briefing.bullets,
      evidenceIds: briefing.evidenceIds,
    },
    scenarios: decision.scenarios,
    checkItems: decision.checkItems,
  };
}

export function sanitizePublishedBundle(
  bundle: PublishedBundle,
): PublishedBundle {
  const scopes = ["all", "kr", "us"] as const;
  const views = { ...bundle.views };
  for (const scope of scopes) {
    if (views[scope]) {
      views[scope] = sanitizeEditorialView(views[scope]);
    }
  }
  return { ...bundle, views };
}
