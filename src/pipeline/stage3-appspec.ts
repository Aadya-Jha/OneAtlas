import { callStage } from "@/gateway";
import { validateAppSpec } from "@/validation";
import { repairStructural, repairField, repairConsistency, repairViaLLM } from "@/repair";
import { INTEGRATION_REGISTRY } from "@/integrations/registry";
import type { AppIntent, DataSchema, AppSpec, RepairLogEntry, ValidationError } from "@/types";

const SYSTEM_PROMPT = `You are a full-stack application architect. Convert a DataSchema into an AppSpec.

You MUST respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

The JSON must match this exact structure:
{
  "pages": [
    {
      "name": "Page Name",
      "route": "/route",
      "layout": "list | detail | dashboard | settings",
      "boundEntity": "EntityName",
      "components": ["table", "form", "chart", "card"]
    }
  ],
  "apiEndpoints": [
    {
      "path": "/api/entity-name",
      "method": "GET | POST | PUT | PATCH | DELETE",
      "handlerDescription": "Description of what this endpoint does",
      "boundEntity": "EntityName",
      "authRequired": true,
      "rateLimitFlag": false
    }
  ],
  "authRules": {
    "roles": ["admin", "user"],
    "permissions": {
      "EntityName": {
        "admin": ["read", "write", "delete"],
        "user": ["read"]
      }
    }
  },
  "integrationHooks": [
    {
      "integrationId": "slack",
      "trigger": {
        "entity": "EntityName",
        "event": "created | updated | deleted | status_changed",
        "condition": "optional filter expression"
      },
      "actionId": "send_channel_message"
    }
  ],
  "workflowStubs": [
    {
      "name": "Human readable workflow name",
      "trigger": {
        "entity": "EntityName",
        "event": "created | updated | deleted | status_changed",
        "condition": "optional filter"
      },
      "integration": "integration_id",
      "action": "action_id",
      "payload": {
        "fieldFromEntity": "mappedToActionInput"
      }
    }
  ]
}

CRITICAL RULES:
1. EVERY page must have at least one apiEndpoint with the same boundEntity
2. At minimum provide CRUD endpoints (GET list, GET by ID, POST, PUT, DELETE) for each entity
3. integrationHooks and workflowStubs must only use these integration IDs: slack, stripe, gmail, whatsapp, webhook, notion, jira, github
4. integrationHooks actionId must match a real action in the integration
5. Roles in permissions must only be roles listed in authRules.roles
6. Generate at least one workflowStub per integration mentioned in the prompt
7. routes must start with /`;

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
    const res = await callStage("appspec", SYSTEM_PROMPT, buildUserPrompt(schema, intent), 8000);
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
  }

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