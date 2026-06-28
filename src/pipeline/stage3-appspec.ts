import { callStage } from "@/gateway";
import { validateAppSpec } from "@/validation";
import { repairStructural, repairField, repairConsistency, repairViaLLM } from "@/repair";
import { INTEGRATION_REGISTRY } from "@/integrations/registry";
import type { AppIntent, DataSchema, AppSpec, RepairLogEntry, ValidationError } from "@/types";

const SYSTEM_PROMPT = `You are an app architect. Convert a DataSchema into an AppSpec JSON object.

Respond with ONLY valid JSON, no markdown, no explanation.

Required structure:
{
  "pages": [{ "name", "route", "layout": "list|detail|dashboard|settings", "boundEntity", "components": ["table|form|chart|card"] }],
  "apiEndpoints": [{ "path", "method": "GET|POST|PUT|PATCH|DELETE", "handlerDescription", "boundEntity", "authRequired": bool, "rateLimitFlag": bool }],
  "authRules": { "roles": [], "permissions": { "EntityName": { "role": ["read","write","delete"] } } },
  "integrationHooks": [{ "integrationId", "trigger": { "entity", "event": "created|updated|deleted|status_changed", "condition?" }, "actionId" }],
  "workflowStubs": [{ "name", "trigger": { "entity", "event", "condition?" }, "integration", "action", "payload": {} }]
}

Rules: every page needs an API endpoint with same boundEntity. Only use these integration IDs: slack, stripe, gmail, whatsapp, webhook, notion, jira, github.`;

function buildUserPrompt(schema: DataSchema, intent: AppIntent): string {
  const registrySnapshot = Object.entries(INTEGRATION_REGISTRY)
    .filter(([, v]) => intent.integrations_requested.includes(v.id))
    .map(([id, v]) => ({
      id,
      actions: v.actions.map((a) => a.id),
    }));

  return `Convert this DataSchema into an AppSpec.

AppIntent context (for integration/workflow generation):
${JSON.stringify({ integrations_requested: intent.integrations_requested, features: intent.features }, null, 2)}

DataSchema:
${JSON.stringify(schema, null, 2)}

Available integrations for this app (use only these IDs and action IDs):
${JSON.stringify(registrySnapshot, null, 2)}

Return ONLY the JSON AppSpec object.`;
}

export async function runAppSpecStage(
  schema: DataSchema,
  intent: AppIntent
): Promise<{
  appSpec: AppSpec | null;
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
    const res = await callStage("appspec", SYSTEM_PROMPT, buildUserPrompt(schema, intent), 2000);
    rawText = res.text;
    tokensUsed += res.tokensUsed;
    estimatedCostUSD += res.estimatedCostUSD;
  } catch (e) {
    return {
      appSpec: null,
      repairLog,
      tokensUsed,
      estimatedCostUSD,
      error: `Gateway failed: ${(e as Error).message}`,
    };
  }

  // ── Structural repair ─────────────────────────────────────────────────────
  let parsed: unknown;
  const structural = repairStructural(rawText);
  repairLog.push(structural.log);

  if (!structural.repaired) {
    try {
      const llmRepair = await repairViaLLM(
        "appspec",
        rawText,
        [{ code: "INVALID_JSON", message: "Could not parse JSON from response" }],
        2
      );
      repairLog.push(llmRepair.log);
      const retry = repairStructural(llmRepair.text);
      repairLog.push(retry.log);
      if (!retry.repaired) {
        return {
          appSpec: null,
          repairLog,
          tokensUsed,
          estimatedCostUSD,
          error: "Structural repair failed",
        };
      }
      parsed = retry.value;
    } catch (e) {
      return {
        appSpec: null,
        repairLog,
        tokensUsed,
        estimatedCostUSD,
        error: `Repair failed: ${(e as Error).message}`,
      };
    }
  } else {
    parsed = structural.value;
    console.log("[appspec] raw parsed:", JSON.stringify(parsed).slice(0, 500));
  }

  // ── Basic structure check before Zod ─────────────────────────────────────
  const raw = parsed as Record<string, unknown>;
  if (!raw.pages || !raw.apiEndpoints || !raw.authRules) {
    // Model returned incomplete object — try to rebuild minimum structure
    if (!raw.pages) raw.pages = [];
    if (!raw.apiEndpoints) raw.apiEndpoints = [];
    if (!raw.authRules) raw.authRules = { roles: ["admin", "user"], permissions: {} };
    if (!raw.integrationHooks) raw.integrationHooks = [];
    if (!raw.workflowStubs) raw.workflowStubs = [];
  }
  console.log("[appspec] full validation errors:", JSON.stringify(validateAppSpec(parsed, schema)));
  // ── Field repair ──────────────────────────────────────────────────────────
  let validation = validateAppSpec(parsed, schema);

  if (!validation.valid) {
    const errors = (validation as { valid: false; errors: ValidationError[] }).errors;
    const fieldRepair = repairField(
      parsed as Record<string, unknown>,
      errors,
      "appspec",
      2
    );
    repairLog.push(...fieldRepair.logs);
    parsed = fieldRepair.value;
    validation = validateAppSpec(parsed, schema);
  }

  // ── Consistency repair ────────────────────────────────────────────────────
  if (!validation.valid) {
    const errors = (validation as { valid: false; errors: ValidationError[] }).errors;
    const consistencyRepair = repairConsistency(
      parsed as Record<string, unknown>,
      errors,
      schema,
      3
    );
    repairLog.push(...consistencyRepair.logs);
    parsed = consistencyRepair.value;
    validation = validateAppSpec(parsed, schema);
  }

  // ── LLM escalation ───────────────────────────────────────────────────────
  if (!validation.valid) {
    try {
      const errors = (validation as { valid: false; errors: ValidationError[] }).errors;
      const llmRepair = await repairViaLLM(
        "appspec",
        JSON.stringify(parsed, null, 2),
        errors,
        4
      );
      repairLog.push(llmRepair.log);
      const retry = repairStructural(llmRepair.text);
      repairLog.push(retry.log);
      if (retry.repaired) {
        parsed = retry.value;
        // Final consistency pass
        const cr = repairConsistency(
          parsed as Record<string, unknown>,
          errors,
          schema,
          5
        );
        repairLog.push(...cr.logs);
        parsed = cr.value;
        validation = validateAppSpec(parsed, schema);
      }
    } catch (_) {}
  }

  if (!validation.valid) {
    const errors = (validation as { valid: false; errors: ValidationError[] }).errors;
    return {
      appSpec: null,
      repairLog,
      tokensUsed,
      estimatedCostUSD,
      error: `AppSpec validation failed after all repairs: ${JSON.stringify(errors)}`,
    };
  }

  return {
    appSpec: parsed as AppSpec,
    repairLog,
    tokensUsed,
    estimatedCostUSD,
  };
}