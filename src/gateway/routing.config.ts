import type { AIProvider, StageRouteConfig, PipelineStage } from "@/types";

// ─── Cost table (USD per 1000 tokens) ────────────────────────────────────────
export const COST_TABLE: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  // Anthropic
  "claude-sonnet-4-6": { input: 0.003, output: 0.015 },
  "claude-haiku-4-5-20251001": { input: 0.00025, output: 0.00125 },
  // Groq
  "llama3-8b-8192": { input: 0.00005, output: 0.00008 },
  "mixtral-8x7b-32768": { input: 0.00027, output: 0.00027 },
  // Gemini
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  // DeepSeek
  "deepseek-chat": { input: 0.00014, output: 0.00028 },
  // Mistral
  "mistral-large-latest": { input: 0.003, output: 0.009 },
  "mistral-small-latest": { input: 0.001, output: 0.003 },
  // OpenRouter (uses underlying model costs — approximate)
  "openrouter/auto": { input: 0.002, output: 0.006 },
};

// ─── Stage routing config ─────────────────────────────────────────────────────
// This is the ONLY place model names are specified.
// Stage implementations import from here — never hardcode.

export const STAGE_ROUTES: Record<PipelineStage, StageRouteConfig> = {
  intent: {
    primary: {
      provider: "groq",
      model: "llama3-8b-8192",
      tier: "fast",
    },
    fallback: {
      provider: "openai",
      model: "gpt-4o-mini",
      tier: "fast",
    },
  },
  schema: {
    primary: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      tier: "capable",
    },
    fallback: {
      provider: "openai",
      model: "gpt-4o",
      tier: "capable",
    },
  },
  appspec: {
    primary: {
      provider: "openai",
      model: "gpt-4o",
      tier: "capable",
    },
    fallback: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      tier: "capable",
    },
  },
};

// OpenRouter fallback — used when primary AND stage fallback both fail (429 / 5xx)
export const OPENROUTER_FALLBACK: Record<
  PipelineStage,
  { model: string; provider: AIProvider }
> = {
  intent: { provider: "openrouter", model: "meta-llama/llama-3-8b-instruct" },
  schema: { provider: "openrouter", model: "anthropic/claude-3-sonnet" },
  appspec: { provider: "openrouter", model: "openai/gpt-4o" },
};

// Repair prompts route to the same model that produced the failure.
// Escalation tier: fast -> capable -> openrouter
export const REPAIR_ESCALATION_ORDER: AIProvider[] = [
  "groq",
  "mistral",
  "openai",
  "anthropic",
  "openrouter",
];

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = COST_TABLE[model] ?? { input: 0.002, output: 0.006 };
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}