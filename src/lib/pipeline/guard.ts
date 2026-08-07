import {
  contextNewsSuggestsPrinted,
  hasStructuredEarningsActual,
  isEarningsAnnounced,
  isEarningsSameKstDay,
  isPendingResultOneLiner,
} from "@/lib/market/earningsAnnounced";
import { EARNINGS_BRIDGE_SYMBOLS } from "@/lib/market/earningsBridge";
import {
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
} from "@/lib/market/retailScan";
import {
  forceCiteTokens,
  type CarryForwardItem,
} from "@/lib/pipeline/carryForward";
import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  GuardFinding,
  GuardReport,
  MarketScope,
} from "@/lib/pipeline/types";
import type { MarketEvent } from "@/lib/types";

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
  /투자자\s*주의/,
  /신중한\s*(대응|접근)/,
  /방향성\s*(을\s*)?지켜/,
  /불확실성\s*(이\s*)?(커|확대)/,
  /전반적으로\s*(혼조|관망|약세|강세)/,
];

/** 애널리스트 은어 — soft warn (설명 없이 나열할 때) */
const JARGON_WALL_PATTERNS = [
  /컨센서스(?!\s*(상회|하회|평균|예상))/,
  /리스크\s*온\b|리스크\s*오프\b|risk[\s-]?on|risk[\s-]?off/i,
  /포지셔닝/,
  /리레이팅/,
  /\b베타\b|\b알파\b/,
  /매크로\s*헤드라인/,
  /듀레이션/,
];

/** 재평가 문장 단서 — forceCite에 Evidence 사실이 있을 때 (막연한 「오늘」「관측」제외) */
const REEVAL_CUE_RE =
  /유지\s*(?:여부|되는지|됨|될)|깨졌|깨지|상회|하회|돌파|전환|발표됨|재평가|여전히|완화|확대|되밀|반등|현재\s*[+-]?\d|지금\s*[+-]?\d|대비\s*(?:위|아래|비슷)|vs\s*[\$₩]?\d/i;

/** 장중·점검 슬롯에서 장후/개장 예측 톤 */
const MID_SLOT_WRONG_TONE_RE =
  /(?:마감\s*정리|세션\s*리캡|오늘\s*장을\s*마감)|(?:개장\s*(?:예상|전망)|강세\s*출발|약세\s*출발)/;

const KR_LEAK_RE = /코스피|코스닥|KS200|코스피200|국내\s*(증시|시장|수급)|외국인\s*순매/;
const US_LEAK_RE = /나스닥|S&P|다우|미\s*증시|미\s*장|뉴욕\s*증시/;
const PRE_SESSION_FORECAST_PATTERNS = [
  /(?:출발|개장|장\s*시작)\s*(?:예고|예상|전망)/,
  /(?:상승|하락|강세|약세)\s*(?:출발|개장)/,
  /(?:출발|개장)\s*(?:상승|하락|강세|약세)/,
];
const PRIOR_SESSION_ANCHOR_RE =
  /전일|전\s*거래일|직전\s*(?:장|거래일|세션)?|어제|마감|전\s*세션|직전\s*정규장/;
/** 직전 세션 결과처럼 보이는 수치 복창 (관측 임계치는 제외) */
const PRIOR_SESSION_NUMERIC_RE =
  /(?:(?:코스피|코스닥|나스닥|S&P|다우)[^.!?]{0,24}[+-]?\d+(?:\.\d+)?%|외국인[^.!?]{0,28}\d+(?:\.\d+)?\s*(?:조|억)[^.!?]{0,12}순매(?:수|도)|시총[^.!?]{0,30}(?:평균|상위)[^.!?]{0,20}\d+(?:\.\d+)?%)/;
const PRIOR_RESULT_VERB_RE =
  /상승(?:했|한|으로)?|하락(?:했|한|으로)?|올랐|내렸|급등|급락|순매수|순매도|강세|약세/;
const FORWARD_REFERENCE_RE = /야간선물|오버나잇|프리마켓|애프터마켓/;
const CONDITIONAL_REFERENCE_RE = /참고|조건|경우|시사|브릿지/;
const OBSERVABLE_WATCH_RE =
  /관측|지켜볼|볼\s*(?:것|포인트|틀)|유지\s*(?:여부|되는지)|반응|발표\s*전후|상회|하회|돌파|전환|확인|여부|임계|기준선/;
const THRESHOLD_WATCH_RE =
  /이상\s*(?:유지|여부)|이하\s*(?:유지|여부)|하회|상회|유지\s*여부|관측|점검/;
const SESSION_RECAP_RE = /오늘|금일|장중|마감|세션|정규장/;

const INDEX_LABEL_TO_ID: Array<{ re: RegExp; id: string }> = [
  { re: /코스피(?!\s*200)|KOSPI/i, id: "kospi" },
  { re: /코스닥|KOSDAQ/i, id: "kosdaq" },
  { re: /나스닥|NASDAQ/i, id: "nasdaq" },
  { re: /S\s*&\s*P|S&P/i, id: "sp500" },
  { re: /다우|DOW/i, id: "dow" },
  { re: /반도체|SOX/i, id: "sox" },
];

function nearlyEqual(a: number, b: number, eps = 0.25): boolean {
  return Math.abs(a - b) <= eps;
}

function extractPctNearLabel(text: string, labelRe: RegExp): number | null {
  const source = text.replace(/−/g, "-");
  const match = source.match(
    new RegExp(
      `(?:${labelRe.source})[^0-9+\\-]{0,24}([+-]?\\d+(?:\\.\\d+)?)\\s*%`,
      "i",
    ),
  );
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** 전일 라벨 + 장중 수치 둔갑 차단 */
function pushPriorLabelMismatchFindings(
  findings: GuardFinding[],
  snapshot: CollectorSnapshot,
  texts: string[],
) {
  if (snapshot.slot !== "kr-pre" && snapshot.slot !== "us-pre") return;

  for (const text of texts) {
    if (!PRIOR_SESSION_ANCHOR_RE.test(text)) continue;
    for (const { re, id } of INDEX_LABEL_TO_ID) {
      if (!re.test(text)) continue;
      const quoted = extractPctNearLabel(text, re);
      if (quoted == null) continue;
      const idx = snapshot.indexes.find((q) => q.id === id);
      if (!idx) continue;
      const prior = idx.priorSessionChangePercent;
      const live = idx.changePercent;
      const basis = idx.changeBasis ?? "unknown";

      if (
        prior != null &&
        (basis === "intraday" || basis === "premarket" || basis === "postmarket") &&
        nearlyEqual(quoted, live) &&
        !nearlyEqual(quoted, prior)
      ) {
        findings.push({
          severity: "block",
          code: "prior-label-mismatch",
          message:
            `전일 라벨에 장중/현재 수치 둔갑: "${text.slice(0, 56)}" ` +
            `(${idx.name} 인용 ${quoted}% ≈ 현재 ${live}%, 전일세션 ${prior}%). ` +
            "전일 요약은 전일세션마감 숫자만 사용.",
        });
      } else if (
        prior != null &&
        PRIOR_RESULT_VERB_RE.test(text) &&
        !nearlyEqual(quoted, prior) &&
        Math.abs(quoted - prior) >= 1.0
      ) {
        // 전일 결과로 서술했는데 전일세션과 크게 어긋남
        findings.push({
          severity: "block",
          code: "prior-session-fact-mismatch",
          message:
            `전일 세션 사실 불일치: "${text.slice(0, 56)}" ` +
            `(${idx.name} 인용 ${quoted}% vs 전일세션 ${prior}%).`,
        });
      }
    }
  }
}

function looksLikeUnanchoredPriorResult(text: string): boolean {
  if (!PRIOR_SESSION_NUMERIC_RE.test(text)) return false;
  if (PRIOR_SESSION_ANCHOR_RE.test(text)) return false;
  // 오늘 관측 임계치·유지 여부는 전일 복창이 아님
  if (OBSERVABLE_WATCH_RE.test(text) || THRESHOLD_WATCH_RE.test(text)) return false;
  const isConditionalForwardReference =
    FORWARD_REFERENCE_RE.test(text) && CONDITIONAL_REFERENCE_RE.test(text);
  if (isConditionalForwardReference) return false;
  // 결과 서술 동사가 없으면(단순 임계치 나열) 스킵
  return PRIOR_RESULT_VERB_RE.test(text);
}

function pushPreSessionTemporalFindings(
  findings: GuardFinding[],
  slot: CollectorSnapshot["slot"],
  forecastTexts: string[],
  priorDataTexts: string[],
) {
  if (slot !== "kr-pre" && slot !== "us-pre") return;

  if (!forecastTexts.some((text) => PRIOR_SESSION_ANCHOR_RE.test(text))) {
    findings.push({
      severity: "block",
      code: "pre-missing-prior-recap",
      message:
        "장전 브리핑에 직전 세션 요약이 없음. 전일/전 거래일/직전 마감 앵커를 넣어 핵심 상황을 짧게 요약.",
    });
  }
  if (!priorDataTexts.some((text) => OBSERVABLE_WATCH_RE.test(text))) {
    findings.push({
      severity: "block",
      code: "pre-missing-observable-watch",
      message:
        "장전 브리핑에 오늘 관측할 신호가 없음. 유지 여부·반응·상회/하회·전환 등 구체 신호를 불릿에 추가.",
    });
  }

  for (const text of forecastTexts) {
    if (PRE_SESSION_FORECAST_PATTERNS.some((pattern) => pattern.test(text))) {
      findings.push({
        severity: "block",
        code: "pre-session-forecast",
        message:
          `장전 브리핑에 개장 방향 예측 표현 금지: "${text.slice(0, 56)}". ` +
          "전일 수치는 전일 마감 사실로만 표기.",
      });
    }
  }

  for (const text of priorDataTexts) {
    if (looksLikeUnanchoredPriorResult(text)) {
      findings.push({
        severity: "block",
        code: "prior-session-without-anchor",
        message:
          `장전 브리핑의 지수·수급·시총 숫자에 전일 시점 표시 없음: "${text.slice(0, 56)}". ` +
          "'전일/전 거래일/직전 마감/마감 기준'을 같은 문장에 명시.",
      });
    }
  }
}

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

function earningsNameCore(ev: MarketEvent): string {
  return ev.title
    .replace(/\s*실적\s*발표$/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 회사 식별용 토큰만 — '실적/어닝' 같은 일반어는 제외 (다른 종목 언급으로 오인 방지) */
function earningsIdentityTokens(ev: MarketEvent): string[] {
  const nameCore = earningsNameCore(ev);
  const aliases = nameCore
    .split(/[\s·/,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const symbol = ev.symbol ?? "";
  const symbolBase = symbol.replace(/\.(KS|KQ)$/i, "");
  const mega = [...MEGA_CAP_CANDIDATES_KR, ...MEGA_CAP_CANDIDATES_US].find(
    (c) => c.id === ev.megaCapId || c.symbol === ev.symbol,
  );
  const bridge = EARNINGS_BRIDGE_SYMBOLS.find(
    (b) => b.id === ev.bridgeId || b.symbol === ev.symbol,
  );
  return [
    ...new Set(
      [
        nameCore,
        ...aliases,
        symbol,
        symbolBase,
        mega?.name,
        ...(mega?.newsTerms ?? []),
        bridge?.name,
        ...(bridge?.newsTerms ?? []),
      ].filter((t): t is string => Boolean(t && t.length >= 2)),
    ),
  ];
}

function proseMentionsEarningsIdentity(
  prose: string,
  proseLower: string,
  ev: MarketEvent,
): boolean {
  return earningsIdentityTokens(ev).some((t) =>
    /[A-Za-z]/.test(t) ? proseLower.includes(t.toLowerCase()) : prose.includes(t),
  );
}

function hasEarningsActualNumbers(ev: MarketEvent): boolean {
  return hasStructuredEarningsActual(ev.actual);
}

/**
 * Never label as 「임박」 when structured actual, pending oneLiner,
 * or same-KST-day announced status is already known.
 */
function mustNotSayImminentEarnings(ev: MarketEvent, now: Date): boolean {
  if (hasStructuredEarningsActual(ev.actual)) return true;
  if (isPendingResultOneLiner(ev.oneLiner)) return true;
  if (!ev.dateISO) return false;
  return (
    isEarningsSameKstDay(ev.dateISO, now) && isEarningsAnnounced(ev, now)
  );
}

function isImminentEarningsWindow(
  ev: MarketEvent,
  now: number,
): { ok: boolean; isPost: boolean } {
  if (ev.kind !== "earnings" || !ev.dateISO) return { ok: false, isPost: false };
  const nowDate = new Date(now);
  const hours = (new Date(ev.dateISO).getTime() - now) / (60 * 60 * 1000);
  const sameDay = isEarningsSameKstDay(ev.dateISO, nowDate);
  const announced = isEarningsAnnounced(ev, nowDate);
  const hasActual = hasStructuredEarningsActual(ev.actual);
  const withinPostHorizon =
    sameDay ||
    (hours < 0 && hours >= -36) ||
    (hours >= 0 && hours <= 12 && announced) ||
    (hasActual && hours >= -36 && hours <= 48);

  // Post: structured actual, pending aggregation, or same-day news already printed.
  const isPost =
    (announced && withinPostHorizon) ||
    (hasActual && (sameDay || (hours >= -36 && hours <= 48)));
  const isPre = !isPost && hours >= 0 && hours <= 48;
  return { ok: isPre || isPost, isPost };
}

function formatOpRevenueActualCue(ev: MarketEvent): string | null {
  const a = ev.actual;
  if (!a) return null;
  const parts: string[] = [];
  if (a.revenueActualLabel) parts.push(`매출 ${a.revenueActualLabel}`);
  if (a.operatingProfitActualLabel) {
    parts.push(`영업이익 ${a.operatingProfitActualLabel}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Guard patch bullet for one earnings event — never 「임박」 once announced. */
export function buildEarningsPatchBullet(ev: MarketEvent, now: number = Date.now()): string {
  const nameCore = earningsNameCore(ev);
  const nowDate = new Date(now);
  const news = hasEarningsContextNews(ev);
  const postish =
    mustNotSayImminentEarnings(ev, nowDate) || isPostEarningsResult(ev, now);

  if (postish) {
    if (ev.actual?.beatLabel) {
      return `${nameCore} 실적 발표됨 · 결과(주당순이익 ${ev.actual.beatLabel}) — 섹터 온도 점검용 (방향 예측 금지)`;
    }
    if (ev.actual?.epsActual != null && ev.actual?.epsEstimate != null) {
      const a = ev.actual.epsActual;
      const est = ev.actual.epsEstimate;
      const region = ev.region === "KR" ? "KR" : "US";
      const fmt = (v: number) =>
        region === "KR"
          ? `${Math.round(v).toLocaleString("ko-KR")}원`
          : `$${Number(v.toFixed(2))}`;
      if (news) {
        return `${nameCore} 실적 발표됨 · 주당순이익(EPS) ${fmt(a)} vs 예상 ${fmt(est)} — Evidence뉴스 반응·가이던스 점검 (서프라이즈/미스 단정 금지)`;
      }
      return `${nameCore} 실적 발표됨 · 주당순이익(EPS) ${fmt(a)} vs 예상 ${fmt(est)} — 반응 근거 부족`;
    }
    const opRev = formatOpRevenueActualCue(ev);
    if (opRev) {
      return news
        ? `${nameCore} 실적 발표됨 · ${opRev} — Evidence뉴스 반응·가이던스 점검 (방향 예측 금지)`
        : `${nameCore} 실적 발표됨 · ${opRev} — 결과/반응 점검`;
    }
    if (
      isPendingResultOneLiner(ev.oneLiner) ||
      contextNewsSuggestsPrinted(ev.contextNews)
    ) {
      return news
        ? `${nameCore} 실적 발표됨 · 결과/반응 점검 — Evidence뉴스 참고 (숫자 창작 금지)`
        : `${nameCore} 실적 발표됨 · 결과/반응 점검 — 반응 근거 부족`;
    }
    return `${nameCore} 실적 발표됨 · 결과/반응 점검`;
  }

  if (news) {
    return `${nameCore} 실적 임박 — Evidence뉴스 참고해 가이던스·섹터 맥락만 짧게 (방향 예측 금지)`;
  }
  return `${nameCore} 실적 발표 임박 — 섹터 온도 점검만 (가이던스 추측·방향 예측 금지)`;
}

/** Rewrite false 「실적 임박」 when Evidence already shows announced. */
export function scrubFalseImminentEarningsLabels(
  briefing: BriefingDraft,
  snapshot: CollectorSnapshot,
  scope: MarketScope = "all",
): BriefingDraft {
  const now = Date.now();
  const nowDate = new Date(now);
  const announced = (snapshot.events ?? []).filter(
    (e) =>
      e.kind === "earnings" &&
      earningsInScope(e, scope) &&
      mustNotSayImminentEarnings(e, nowDate),
  );
  if (announced.length === 0) return briefing;

  const rewrite = (text: string): string => {
    let out = text;
    for (const e of announced) {
      if (!/실적\s*(발표\s*)?임박/.test(out)) continue;
      const tokens = earningsIdentityTokens(e);
      const hit = tokens.some((t) =>
        /[A-Za-z]/.test(t) ? out.toLowerCase().includes(t.toLowerCase()) : out.includes(t),
      );
      if (!hit) continue;
      // Prefer full Evidence-grounded post line when the bullet is a patch-style 임박 line.
      if (/실적\s*(발표\s*)?임박\s*—/.test(out)) {
        out = buildEarningsPatchBullet(e, now);
        continue;
      }
      out = out.replace(/실적\s*발표\s*임박|실적\s*임박/g, "실적 발표됨 · 결과/반응 점검");
    }
    return out;
  };

  return {
    ...briefing,
    headline: rewrite(briefing.headline),
    bullets: briefing.bullets.map(rewrite),
  };
}

function isPostEarningsResult(ev: MarketEvent, now: number): boolean {
  return isImminentEarningsWindow(ev, now).isPost;
}

function earningsInScope(ev: MarketEvent, scope: MarketScope): boolean {
  if (scope === "us") return ev.region === "US" || ev.region === "GLOBAL";
  if (scope === "kr") return ev.region === "KR" || ev.region === "GLOBAL";
  return true;
}

function listImminentEarnings(
  events: MarketEvent[],
  now: number,
  scope: MarketScope,
): MarketEvent[] {
  return events.filter((e) => {
    const window = isImminentEarningsWindow(e, now);
    return window.ok && earningsInScope(e, scope);
  });
}

function continuityForScope(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
): CarryForwardItem[] {
  const continuity = snapshot.evidence?.previous.continuity;
  if (!continuity) return [];
  const block =
    continuity[scope] ??
    (scope === "all" ? continuity.kr ?? continuity.us : undefined);
  return block?.items ?? [];
}

/** due+Evidence 사실(forceCite) 누락 → hard fail · 키워드만 넣기(재평가 없음)도 hard fail */
function pushCarryForwardOmissionFindings(
  findings: GuardFinding[],
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  prose: string,
  proseLower: string,
  briefingTexts: string[],
) {
  const items = continuityForScope(snapshot, scope).filter((i) => i.forceCite);
  for (const item of items) {
    const tokens = forceCiteTokens(item);
    const hit = tokens.some((t) =>
      /[A-Za-z0-9]/.test(t) ? proseLower.includes(t.toLowerCase()) : prose.includes(t),
    );
    if (!hit) {
      findings.push({
        severity: "block",
        code: "carry-forward-omission",
        message:
          `due+Evidence 연속성 누락: "${item.priorText.slice(0, 40)}" ` +
          `(${item.evidenceFact?.slice(0, 48) ?? item.status}). ` +
          "현재 Evidence 사실로 재평가해 브리핑에 반영.",
      });
      continue;
    }

    // Token hit alone is not enough when we have an Evidence fact — need re-eval cue
    if (item.evidenceFact && item.evidenceFact.length >= 8) {
      const related = briefingTexts.filter((t) =>
        tokens.some((tok) =>
          /[A-Za-z0-9]/.test(tok)
            ? t.toLowerCase().includes(tok.toLowerCase())
            : t.includes(tok),
        ),
      );
      const factNums = [
        ...(item.evidenceFact.match(/[+-]?\d+\.\d+%?/g) ?? []),
        ...(item.evidenceFact.match(/\b\d{2,}%/g) ?? []),
      ].filter((n) => n.replace(/[+-]/, "").replace(/%$/, "").length >= 2);
      const hasFactNumber =
        factNums.length > 0 &&
        related.some((t) => factNums.some((n) => t.includes(n)));
      const hasStrongCue = related.some((t) => REEVAL_CUE_RE.test(t));
      const hasReeval =
        hasFactNumber ||
        (factNums.length === 0 && hasStrongCue);
      const parrotCore = item.priorText.replace(/\s+/g, " ").trim().slice(0, 20);
      const isParrot =
        parrotCore.length >= 12 &&
        related.some(
          (t) =>
            t.includes(parrotCore) &&
            !hasFactNumber &&
            !/현재|지금|여전히|깨졌|발표됨|재평가/.test(t),
        );
      if (!hasReeval || isParrot) {
        findings.push({
          severity: "block",
          code: "carry-forward-no-reeval",
          message:
            `forceCite를 키워드만 넣거나 복창함: "${item.priorText.slice(0, 36)}". ` +
            `Evidence「${item.evidenceFact.slice(0, 40)}」로 유지/깨짐/숫자 갱신 등 재평가 문장을 쓰세요.`,
        });
      }
    }
  }
}

const RESULT_CLAIM_RE =
  /서프라이즈|미스|어닝\s*비트|어닝\s*쇼크|컨센서스\s*(상회|하회)|예상\s*(상회|하회)/;
/** EPS 결과 극성 — 가이던스 실망을 실적 미스로 단정하는 표현 포함 */
const BEAT_CLAIM_RE =
  /서프라이즈|어닝\s*비트|컨센서스\s*상회|예상\s*상회/;
const MISS_CLAIM_RE =
  /어닝\s*쇼크|(?:어닝\s*)?미스|컨센서스\s*하회|예상\s*하회/;
/** 가이던스·전망 결과 단정 — Evidence contextNews 없이 쓰면 hard fail */
const GUIDANCE_CLAIM_RE =
  /가이던스\s*(?:를\s*)?(?:하회|상회|하향|상향|실망|미달|부진|양호|호조|컷|컷트)|가이딩\s*(?:컷|미스)|향후\s*(?:실적\s*)?전망\s*(?:하회|실망|부진|상향|하향)|어닝\s*콜\s*(?:실망|호조|부정|긍정)|guidance\s*(?:cut|miss|beat|soft|weak|raise|lower)|outlook\s*(?:cut|miss|beat|soft|weak)/i;
/** contextNews 헤드라인·스니펫에 가이던스·실망·가격 반응 테마가 있는지 */
const NEWS_GUIDANCE_THEME_RE =
  /가이던스|전망|guidance|outlook|disappoint|실망|하회|하향|soft\s*guidance|weak\s*guidance|어닝\s*콜|하락|급락|털렸|slip|fall|drop|slump/i;
/** 브리핑에 가이던스·전망·실망 요약을 썼는지 (뉴스 테마 있을 때 필수) */
const GUIDANCE_SUMMARY_CUE_RE =
  /가이던스|전망|guidance|outlook|실망|하회|하향|상향|어닝\s*콜|soft|weak|cut/i;
/** 가격·섹터 반응만 (가이던스 테마 없을 때) */
const PRICE_REACTION_CUE_RE =
  /반응|하락|상승|급락|급등|밀림|되밀림|주가|섹터/;

function hasEarningsContextNews(ev: MarketEvent): boolean {
  return Array.isArray(ev.contextNews) && ev.contextNews.length > 0;
}

function contextNewsHasGuidanceTheme(ev: MarketEvent): boolean {
  if (!hasEarningsContextNews(ev)) return false;
  return ev.contextNews!.some(
    (n) => NEWS_GUIDANCE_THEME_RE.test(n.title) || NEWS_GUIDANCE_THEME_RE.test(n.snippet),
  );
}

/** forceCite/mustCover 연속성 항목이 이 실적을 가리키는지 */
function earningsIsForceOrMustCover(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  ev: MarketEvent,
): boolean {
  const items = continuityForScope(snapshot, scope);
  if (items.length === 0) {
    // 연속성 없으면 라이브 due(구조화 숫자 또는 집계대기 + 뉴스)는 must-cover 급
    return (
      hasEarningsContextNews(ev) &&
      (hasEarningsActualNumbers(ev) ||
        isPendingResultOneLiner(ev.oneLiner) ||
        contextNewsSuggestsPrinted(ev.contextNews))
    );
  }
  return items.some((item) => {
    if (!item.forceCite && !item.mustCover) return false;
    const blob = `${item.priorText} ${item.evidenceFact ?? ""} ${item.note ?? ""}`;
    return proseMentionsEarningsIdentity(blob, blob.toLowerCase(), ev);
  });
}

function briefingHasEarningsReactionCue(
  relatedLines: string[],
  ev: MarketEvent,
): boolean {
  if (contextNewsHasGuidanceTheme(ev)) {
    // 뉴스에 가이던스·실망·하락 테마 → 「밀림/섹터」만으로는 부족, 가이던스·실망 요약 필요
    return relatedLines.some(
      (t) => GUIDANCE_CLAIM_RE.test(t) || GUIDANCE_SUMMARY_CUE_RE.test(t),
    );
  }
  return relatedLines.some(
    (t) =>
      GUIDANCE_CLAIM_RE.test(t) ||
      GUIDANCE_SUMMARY_CUE_RE.test(t) ||
      PRICE_REACTION_CUE_RE.test(t),
  );
}

/** Evidence 없는 실적 결과 단정 → hard fail */
function pushInventedResultFindings(
  findings: GuardFinding[],
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  briefingTexts: string[],
) {
  const claimed = briefingTexts.filter((t) => RESULT_CLAIM_RE.test(t));
  if (claimed.length === 0) return;

  const events = (snapshot.events ?? []).filter((e) => earningsInScope(e, scope));
  const now = Date.now();
  for (const text of claimed) {
    const hasEvidenceResult = events.some((ev) => {
      // Only beatLabel counts as supported result claim — numbers alone ≠ 서프라이즈/미스.
      if (!ev.actual?.beatLabel || !ev.dateISO) return false;
      const hours = (new Date(ev.dateISO).getTime() - now) / (60 * 60 * 1000);
      if (hours >= 0 || hours < -48) return false;
      return proseMentionsEarningsIdentity(text, text.toLowerCase(), ev);
    });
    if (!hasEvidenceResult) {
      findings.push({
        severity: "block",
        code: "invented-event-result",
        message:
          `Evidence에 없는 실적/이벤트 결과 단정: "${text.slice(0, 56)}". ` +
          "beatLabel 없으면 숫자·뉴스만 인용하거나 생략 (서프라이즈/미스 창작 금지).",
      });
    }
  }
}

/**
 * LLM이 Evidence beatLabel을 뒤집거나, 미확인 건에 결과 단어를 붙이면 hard fail.
 * Numbers/beatLabel은 Collector Evidence만 — LLM 창작·극성 반전 금지.
 * 숫자+contextNews 이중 서술(가이던스 반응)은 허용하되, beatLabel 없는 서프라이즈/미스 단정은 계속 block.
 */
function pushBeatPolarityFindings(
  findings: GuardFinding[],
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  briefingTexts: string[],
) {
  const events = (snapshot.events ?? []).filter((e) => earningsInScope(e, scope));
  const now = Date.now();

  for (const ev of events) {
    if (ev.kind !== "earnings" || !ev.dateISO) continue;
    const hours = (new Date(ev.dateISO).getTime() - now) / (60 * 60 * 1000);
    if (hours >= 0 || hours < -48) continue;

    const related = briefingTexts.filter((t) =>
      proseMentionsEarningsIdentity(t, t.toLowerCase(), ev),
    );
    if (related.length === 0) continue;

    const beat = ev.actual?.beatLabel;
    for (const text of related) {
      if (!RESULT_CLAIM_RE.test(text)) continue;

      if (!beat) {
        findings.push({
          severity: "block",
          code: "unsupported-earnings-result",
          message:
            `실적 결과 라벨 없이 서프라이즈/미스 단정: "${text.slice(0, 56)}" (${ev.title}). ` +
            "beatLabel 없으면 숫자 인용 + (contextNews 있을 때) 가이던스·반응만. 극성 단정 금지.",
        });
        continue;
      }

      const claimsBeat = BEAT_CLAIM_RE.test(text);
      const claimsMiss = MISS_CLAIM_RE.test(text);
      if (beat === "서프라이즈" && claimsMiss && !claimsBeat) {
        findings.push({
          severity: "block",
          code: "earnings-beat-polarity",
          message:
            `Evidence는 서프라이즈인데 미스 서술: "${text.slice(0, 56)}" (${ev.title}).`,
        });
      }
      if (beat === "미스" && claimsBeat && !claimsMiss) {
        findings.push({
          severity: "block",
          code: "earnings-beat-polarity",
          message:
            `Evidence는 미스인데 서프라이즈 서술: "${text.slice(0, 56)}" (${ev.title}).`,
        });
      }
    }
  }
}

/**
 * 가이던스·전망 결과 단정은 Evidence contextNews가 있을 때만.
 * 뉴스 없으면 문장 생략이 기본 — 톤 추측 금지.
 */
function pushUnsupportedGuidanceFindings(
  findings: GuardFinding[],
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  briefingTexts: string[],
) {
  const claimed = briefingTexts.filter((t) => GUIDANCE_CLAIM_RE.test(t));
  if (claimed.length === 0) return;

  const events = (snapshot.events ?? []).filter((e) => earningsInScope(e, scope));
  const now = Date.now();

  for (const text of claimed) {
    const textLower = text.toLowerCase();
    const matchedEv = events.find((ev) => {
      if (ev.kind !== "earnings" || !ev.dateISO) return false;
      const hours = (new Date(ev.dateISO).getTime() - now) / (60 * 60 * 1000);
      if (hours > 48 || hours < -48) return false;
      return proseMentionsEarningsIdentity(text, textLower, ev);
    });

    if (!matchedEv) {
      // 회사 매칭 없이 가이던스 결과 단정 — 여전히 위험하면 block
      findings.push({
        severity: "block",
        code: "unsupported-guidance-claim",
        message:
          `Evidence 뉴스 없는 가이던스·전망 단정: "${text.slice(0, 56)}". ` +
          "contextNews 없으면 가이던스/반응 문장 생략.",
      });
      continue;
    }

    if (!hasEarningsContextNews(matchedEv)) {
      findings.push({
        severity: "block",
        code: "unsupported-guidance-claim",
        message:
          `가이던스 단정에 Evidence뉴스 없음: "${text.slice(0, 56)}" (${matchedEv.title}). ` +
          "contextNews 없으면 생략.",
      });
    }
  }
}

/** 직전 문구 과도 복창 — soft warn (취약하면 hard-fail 피함) */
function pushPriorParrotFindings(
  findings: GuardFinding[],
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  briefingTexts: string[],
) {
  const items = continuityForScope(snapshot, scope).filter(
    (i) => i.kind === "check" || i.kind === "scenario",
  );
  let parrotHits = 0;
  for (const item of items) {
    const prior = item.priorText.replace(/\s+/g, " ").trim();
    if (prior.length < 12) continue;
    const core = prior.slice(0, Math.min(28, prior.length));
    if (briefingTexts.some((t) => t.includes(core))) {
      parrotHits += 1;
    }
  }
  if (parrotHits >= 2) {
    findings.push({
      severity: "warn",
      code: "prior-phrase-parrot",
      message:
        `직전 연속성 문구를 ${parrotHits}건 거의 그대로 복창. ` +
        "현재 Evidence 숫자로 재평가한 문장으로 바꾸세요.",
    });
  }
}

function briefingChanged(a: BriefingDraft, b: BriefingDraft): boolean {
  return (
    a.headline !== b.headline ||
    a.bullets.length !== b.bullets.length ||
    a.bullets.some((bullet, i) => bullet !== b.bullets[i])
  );
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
  pushPreSessionTemporalFindings(
    findings,
    input.snapshot.slot,
    texts,
    briefingTexts,
  );
  pushPriorLabelMismatchFindings(findings, input.snapshot, briefingTexts);
  if (
    (input.snapshot.slot === "kr-post" || input.snapshot.slot === "us-post") &&
    !briefingTexts.some((text) => SESSION_RECAP_RE.test(text))
  ) {
    findings.push({
      severity: "block",
      code: "post-missing-session-recap",
      message:
        "장후 브리핑에 오늘 세션 리캡이 없음. 마감·장중·세션 결과와 주요 촉발 요인을 요약.",
    });
  }

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

  // Soft: jargon wall without plain-Korean gloss
  let jargonHits = 0;
  for (const text of briefingTexts) {
    for (const pattern of JARGON_WALL_PATTERNS) {
      if (pattern.test(text)) jargonHits += 1;
    }
  }
  if (jargonHits >= 2) {
    findings.push({
      severity: "warn",
      code: "jargon-wall",
      message:
        `애널리스트 은어가 ${jargonHits}회 감지. ` +
        "쉬운 한국어로 바꾸거나(예: 컨센서스→시장 평균 예상) 한 줄로 풀어서 쓰세요.",
    });
  }

  // Slot-wrong tone (mid/noon sounding like close-recap or open-forecast)
  const slot = input.snapshot.slot;
  if (slot === "kr-mid" || slot === "us-mid" || slot === "us-noon") {
    for (const text of briefingTexts) {
      if (MID_SLOT_WRONG_TONE_RE.test(text)) {
        findings.push({
          severity: "block",
          code: "slot-tone-mismatch",
          message:
            `장중·점검 슬롯에 장후 리캡/개장 예측 톤: "${text.slice(0, 48)}". ` +
            "관측 틀 갱신(지금까지 사실 + 남은 구간 신호)으로 다시 쓰세요.",
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
  const imminentEarnings = listImminentEarnings(input.snapshot.events ?? [], now, scope);
  const proseLower = prose.toLowerCase();
  for (const ev of imminentEarnings) {
    const nameCore = earningsNameCore(ev);
    const isPost = isPostEarningsResult(ev, now);
    const beatWord = ev.actual?.beatLabel;
    const hasCore = proseMentionsEarningsIdentity(prose, proseLower, ev);
    const hasBeat = !isPost || !beatWord || prose.includes(beatWord);

    if (!hasCore || !hasBeat) {
      findings.push({
        severity: "block",
        code: "missed-earnings",
        message: isPost
          ? beatWord
            ? `최근 24시간 내 실적 결과(서프라이즈/미스) 미언급: ${ev.title} — bullets에 '${nameCore} 실적' 점검 맥락 1개 포함`
            : `최근 24시간 내 실적 발표 점검 미언급: ${ev.title} — bullets에 '${nameCore} 실적' 숫자·반응 맥락 1개 포함 (극성 단정 금지)`
          : `48시간 내 실적 일정 미언급: ${ev.title} — bullets에 '${nameCore} 실적' 점검 맥락 1개 포함 (예측 금지)`,
      });
    }
  }

  // due 실적에 (숫자|집계대기)+뉴스가 있는데 반응·가이던스 요약이 없으면
  // forceCite/mustCover(또는 연속성 없는 라이브 due) → hard fail / warn
  for (const ev of imminentEarnings) {
    if (!isPostEarningsResult(ev, now)) continue;
    const hasNews = hasEarningsContextNews(ev);
    const hasFacts =
      hasEarningsActualNumbers(ev) ||
      isPendingResultOneLiner(ev.oneLiner) ||
      contextNewsSuggestsPrinted(ev.contextNews);
    if (!hasFacts || !hasNews) continue;
    if (!proseMentionsEarningsIdentity(prose, proseLower, ev)) continue;
    const related = [input.briefing.headline, ...input.briefing.bullets].filter((t) =>
      proseMentionsEarningsIdentity(t, t.toLowerCase(), ev),
    );
    if (briefingHasEarningsReactionCue(related, ev)) continue;
    const hard = earningsIsForceOrMustCover(input.snapshot, scope, ev);
    const needsGuidance = contextNewsHasGuidanceTheme(ev);
    const pendingOnly =
      !hasEarningsActualNumbers(ev) &&
      (isPendingResultOneLiner(ev.oneLiner) || contextNewsSuggestsPrinted(ev.contextNews));
    findings.push({
      severity: hard ? "block" : "warn",
      code: "earnings-reaction-omission",
      message: pendingOnly
        ? `발표됨·결과 집계 대기 + Evidence뉴스인데 가이던스/반응 요약 누락: ${ev.title}. ` +
          "API 숫자 창작 금지 · Evidence뉴스로 결과·반응 1불릿 필수."
        : needsGuidance
          ? `숫자+Evidence뉴스(가이던스·반응) 있는데 가이던스/실망 요약 누락: ${ev.title}. ` +
            "Briefing이 숫자+가이던스·시장 반응 이중 서술을 1불릿에 넣을 것."
          : `숫자+Evidence뉴스 있는데 반응·가이던스 요약 누락: ${ev.title}. ` +
            "Briefing이 숫자+뉴스 이중 서술을 1불릿에 넣을 것.",
    });
  }

  pushCarryForwardOmissionFindings(
    findings,
    input.snapshot,
    scope,
    prose,
    proseLower,
    briefingTexts,
  );
  // Scan briefing + decision: LLM must not re-assert 서프라이즈/미스 without Evidence beatLabel.
  pushInventedResultFindings(findings, input.snapshot, scope, texts);
  pushBeatPolarityFindings(findings, input.snapshot, scope, texts);
  pushUnsupportedGuidanceFindings(findings, input.snapshot, scope, texts);
  pushPriorParrotFindings(findings, input.snapshot, scope, briefingTexts);

  const snapshotEvents = input.snapshot.events ?? [];
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

/** Guard 재시도 후에도 실적이 빠지면 점검 불릿을 최소 보강 */
export function ensureImminentEarningsMentioned(
  briefing: BriefingDraft,
  snapshot: CollectorSnapshot,
  scope: MarketScope = "all",
): BriefingDraft {
  const now = Date.now();
  const scrubbed = scrubFalseImminentEarningsLabels(briefing, snapshot, scope);
  const prose = [scrubbed.headline, ...scrubbed.bullets].join("\n");
  const proseLower = prose.toLowerCase();
  const missing = listImminentEarnings(snapshot.events ?? [], now, scope).filter((e) => {
    const hasCore = proseMentionsEarningsIdentity(prose, proseLower, e);
    const beatWord = e.actual?.beatLabel;
    const needsBeat = isPostEarningsResult(e, now) && Boolean(beatWord);
    const hasBeat = !needsBeat || (beatWord != null && prose.includes(beatWord));
    return !hasCore || !hasBeat;
  });

  if (missing.length === 0) return scrubbed;

  const extra = missing.slice(0, 2).map((e) => buildEarningsPatchBullet(e, now));

  return {
    ...scrubbed,
    // 실적 보강 불릿이 잘리지 않도록 자리를 확보 (최대 5)
    bullets: [...scrubbed.bullets.slice(0, Math.max(0, 5 - extra.length)), ...extra],
  };
}

/** 장전: 시점 없는 수치에 '전 거래일'을 기계적으로 붙이지 않음 — 장중 둔갑을 키움 */
export function ensurePriorSessionAnchored(briefing: BriefingDraft): BriefingDraft {
  return briefing;
}

/** 최종 재시도용 — 실적 누락만 보강. 전일 앵커 강제 삽입 금지(시점 둔갑 방지) */
export function patchBriefingForGuardRetry(
  briefing: BriefingDraft,
  snapshot: CollectorSnapshot,
  scope: MarketScope = "all",
): BriefingDraft {
  return ensureImminentEarningsMentioned(briefing, snapshot, scope);
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
숫자 복창, 공허한 브리핑, 추천/예측 톤, 탭 초점 이탈(scope-leakage), 사실 불일치,
due+Evidence 연속성 누락·재평가 없는 키워드만 넣기, Evidence 없는 결과 창작, 슬롯 톤 불일치를 차단한다.
Evidence beatLabel이 없으면 서프라이즈/미스/컨센서스 상회·하회를 단정하지 않는다 (숫자는 인용 가능).
Evidence contextNews+숫자가 있으면 숫자+가이던스/반응 이중 서술을 **필수**로 허용·요구한다. 뉴스 없으면 반응 풍부 서술 금지.
Evidence contextNews가 없으면 가이던스·전망 결과 문장을 쓰지 않는다.
숫자+뉴스인데 가이던스/실망/반응 요약을 빼면 earnings-reaction-omission(forceCite/mustCover 시 hard fail).
거절 사유는 findingsToRepairHints로 구체 수정 지시가 되어 다음 초안에 들어간다.`;

/**
 * Guard findings → 다음 LLM 초안용 구체 수정 지시.
 * 코드별 fix instruction을 앞에 두고 원문 메시지를 붙여, 재생성 시 무엇을 고칠지 명확히 한다.
 */
export function findingsToRepairHints(findings: GuardFinding[]): string[] {
  const FIX: Record<string, string> = {
    "recommendation-or-prediction":
      "추천·예측 톤 제거. 관측·조건부 해석만 (사라/팔라/반드시 오를 금지).",
    "empty-briefing":
      "공허 문장 삭제. 사실→왜→체감→관찰 패턴으로, 누가·무엇이·왜가 보이게 다시 쓰기.",
    "empty-checklist":
      "「확인한다」류 삭제. text=구체 트리거, why=A(기본)/B(주의) 분기 한 줄.",
    "number-restatement":
      "등락률 나열만으로 끝내지 말 것. 왜·체감·관찰을 한 문장에.",
    "scope-leakage":
      "탭 초점 이탈 수정. 해당 scope 시장이 헤드라인·불릿 과반. 상대 시장 ≤1불릿 브릿지.",
    "prior-label-mismatch":
      "전일 라벨에는 전일세션마감 숫자만. 장중/현재 수치를 전일로 쓰지 말 것.",
    "prior-session-fact-mismatch":
      "전일 세션 수치를 Evidence 전일세션마감과 맞출 것.",
    "pre-session-forecast":
      "개장·출발 예측 표현 삭제. 전일 사실 + 오늘 관측 신호로.",
    "pre-missing-prior-recap":
      "장전: 전일/전 거래일/직전 마감 앵커로 직전 세션 요약 1줄 추가.",
    "pre-missing-observable-watch":
      "장전: 유지 여부·반응·상회/하회·전환 등 오늘 관측 신호 불릿 추가.",
    "prior-session-without-anchor":
      "지수·수급·시총 숫자에 전일/직전 마감 시점 표시를 같은 문장에.",
    "post-missing-session-recap":
      "장후: 오늘 마감·장중·세션 결과와 촉발 요인 1개를 헤드라인/불릿에.",
    "carry-forward-omission":
      "forceCite due를 Evidence 사실로 브리핑에 반영 (생략 금지).",
    "carry-forward-no-reeval":
      "forceCite는 키워드만 넣지 말고 Evidence 숫자로 재평가 문장(유지/깨짐/발표됨 등).",
    "invented-event-result":
      "Evidence beatLabel 없는 서프라이즈/미스 창작 삭제. 숫자·뉴스만 또는 생략.",
    "unsupported-earnings-result":
      "beatLabel 없으면 극성 단정 금지. 숫자 인용 + (뉴스 있으면) 가이던스/반응만.",
    "earnings-beat-polarity":
      "Evidence beatLabel 극성을 뒤집어 쓰지 말 것. 라벨 그대로.",
    "unsupported-guidance-claim":
      "contextNews 없으면 가이던스·전망 결과 문장 생략.",
    "earnings-reaction-omission":
      "숫자+Evidence뉴스면 1불릿에 매출/주당순이익+예상대비 + 가이던스·반응 이중 서술.",
    "missed-earnings":
      "임박/직후 실적을 bullets에 회사명으로 1줄 점검 포함. Evidence에 발표됨·actual이면 「임박」 금지·「발표됨 · 결과/반응 점검」.",
    "slot-tone-mismatch":
      "이 슬롯 JOB에 맞는 톤으로. 장중·점검은 관측 틀 갱신(장후 리캡·개장 예측 금지).",
    "fact-mismatch":
      "지수 방향 서술을 Evidence 등락과 맞출 것.",
    "fx-mismatch":
      "환율 방향 서술을 Evidence dir과 맞출 것.",
    "evidence-missing":
      "없는 evidenceId 제거. 본문에 쓴 매크로 id만.",
    "scenario-count":
      "시나리오 A/B 정확히 2개.",
    "prior-phrase-parrot":
      "직전 연속성 문구 복창 금지. 현재 Evidence로 재평가한 새 문장.",
    "jargon-wall":
      "애널리스트 은어를 쉬운 한국어로(컨센서스→시장 평균 예상 등).",
  };

  const seen = new Set<string>();
  const hints: string[] = [];
  for (const f of findings) {
    if (f.severity !== "block" && f.code !== "prior-phrase-parrot" && f.code !== "jargon-wall") {
      continue;
    }
    const key = `${f.code}:${f.message.slice(0, 48)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fix = FIX[f.code] ?? "아래 거절 사유를 반영해 다시 작성.";
    hints.push(`[${f.code}] ${fix} | 상세: ${f.message}`);
  }
  return hints.slice(0, 12);
}
