import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRANSIENT_RETRY_BUDGET_MS,
  isTransientLlmFailure,
  shouldRetryTransientKeepPrevious,
} from "./transientLlm";

describe("isTransientLlmFailure", () => {
  it("retries Gemini 503 high demand", () => {
    assert.equal(
      isTransientLlmFailure([
        {
          code: "llm-seed-suppressed",
          message: '[us] Gemini error 503: "high demand"',
        },
      ]),
      true,
    );
  });

  it("retries Groq/OpenAI-compat 503", () => {
    assert.equal(
      isTransientLlmFailure([
        {
          code: "llm-seed-suppressed",
          message: "[kr] LLM error 503: over capacity",
        },
      ]),
      true,
    );
  });

  it("retries Groq OTPM 429 (rolling minute cap)", () => {
    assert.equal(
      isTransientLlmFailure([
        {
          code: "llm-seed-suppressed",
          message:
            "[kr] LLM error 429: output tokens per minute (OTPM): Limit 1000, Requested 1754. Please try again in 20s",
        },
      ]),
      true,
    );
  });

  it("does not retry 429 quota or 404", () => {
    assert.equal(
      isTransientLlmFailure([
        { code: "llm-seed-suppressed", message: "Gemini error 429: quota" },
      ]),
      false,
    );
    assert.equal(
      isTransientLlmFailure([
        { code: "llm-seed-suppressed", message: "LLM error 429: tokens per day (TPD) exceeded" },
      ]),
      false,
    );
  });
});

describe("shouldRetryTransientKeepPrevious", () => {
  it("retries frozen tab on 503 within budget", () => {
    assert.equal(
      shouldRetryTransientKeepPrevious({
        tabFrozen: true,
        hardBlockCodes: [],
        findings: [{ message: "Gemini error 503: UNAVAILABLE" }],
        elapsedMs: 1_000,
        attempt: 1,
      }),
      true,
    );
  });

  it("does not retry Guard hard-block or exhausted budget", () => {
    assert.equal(
      shouldRetryTransientKeepPrevious({
        tabFrozen: true,
        hardBlockCodes: ["prior-label-mismatch"],
        findings: [{ message: "Gemini error 503: UNAVAILABLE" }],
        elapsedMs: 1_000,
        attempt: 1,
      }),
      false,
    );
    assert.equal(
      shouldRetryTransientKeepPrevious({
        tabFrozen: true,
        hardBlockCodes: [],
        findings: [{ message: "Gemini error 503: UNAVAILABLE" }],
        elapsedMs: TRANSIENT_RETRY_BUDGET_MS,
        attempt: 1,
      }),
      false,
    );
  });
});
