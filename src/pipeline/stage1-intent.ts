import { callStage } from "@/gateway";
import { validateIntent } from "@/validation";
import {
  repairStructural,
  repairField,
  repairViaLLM,
} from "@/repair";
import { AppIntentSchema } from "@/types";
import type { AppIntent, RepairLogEntry, ValidationError } from "@/types";

const SYSTEM_PROMPT = `You are an expert software architect. Your job is to extract structured intent from a natural language app description.

You MUST respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

The JSON must match this exact structure:
{
  "appName": "string — short, descriptive name",
  "appType": "one of: crm | project_management | ecommerce | hr_tool | inventory | content_platform | analytics | custom",
  "features": ["array of feature strings"],
  "entities": ["array of entity/model names, PascalCase, e.g. User, Deal, Product"],
  "integrations_requested": ["array of integration IDs mentioned: slack | stripe | gmail | whatsapp | webhook | notion | jira | github"],
  "assumptions": ["array of assumptions you made that weren't explicit in the prompt"]
}

Rules:
- appType must be exactly one of the enum values
- entities must be PascalCase nouns
- integrations_requested must only include IDs from: slack, stripe, gmail, whatsapp, webhook, notion, jira, github
- If the prompt is too vague (under ~10 meaningful words), add clarification_required: { flag: true, question: "one specific question" }
- assumptions array must not be empty — document what you inferred`;

function buildUserPrompt(prompt: string): string {
  return `Parse this app description into the required JSON structure:

"${prompt}"

Respond with ONLY the JSON object.`;
}

export async function runIntentStage(prompt: string): Promise<{
  intent: AppIntent | null;
  repairLog: RepairLogEntry[];
  tokensUsed: number;
  estimatedCostUSD: number;
  error?: string;
}> {
  const repairLog: RepairLogEntry[] = [];
  let tokensUsed = 0;
  let estimatedCostUSD = 0;

  // ── Attempt 1: primary call ───────────────────────────────────────────────
  let rawText = "";
  try {
    const res = await callStage("intent", SYSTEM_PROMPT, buildUserPrompt(prompt), 2048);
    rawText = res.text;
    tokensUsed += res.tokensUsed;
    estimatedCostUSD += res.estimatedCostUSD;
  } catch (e) {
    return {
      intent: null,
      repairLog,
      tokensUsed,
      estimatedCostUSD,
      error: `Gateway failed: ${(e as Error).message}`,
    };
  }

  // ── Structural repair: ensure we have parseable JSON ─────────────────────
  let parsed: unknown;
  const structural = repairStructural(rawText);
  repairLog.push(structural.log);

  if (!structural.repaired) {
    // LLM repair escalation
    try {
      const llmRepair = await repairViaLLM(
        "intent",
        rawText,
        [{ code: "INVALID_JSON", message: "Could not parse JSON from response" }],
        2
      );
      repairLog.push(llmRepair.log);
      const retry = repairStructural(llmRepair.text);
      repairLog.push(retry.log);
      if (!retry.repaired) {
        return {
          intent: null,
          repairLog,
          tokensUsed,
          estimatedCostUSD,
          error: "Could not extract valid JSON after structural repair and LLM escalation",
        };
      }
      parsed = retry.value;
    } catch (e) {
      return {
        intent: null,
        repairLog,
        tokensUsed,
        estimatedCostUSD,
        error: `Repair escalation failed: ${(e as Error).message}`,
      };
    }
  } else {
    parsed = structural.value;
  }

  // ── Field repair: fix missing/wrong fields ────────────────────────────────
  let validation = validateIntent(parsed);

  if (!validation.valid) {
    const fieldRepair = repairField(
      parsed as Record<string, unknown>,
      validation.errors as ValidationError[],
      "intent",
      2
    );
    repairLog.push(...fieldRepair.logs);
    parsed = fieldRepair.value;
    validation = validateIntent(parsed);
  }

  // ── LLM repair if still invalid ───────────────────────────────────────────
  if (!validation.valid) {
    try {
      const llmRepair = await repairViaLLM(
        "intent",
        JSON.stringify(parsed, null, 2),
        (validation as { valid: false; errors: ValidationError[] }).errors,
        3
      );
      repairLog.push(llmRepair.log);
      const retry = repairStructural(llmRepair.text);
      repairLog.push(retry.log);
      if (retry.repaired) {
        parsed = retry.value;
        validation = validateIntent(parsed);
      }
    } catch (_) {
      // Log and continue with what we have
    }
  }

  if (!validation.valid) {
    return {
      intent: null,
      repairLog,
      tokensUsed,
      estimatedCostUSD,
      error: `Validation failed after repairs: ${JSON.stringify(
        (validation as { valid: false; errors: ValidationError[] }).errors
      )}`,
    };
  }

  return {
    intent: parsed as AppIntent,
    repairLog,
    tokensUsed,
    estimatedCostUSD,
  };
}