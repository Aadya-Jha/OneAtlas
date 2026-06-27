import type { GatewayRequest, GatewayResponse, AIProvider } from "@/types";
import { estimateCost } from "./routing.config";

// ─── Provider call implementations ───────────────────────────────────────────

async function callOpenAI(req: GatewayRequest): Promise<GatewayResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GatewayError(res.status, `OpenAI error: ${err}`, "openai");
  }

  const data = await res.json();
  const text = data.choices[0]?.message?.content ?? "";
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

  return {
    text,
    tokensUsed: usage.prompt_tokens + usage.completion_tokens,
    estimatedCostUSD: estimateCost(req.model, usage.prompt_tokens, usage.completion_tokens),
    provider: "openai",
    model: req.model,
  };
}

async function callAnthropic(req: GatewayRequest): Promise<GatewayResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GatewayError(res.status, `Anthropic error: ${err}`, "anthropic");
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

  return {
    text,
    tokensUsed: usage.input_tokens + usage.output_tokens,
    estimatedCostUSD: estimateCost(req.model, usage.input_tokens, usage.output_tokens),
    provider: "anthropic",
    model: req.model,
  };
}

async function callGroq(req: GatewayRequest): Promise<GatewayResponse> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GatewayError(res.status, `Groq error: ${err}`, "groq");
  }

  const data = await res.json();
  const text = data.choices[0]?.message?.content ?? "";
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

  return {
    text,
    tokensUsed: usage.prompt_tokens + usage.completion_tokens,
    estimatedCostUSD: estimateCost(req.model, usage.prompt_tokens, usage.completion_tokens),
    provider: "groq",
    model: req.model,
  };
}

async function callGemini(req: GatewayRequest): Promise<GatewayResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${req.systemPrompt}\n\n${req.userPrompt}` },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.2,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GatewayError(res.status, `Gemini error: ${err}`, "gemini");
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const usage = data.usageMetadata ?? { promptTokenCount: 0, candidatesTokenCount: 0 };

  return {
    text,
    tokensUsed: usage.promptTokenCount + usage.candidatesTokenCount,
    estimatedCostUSD: estimateCost(
      req.model,
      usage.promptTokenCount,
      usage.candidatesTokenCount
    ),
    provider: "gemini",
    model: req.model,
  };
}

async function callDeepSeek(req: GatewayRequest): Promise<GatewayResponse> {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GatewayError(res.status, `DeepSeek error: ${err}`, "deepseek");
  }

  const data = await res.json();
  const text = data.choices[0]?.message?.content ?? "";
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

  return {
    text,
    tokensUsed: usage.prompt_tokens + usage.completion_tokens,
    estimatedCostUSD: estimateCost(req.model, usage.prompt_tokens, usage.completion_tokens),
    provider: "deepseek",
    model: req.model,
  };
}

async function callOpenRouter(req: GatewayRequest): Promise<GatewayResponse> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://oneatlas.dev",
      "X-Title": "OneAtlas Pipeline",
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GatewayError(res.status, `OpenRouter error: ${err}`, "openrouter");
  }

  const data = await res.json();
  const text = data.choices[0]?.message?.content ?? "";
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

  return {
    text,
    tokensUsed: usage.prompt_tokens + usage.completion_tokens,
    estimatedCostUSD: estimateCost(req.model, usage.prompt_tokens, usage.completion_tokens),
    provider: "openrouter",
    model: req.model,
  };
}

async function callMistral(req: GatewayRequest): Promise<GatewayResponse> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GatewayError(res.status, `Mistral error: ${err}`, "mistral");
  }

  const data = await res.json();
  const text = data.choices[0]?.message?.content ?? "";
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

  return {
    text,
    tokensUsed: usage.prompt_tokens + usage.completion_tokens,
    estimatedCostUSD: estimateCost(req.model, usage.prompt_tokens, usage.completion_tokens),
    provider: "mistral",
    model: req.model,
  };
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class GatewayError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public provider: AIProvider
  ) {
    super(message);
    this.name = "GatewayError";
  }

  isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

// ─── Main gateway function ────────────────────────────────────────────────────

export async function callModel(req: GatewayRequest): Promise<GatewayResponse> {
  switch (req.provider) {
    case "openai":
      return callOpenAI(req);
    case "anthropic":
      return callAnthropic(req);
    case "groq":
      return callGroq(req);
    case "gemini":
    case "google_ai":
      return callGemini(req);
    case "deepseek":
      return callDeepSeek(req);
    case "openrouter":
      return callOpenRouter(req);
    case "mistral":
      return callMistral(req);
    default:
      throw new Error(`Unknown provider: ${req.provider}`);
  }
}

// ─── Routed call with auto-fallback ──────────────────────────────────────────

import { STAGE_ROUTES, OPENROUTER_FALLBACK } from "./routing.config";
import type { PipelineStage } from "@/types";

export async function callStage(
  stage: PipelineStage,
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number
): Promise<GatewayResponse> {
  const route = STAGE_ROUTES[stage];

  // Try primary
  try {
    return await callModel({
      provider: route.primary.provider,
      model: route.primary.model,
      systemPrompt,
      userPrompt,
      maxTokens,
    });
  } catch (e) {
    const err = e as GatewayError;
    console.warn(`[gateway] Primary failed for stage=${stage}:`, err.message);

    if (!err.isRetryable?.()) throw err;
  }

  // Try stage fallback
  try {
    return await callModel({
      provider: route.fallback.provider,
      model: route.fallback.model,
      systemPrompt,
      userPrompt,
      maxTokens,
    });
  } catch (e) {
    const err = e as GatewayError;
    console.warn(`[gateway] Fallback failed for stage=${stage}:`, err.message);

    if (!err.isRetryable?.()) throw err;
  }

  // Last resort: OpenRouter
  const or = OPENROUTER_FALLBACK[stage];
  return callModel({
    provider: or.provider,
    model: or.model,
    systemPrompt,
    userPrompt,
    maxTokens,
  });
}