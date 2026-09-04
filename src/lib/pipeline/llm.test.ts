import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  GROQ_BASE_URL,
  extractJsonObject,
  resolveLlmConfigFromEnv,
} from "@/lib/pipeline/llm";

describe("resolveLlmConfigFromEnv", () => {
  it("prefers Groq over leftover Gemini/Anthropic/OpenAI keys", () => {
    const cfg = resolveLlmConfigFromEnv({
      GROQ_API_KEY: " groq-key ",
      GEMINI_API_KEY: "g-key",
      ANTHROPIC_API_KEY: "a-key",
      OPENAI_API_KEY: "o-key",
    });
    assert.equal(cfg.provider, "groq");
    assert.equal(cfg.model, DEFAULT_GROQ_MODEL);
    assert.equal(cfg.apiKey, "groq-key");
    assert.equal(cfg.baseUrl, GROQ_BASE_URL);
  });

  it("uses GROQ_MODEL override", () => {
    const cfg = resolveLlmConfigFromEnv({
      GROQ_API_KEY: "groq-key",
      GROQ_MODEL: "openai/gpt-oss-120b",
    });
    assert.equal(cfg.model, "openai/gpt-oss-120b");
  });

  it("uses leftover Gemini when Groq key is absent", () => {
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
