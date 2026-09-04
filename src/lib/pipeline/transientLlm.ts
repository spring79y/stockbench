/** Transient host LLM outages we will retry. Quota / 404 / Guard hard-blocks are not. */

export const TRANSIENT_RETRY_INTERVAL_MS = 30_000;
/** Stop before catch-up (+45m). Morning/noon run two slots in one job. */
export const TRANSIENT_RETRY_BUDGET_MS = 12 * 60 * 1000;
export const TRANSIENT_RETRY_MAX_ATTEMPTS = 20;

export function isTransientLlmFailure(
  findings: Array<{ code?: string; message: string }>,
): boolean {
  const blob = findings.map((f) => `${f.code ?? ""} ${f.message}`).join("\n");
  if (!blob) return false;
  if (
    /Gemini error 429|LLM error 429|RESOURCE_EXHAUSTED|quota exceeded|credit balance is too low/i.test(
      blob,
    )
  ) {
    return false;
  }
  if (/Gemini error 404|LLM error 404|NO_LLM_KEY/i.test(blob)) return false;
  return /Gemini error 503|LLM error 503|Gemini error timeout|LLM error timeout|UNAVAILABLE|high demand/i.test(
    blob,
  );
}

export function shouldRetryTransientKeepPrevious(input: {
  tabFrozen: boolean;
  hardBlockCodes: string[];
  findings: Array<{ code?: string; message: string }>;
  elapsedMs: number;
  attempt: number;
}): boolean {
  if (!input.tabFrozen) return false;
  if (input.hardBlockCodes.length > 0) return false;
  if (input.elapsedMs >= TRANSIENT_RETRY_BUDGET_MS) return false;
  if (input.attempt >= TRANSIENT_RETRY_MAX_ATTEMPTS) return false;
  return isTransientLlmFailure(input.findings);
}
