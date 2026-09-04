import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GEMINI_MODEL,
  extractJsonObject,
  resolveLlmConfigFromEnv,
} from "@/lib/pipeline/llm";

describe("resolveLlmConfigFromEnv", () => {
  it("prefers Gemini over leftover Anthropic/OpenAI keys", () => {
    const cfg = resolveLlmConfigFromEnv({
      GEMINI_API_KEY: "g-key",
      ANTHROPIC_API_KEY: "a-key",
      OPENAI_API_KEY: "o-key",
    });
    assert.equal(cfg.provider, "gemini");
    assert.equal(cfg.model, DEFAULT_GEMINI_MODEL);
    assert.equal(cfg.apiKey, "g-key");
  });

  it("accepts GOOGLE_API_KEY as Gemini alias", () => {
    const cfg = resolveLlmConfigFromEnv({ GOOGLE_API_KEY: " google " });
    assert.equal(cfg.provider, "gemini");
    assert.equal(cfg.apiKey, "google");
  });

  it("uses GEMINI_MODEL override", () => {
    const cfg = resolveLlmConfigFromEnv({
      GEMINI_API_KEY: "g-key",
      GEMINI_MODEL: "gemini-3.5-flash",
    });
    assert.equal(cfg.model, "gemini-3.5-flash");
  });

  it("falls back to none when no keys", () => {
    const cfg = resolveLlmConfigFromEnv({});
    assert.equal(cfg.provider, "none");
  });
});

describe("extractJsonObject", () => {
  it("parses a raw JSON object", () => {
    const json = extractJsonObject('{"headline":"ok","bullets":["a"]}');
    assert.deepEqual(json, { headline: "ok", bullets: ["a"] });
  });
});
