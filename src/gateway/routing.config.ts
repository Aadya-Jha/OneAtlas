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
  "llama-3.1-8b-instant": { input: 0.00005, output: 0.00008 },
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
    primary: { provider: "groq", model: "llama-3.1-8b-instant", tier: "fast" },
    fallback: { provider: "groq", model: "gemma2-9b-it", tier: "fast" },
  },
  schema: {
    primary: { provider: "groq", model: "llama-3.3-70b-versatile", tier: "capable" },
    fallback: { provider: "groq", model: "llama-3.1-8b-instant", tier: "fast" },
  },
  appspec: {
    primary: { provider: "groq", model: "llama-3.3-70b-versatile", tier: "capable" },
    fallback: { provider: "groq", model: "llama-3.1-8b-instant", tier: "fast" },
  },
};

export const OPENROUTER_FALLBACK: Record<PipelineStage, { model: string; provider: AIProvider }> = {
  intent:  { provider: "groq", model: "llama-3.1-8b-instant" },
  schema:  { provider: "groq", model: "llama-3.3-70b-versatile" },
  appspec: { provider: "groq", model: "llama-3.3-70b-versatile" },
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