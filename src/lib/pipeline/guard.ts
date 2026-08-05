import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  GuardFinding,
  GuardReport,
  MarketScope,
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

const EMPTY_BRIEFING_PATTERNS = [
  /변동성\s*(에\s*)?유의/,
  /시장이\s*주목/,
  /혼조세/,
  /관망세/,
  /신중히\s*접근/,
  /지켜볼\s*필요/,
  /관심이\s*쏠/,
];

const KR_LEAK_RE = /코스피|코스닥|KS200|코스피200|국내\s*(증시|시장|수급)|외국인\s*순매/;
const US_LEAK_RE = /나스닥|S&P|다우|미\s*증시|미\s*장|뉴욕\s*증시/;

/** 등락 숫자 복창성 문장 */
function looksLikeNumberRestatement(text: string): boolean {
  const pctHits = (text.match(/-?\d+(?:\.\d+)?%/g) || []).length;
  const hasVerb =
    /하락했습니다|상승했습니다|머물며|기록했습니다|보였습니다/.test(text);
  return pctHits >= 2 && hasVerb && text.length < 80;
}

function countMatches(texts: string[], re: RegExp): number {
  return texts.reduce((n, t) => n + (re.test(t) ? 1 : 0), 0);
}

/** Guard Agent — 사실·톤·복창·공허·탭 이탈 점검 */
export function runGuard(input: {
  snapshot: CollectorSnapshot;
  briefing: BriefingDraft;
  decision: DecisionDraft;
  scope?: MarketScope;
}): GuardReport {
  const findings: GuardFinding[] = [];
  const scope = input.scope ?? "all";
  const briefingTexts = [input.briefing.headline, ...input.briefing.bullets];
  const texts: string[] = [
    ...briefingTexts,
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
    for (const pattern of EMPTY_BRIEFING_PATTERNS) {
      if (pattern.test(bullet)) {
        findings.push({
          severity: "block",
          code: "empty-briefing",
          message: `공허한 브리핑 문장: "${bullet.slice(0, 48)}"`,
        });
      }
    }
  }

  if (scope === "us") {
    const krHits = countMatches(briefingTexts, KR_LEAK_RE);
    if (KR_LEAK_RE.test(input.briefing.headline)) {
      findings.push({
        severity: "block",
        code: "scope-leakage",
        message:
          "미국 탭 헤드라인에 코스피/국내 초점 금지. 미 지수·금리·VIX 중심으로 재작성.",
      });
    } else if (krHits > 1) {
      findings.push({
        severity: "block",
        code: "scope-leakage",
        message:
          "미국 탭에서 코스피/국내 언급이 過多. 최대 1불릿 브릿지만 허용. 미장 위주로 재작성.",
      });
    }
  }

  if (scope === "kr") {
    const usHits = countMatches(briefingTexts, US_LEAK_RE);
    if (US_LEAK_RE.test(input.briefing.headline)) {
      findings.push({
        severity: "block",
        code: "scope-leakage",
        message:
          "한국 탭 헤드라인에 미 지수 초점 금지. 국내 지수·수급·시총 중심으로 재작성.",
      });
    } else if (usHits > 1) {
      findings.push({
        severity: "block",
        code: "scope-leakage",
        message:
          "한국 탭에서 미 지수 언급이 過多. 최대 1불릿 브릿지만 허용. 국내 위주로 재작성.",
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

  if (input.briefing.bullets.length < 3 || input.briefing.bullets.length > 5) {
    findings.push({
      severity: "warn",
      code: "bullet-count",
      message: `불릿 개수 ${input.briefing.bullets.length} — 권장 3~5개`,
    });
  }

  if (input.briefing.headline.length > 64) {
    findings.push({
      severity: "warn",
      code: "headline-too-long",
      message: "헤드라인이 깁니다. 56자 안팎으로 줄이세요.",
    });
  }

  for (const bullet of input.briefing.bullets) {
    if (bullet.length > 110) {
      findings.push({
        severity: "warn",
        code: "bullet-too-long",
        message: `불릿이 깁니다(100자 목표): "${bullet.slice(0, 36)}…"`,
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

  if (input.decision.checkItems.length < 3 || input.decision.checkItems.length > 5) {
    findings.push({
      severity: "warn",
      code: "checklist-count",
      message: `오늘 볼 것은 3~5개여야 합니다 (현재 ${input.decision.checkItems.length})`,
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

  const prose = briefingTexts.join(" ");
  for (const id of input.briefing.evidenceIds) {
    const macro = input.snapshot.macros.find((m) => m.id === id);
    if (!macro) continue;
    const tokens = [
      macro.name,
      id,
      macro.id === "usdkkrw" ? "환율" : "",
      macro.id === "us10y" ? "금리" : "",
      macro.id === "wti" ? "유가" : "",
      macro.id === "vix" ? "VIX" : "",
    ].filter(Boolean);
    if (!tokens.some((t) => prose.includes(t))) {
      findings.push({
        severity: "warn",
        code: "evidence-unused",
        message: `evidenceIds에 ${id}(${macro.name})가 있으나 본문에 드러나지 않음`,
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
  if (scope !== "us" && kospi && kospi.changePercent <= -1 && claimsDomesticBullish) {
    findings.push({
      severity: "block",
      code: "fact-mismatch",
      message: "코스피 약세인데 강세 서술 감지",
    });
  }
  if (scope !== "us" && kospi && kospi.changePercent >= 1 && claimsDomesticBearish) {
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

  const now = Date.now();
  const snapshotEvents = input.snapshot.events ?? [];
  const imminentEarnings = snapshotEvents.filter((e) => {
    if (e.kind !== "earnings" || !e.dateISO) return false;
    const t = new Date(e.dateISO).getTime();
    const hours = (t - now) / (60 * 60 * 1000);

    // pre: 발표 예정(0~48시간)
    const isPre = hours >= 0 && hours <= 48;
    // post: 발표 완료(최근 24시간, 실제 값이 잡힌 경우에만)
    const isPost = hours < 0 && hours >= -24 && Boolean(e.actual?.beatLabel);

    if (!isPre && !isPost) return false;

    if (scope === "us") return e.region === "US" || e.region === "GLOBAL";
    if (scope === "kr") return e.region === "KR" || e.region === "GLOBAL";
    return true;
  });
  for (const ev of imminentEarnings) {
    const tokens = [
      ev.title.replace(/ 실적 발표$/, ""),
      ev.title.split("·").pop()?.trim() ?? "",
      ev.symbol ?? "",
      "실적",
    ].filter((t) => t.length >= 2);

    const dateISO = ev.dateISO;
    const isPost =
      Boolean(ev.actual?.beatLabel) &&
      typeof dateISO === "string" &&
      new Date(dateISO).getTime() <= now;
    const beatWord = ev.actual?.beatLabel;

    const hasCore = tokens.some((t) => prose.includes(t));
    const hasBeat =
      !isPost ||
      !beatWord ||
      prose.includes(beatWord);

    if (!hasCore || !hasBeat) {
      findings.push({
        severity: "block",
        code: "missed-earnings",
        message: isPost
          ? `최근 24시간 내 실적 결과(서프라이즈/미스) 미언급: ${ev.title} — bullets에 점검 맥락 1개 포함`
          : `48시간 내 실적 일정 미언급: ${ev.title} — bullets에 점검 맥락 1개 포함`,
      });
    }
  }

  const imminentMacro = snapshotEvents.filter((e) => {
    if (e.kind === "earnings" || !e.dateISO) return false;
    const t = new Date(e.dateISO).getTime();
    const hours = (t - now) / (60 * 60 * 1000);
    return hours >= 0 && hours <= 24 && e.level === "high";
  });
  for (const ev of imminentMacro) {
    const key = ev.title.split("(")[0]?.trim().slice(0, 6) ?? ev.id;
    if (key.length >= 2 && !prose.includes(key) && !prose.includes(ev.id.toUpperCase())) {
      findings.push({
        severity: "warn",
        code: "missed-macro-event",
        message: `24시간 내 고위험 매크로 일정 약함: ${ev.title}`,
      });
    }
  }

  return {
    ok: findings.every((f) => f.severity !== "block"),
    findings,
  };
}

/** 장중 리프레시용 — 브리핑만 검사. 동결된 시나리오·점검 경고는 무시 */
export function runBriefingOnlyGuard(input: {
  snapshot: CollectorSnapshot;
  briefing: BriefingDraft;
  frozenDecision: DecisionDraft;
  scope?: MarketScope;
}): GuardReport {
  const ignored = new Set([
    "scenario-count",
    "scenario-summary-long",
    "scenario-implication-long",
    "checklist-count",
    "check-why-long",
    "empty-checklist",
  ]);
  const report = runGuard({
    snapshot: input.snapshot,
    briefing: input.briefing,
    decision: input.frozenDecision,
    scope: input.scope,
  });
  const findings = report.findings.filter((f) => {
    if (ignored.has(f.code)) return false;
    const fromFrozen = input.frozenDecision.scenarios.some(
      (s) =>
        f.message.includes(s.title.slice(0, 12)) ||
        f.message.includes(s.summary.slice(0, 12)) ||
        f.message.includes(s.implication.slice(0, 12)),
    );
    return !fromFrozen;
  });
  return {
    ok: findings.every((f) => f.severity !== "block"),
    findings,
  };
}

export const GUARD_SYSTEM_PROMPT = `당신은 증시 브리핑의 Guard Agent다.
숫자 복창, 공허한 브리핑, 추천/예측 톤, 탭 초점 이탈(scope-leakage), 사실 불일치를 차단한다.`;
