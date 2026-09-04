import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type LlmProvider = "gemini" | "openai" | "ollama" | "anthropic" | "none";

/** Free-tier default: Flash-Lite (slot volume). Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export type LlmConfig = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  forceJsonObject?: boolean;
};

function parseEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

export function loadPipelineEnv(cwd = process.cwd()): void {
  parseEnvFile(join(cwd, ".env"));
  parseEnvFile(join(cwd, ".env.local"));
}

function envTrim(env: NodeJS.Dict<string | undefined>, key: string): string {
  return env[key]?.trim() ?? "";
}

/** Resolve provider from an env snapshot (testable; no file I/O). */
export function resolveLlmConfigFromEnv(
  env: NodeJS.Dict<string | undefined>,
): LlmConfig {
  const geminiKey = envTrim(env, "GEMINI_API_KEY") || envTrim(env, "GOOGLE_API_KEY");
  if (geminiKey) {
    return {
      provider: "gemini",
      apiKey: geminiKey,
      model: envTrim(env, "GEMINI_MODEL") || DEFAULT_GEMINI_MODEL,
      forceJsonObject: true,
    };
  }

  const ollamaKey = envTrim(env, "OLLAMA_API_KEY");
  if (ollamaKey || envTrim(env, "OLLAMA_BASE_URL") || envTrim(env, "OLLAMA_HOST")) {
    const baseUrl =
      envTrim(env, "OLLAMA_BASE_URL") ||
      envTrim(env, "OLLAMA_HOST") ||
      "http://127.0.0.1:11434/v1";
    return {
      provider: "ollama",
      apiKey: ollamaKey || "ollama",
      model: envTrim(env, "OLLAMA_MODEL") || "llama3.2",
      baseUrl: baseUrl.replace(/\/$/, ""),
      forceJsonObject: false,
    };
  }

  const openaiKey = envTrim(env, "OPENAI_API_KEY");
  if (openaiKey) {
    const baseUrl = envTrim(env, "OPENAI_BASE_URL") || "https://api.openai.com/v1";
    const isOllamaCompat = /ollama|11434/i.test(baseUrl);
    return {
      provider: isOllamaCompat ? "ollama" : "openai",
      apiKey: openaiKey,
      model:
        envTrim(env, "OPENAI_MODEL") ||
        (isOllamaCompat ? "llama3.2" : "gpt-4.1-mini"),
      baseUrl: baseUrl.replace(/\/$/, ""),
      forceJsonObject: !isOllamaCompat,
    };
  }

  const anthropicKey = envTrim(env, "ANTHROPIC_API_KEY");
  if (anthropicKey) {
    return {
      provider: "anthropic",
      apiKey: anthropicKey,
      model: envTrim(env, "ANTHROPIC_MODEL") || "claude-sonnet-4-5",
      forceJsonObject: false,
    };
  }

  return { provider: "none", apiKey: "", model: "" };
}

export function resolveLlmConfig(): LlmConfig {
  loadPipelineEnv();
  return resolveLlmConfigFromEnv(process.env);
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("LLM response did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenAiCompat(
  config: LlmConfig,
  system: string,
  user: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `${user}\n\n반드시 JSON 객체만 출력하세요.` },
    ],
  };
  if (config.forceJsonObject) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LLM error ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return content;
}

async function callAnthropic(
  config: LlmConfig,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1800,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned empty content");
  return text;
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function geminiGenerationConfig(model: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    temperature: 0.3,
    maxOutputTokens: 4096,
    responseMimeType: "application/json",
  };
  // 2.5 Flash-Lite: skip thinking so JSON isn't truncated. 3.x cannot always disable it.
  if (/2\.5/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

async function callGemini(
  config: LlmConfig,
  system: string,
  user: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `${user}\n\n반드시 JSON 객체만 출력하세요.` }],
        },
      ],
      generationConfig: geminiGenerationConfig(config.model),
    }),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${rawBody.slice(0, 400)}`);
  }

  const data = JSON.parse(rawBody) as GeminiGenerateResponse;
  const blocked = data.promptFeedback?.blockReason;
  if (blocked) {
    throw new Error(`Gemini blocked prompt (${blocked})`);
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned empty content");
  return text;
}

export async function completeJson(system: string, user: string): Promise<unknown> {
  const config = resolveLlmConfig();
  if (config.provider === "none") {
    throw new Error("NO_LLM_KEY");
  }

  const raw =
    config.provider === "gemini"
      ? await callGemini(config, system, user)
      : config.provider === "anthropic"
        ? await callAnthropic(config, system, user)
        : await callOpenAiCompat(config, system, user);

  return extractJsonObject(raw);
}
