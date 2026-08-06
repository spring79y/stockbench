/**
 * Non-LLM beat/miss resolution for earnings.
 * Prefer omit / 미확인 over a wrong 서프라이즈·미스 label.
 *
 * Product rule: qualitative 서프라이즈/미스 only when dual-source agrees
 * (matched quarterly print + same-quarter calendar estimate). Thin Yahoo-only
 * path (post-print rolled calendar, missing calendar) → numbers only, no label.
 * Guidance soft ≠ EPS miss — we never invent polarity from market narrative.
 */

export type BeatLabel = "서프라이즈" | "미스";

export type BeatResolutionReason =
  | "ok"
  | "missing"
  | "inline"
  | "sign-conflict"
  | "estimate-conflict"
  | "thin-source";

export type BeatResolution = {
  beatLabel?: BeatLabel;
  /** Signed % vs estimate; only set when comparison is unambiguous AND labeled */
  surprisePct?: number;
  reason: BeatResolutionReason;
};

const REL_EPS = 1e-6;
const ABS_EPS = 1e-9;

export function parseFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function nearlyEqual(a: number, b: number, relTol = 0.02, absTol = 0.05): boolean {
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), ABS_EPS);
  return diff / scale <= relTol;
}

/** True when calendar consensus already matches next-quarter estimate (rolled). */
export function isConsensusLikelyRolledForward(input: {
  calendarEpsAvg?: number | null;
  currentQuarterEstimate?: number | null;
  reportedQuarterEstimate?: number | null;
}): boolean {
  const cal = parseFiniteNumber(input.calendarEpsAvg);
  const next = parseFiniteNumber(input.currentQuarterEstimate);
  const reported = parseFiniteNumber(input.reportedQuarterEstimate);
  if (cal == null || next == null) return false;
  if (!nearlyEqual(cal, next, 0.005, 0.01)) return false;
  if (reported != null && nearlyEqual(cal, reported, 0.05, 0.05)) return false;
  return true;
}

export function computeSurprisePct(actual: number, estimate: number): number | undefined {
  if (!Number.isFinite(actual) || !Number.isFinite(estimate)) return undefined;
  if (Math.abs(estimate) < ABS_EPS) return undefined;
  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

function labelFromDiff(actual: number, estimate: number): BeatLabel | "inline" | undefined {
  if (!Number.isFinite(actual) || !Number.isFinite(estimate)) return undefined;
  const diff = actual - estimate;
  const scale = Math.max(Math.abs(estimate), Math.abs(actual), ABS_EPS);
  if (Math.abs(diff) <= Math.max(ABS_EPS, scale * REL_EPS) || Math.abs(diff) < 1e-4) {
    return "inline";
  }
  return diff > 0 ? "서프라이즈" : "미스";
}

/**
 * Resolve EPS beat/miss only when unambiguous AND dual-sourced.
 * - Both actual + estimate required
 * - Near-equality → no label (inline)
 * - Yahoo surprisePct sign must agree when provided
 * - Same-quarter altEstimate (calendar) required — thin Yahoo quarterly-only → omit
 * - altEstimate must not flip polarity vs primary
 */
export function resolveEarningsBeat(input: {
  epsActual: number | null | undefined;
  epsEstimate: number | null | undefined;
  yahooSurprisePct?: number | null | undefined;
  /**
   * Same-quarter calendar estimate. Omit when rolled to next quarter.
   * Required for a qualitative beatLabel (dual-source rule).
   */
  altEstimate?: number | null | undefined;
}): BeatResolution {
  const actual = parseFiniteNumber(input.epsActual);
  const estimate = parseFiniteNumber(input.epsEstimate);
  if (actual == null || estimate == null) {
    return { reason: "missing" };
  }

  const primary = labelFromDiff(actual, estimate);
  if (primary == null) return { reason: "missing" };
  if (primary === "inline") return { reason: "inline" };

  const yahoo = parseFiniteNumber(input.yahooSurprisePct);
  if (yahoo != null) {
    const yahooSign = yahoo > REL_EPS ? 1 : yahoo < -REL_EPS ? -1 : 0;
    const primarySign = primary === "서프라이즈" ? 1 : -1;
    if (yahooSign === 0) return { reason: "inline" };
    if (yahooSign !== primarySign) {
      return { reason: "sign-conflict" };
    }
  }

  const alt = parseFiniteNumber(input.altEstimate);
  // Dual-source: without a same-quarter calendar cross-check, omit polarity.
  // Post-print Yahoo often rolls calendar to next-q; EPS-beat vs guidance-soft diverge.
  if (alt == null) {
    return { reason: "thin-source" };
  }

  if (!nearlyEqual(alt, estimate, 0.05, 0.05)) {
    const altLabel = labelFromDiff(actual, alt);
    if (altLabel === "inline") {
      return { reason: "estimate-conflict" };
    }
    if (altLabel != null && altLabel !== primary) {
      return { reason: "estimate-conflict" };
    }
  }

  const surprisePct =
    yahoo != null && Number.isFinite(yahoo)
      ? yahoo
      : computeSurprisePct(actual, estimate);

  return {
    beatLabel: primary,
    surprisePct: surprisePct != null && Number.isFinite(surprisePct) ? surprisePct : undefined,
    reason: "ok",
  };
}

export function earningsResultOneLiner(
  beatLabel: BeatLabel | undefined,
  opts?: {
    epsActual?: number;
    epsEstimate?: number;
    region?: "KR" | "US";
  },
): string {
  const formatEps = (v: number) => {
    if (opts?.region === "KR") return `${Math.round(v).toLocaleString("ko-KR")}원`;
    return `$${Number(v.toFixed(2))}`;
  };
  const nums =
    opts?.epsActual != null &&
    opts?.epsEstimate != null &&
    Number.isFinite(opts.epsActual) &&
    Number.isFinite(opts.epsEstimate)
      ? `EPS ${formatEps(opts.epsActual)} vs 예상 ${formatEps(opts.epsEstimate)}`
      : null;

  if (!beatLabel) {
    return nums
      ? `발표됨 · ${nums} · 판정 보류 (점검용 · 매매 신호 아님)`
      : "발표됨 · 판정 보류 (점검용 · 매매 신호 아님)";
  }
  return nums
    ? `발표 결과: EPS 컨센서스 대비 ${beatLabel} (${nums}) — 점검용 (매매 신호 아님)`
    : `발표 결과: EPS 컨센서스 대비 ${beatLabel} — 점검용 (매매 신호 아님)`;
}
