import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  GuardFinding,
  GuardReport,
} from "@/lib/pipeline/types";

const RECOMMENDATION_PATTERNS = [
  /매수하(세요|라|십시오)/,
  /매도하(세요|라|십시오)/,
  /사라\b/,
  /팔라\b/,
  /비중을?\s*(늘|줄|조절)/,
  /추천한다/,
  /사세요/,
  /파세요/,
  /예측할\s*수\s*있/,
  /미리\s*알\s*수\s*있/,
  /반드시\s*오를/,
  /확실히\s*(상승|하락)/,
];

const EMPTY_CHECK_PATTERNS = [
  /확인한다\.?$/,
  /점검한다\.?$/,
  /살펴본다\.?$/,
  /모니터링/,
  /지속적으로\s*확인/,
  /\?$/,
  /인가\?$/,
  /했는가\?$/,
  /있는가\?$/,
];

/** 등락 숫자 복창성 문장 */
function looksLikeNumberRestatement(text: string): boolean {
  const pctHits = (text.match(/-?\d+(?:\.\d+)?%/g) || []).length;
  const hasVerb =
    /하락했습니다|상승했습니다|머물며|기록했습니다|보였습니다/.test(text);
  return pctHits >= 2 && hasVerb && text.length < 80;
}

/** Guard Agent — 사실·톤·복창·공허 점검 */
export function runGuard(input: {
  snapshot: CollectorSnapshot;
  briefing: BriefingDraft;
  decision: DecisionDraft;
}): GuardReport {
  const findings: GuardFinding[] = [];
  const texts: string[] = [
    input.briefing.headline,
    ...input.briefing.bullets,
    ...input.decision.scenarios.flatMap((s) => [s.title, s.summary, s.implication]),
    ...input.decision.checkItems.flatMap((c) => [c.text, c.why]),
  ];

  for (const text of texts) {
    for (const pattern of RECOMMENDATION_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({
          severity: "block",
          code: "recommendation-or-prediction",
          message: `추천/예측 톤 감지: "${text.slice(0, 48)}"`,
        });
      }
    }
  }

  for (const bullet of input.briefing.bullets) {
    if (looksLikeNumberRestatement(bullet)) {
      findings.push({
        severity: "block",
        code: "number-restatement",
        message: `숫자 복창 브리핑 감지: "${bullet.slice(0, 48)}"`,
      });
    }
  }

  for (const item of input.decision.checkItems) {
    for (const pattern of EMPTY_CHECK_PATTERNS) {
      if (pattern.test(item.text.trim())) {
        findings.push({
          severity: "block",
          code: "empty-checklist",
          message: `공허하거나 질문형인 주목 요소: "${item.text.slice(0, 48)}"`,
        });
      }
    }
  }

  if (input.briefing.bullets.length !== 3) {
    findings.push({
      severity: "warn",
      code: "bullet-count",
      message: `불릿 개수 ${input.briefing.bullets.length} — 권장 3개`,
    });
  }

  if (input.briefing.headline.length > 48) {
    findings.push({
      severity: "warn",
      code: "headline-too-long",
      message: "헤드라인이 깁니다. 40자 안팎으로 줄이세요.",
    });
  }

  for (const bullet of input.briefing.bullets) {
    if (bullet.length > 72) {
      findings.push({
        severity: "warn",
        code: "bullet-too-long",
        message: `불릿이 깁니다(60자 목표): "${bullet.slice(0, 36)}…"`,
      });
    }
  }

  if (input.decision.scenarios.length !== 2) {
    findings.push({
      severity: "block",
      code: "scenario-count",
      message: "시나리오는 A/B 2개여야 합니다",
    });
  }

  for (const s of input.decision.scenarios) {
    if (s.summary.length > 70) {
      findings.push({
        severity: "warn",
        code: "scenario-summary-long",
        message: `시나리오 summary가 깁니다: "${s.title}"`,
      });
    }
    if (s.implication.length > 56 || /\(1\)|①|1\)\s/.test(s.implication)) {
      findings.push({
        severity: "warn",
        code: "scenario-implication-long",
        message: `implication은 관측 기준 1~2개만, 짧게: "${s.title}"`,
      });
    }
  }

  if (input.decision.checkItems.length !== 3) {
    findings.push({
      severity: "warn",
      code: "checklist-count",
      message: `오늘 볼 것은 정확히 3개여야 합니다 (현재 ${input.decision.checkItems.length})`,
    });
  }

  for (const item of input.decision.checkItems) {
    if (item.why.length > 56) {
      findings.push({
        severity: "warn",
        code: "check-why-long",
        message: `why가 깁니다: "${item.text.slice(0, 24)}"`,
      });
    }
  }

  for (const id of input.briefing.evidenceIds) {
    if (!input.snapshot.macros.some((m) => m.id === id)) {
      findings.push({
        severity: "block",
        code: "evidence-missing",
        message: `근거 지표 id 없음: ${id}`,
      });
    }
  }

  const kospi = input.snapshot.indexes.find((q) => q.id === "kospi");
  const claimsDomesticBullish = texts.some((text) =>
    /코스피(?:가|는|도)?\s*강세|국내\s*(?:증시|시장)(?:가|는|도)?\s*강세/.test(text),
  );
  const claimsDomesticBearish = texts.some((text) =>
    /코스피(?:가|는|도)?\s*약세|국내\s*(?:증시|시장)(?:가|는|도)?\s*약세/.test(text),
  );
  if (kospi && kospi.changePercent <= -1 && claimsDomesticBullish) {
    findings.push({
      severity: "block",
      code: "fact-mismatch",
      message: "코스피 약세인데 강세 서술 감지",
    });
  }
  if (kospi && kospi.changePercent >= 1 && claimsDomesticBearish) {
    findings.push({
      severity: "warn",
      code: "fact-mismatch-soft",
      message: "코스피 강세인데 약세 서술 가능성",
    });
  }

  const fx = input.snapshot.macros.find((m) => m.id === "usdkkrw");
  const claimsFxUp = texts.some((text) =>
    /원\/달러가?\s*상승|환율\s*상승|원화\s*약세/.test(text),
  );
  const claimsFxDown = texts.some((text) =>
    /원\/달러가?\s*하락|환율\s*하락|원화\s*강세/.test(text),
  );
  if (fx?.direction === "down" && claimsFxUp) {
    findings.push({
      severity: "block",
      code: "fx-mismatch",
      message: "원/달러 하락(원화 상대 강세)인데 상승/원화약세 서술 감지",
    });
  }
  if (fx?.direction === "up" && claimsFxDown) {
    findings.push({
      severity: "block",
      code: "fx-mismatch",
      message: "원/달러 상승인데 하락/원화강세 서술 감지",
    });
  }

  return {
    ok: findings.every((f) => f.severity !== "block"),
    findings,
  };
}

export const GUARD_SYSTEM_PROMPT = `당신은 증시 브리핑의 Guard Agent다.
숫자 복창, 공허한 점검, 추천/예측 톤, 사실 불일치를 차단한다.`;
