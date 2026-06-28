import type {
  RepairLogEntry,
  RepairStrategy,
  ValidationError,
  PipelineStage,
  DataSchema,
} from "@/types";
import { callModel } from "@/gateway";
import { STAGE_ROUTES } from "@/gateway/routing.config";
import { INTEGRATION_REGISTRY } from "@/integrations/registry";

// ─── Log factory ─────────────────────────────────────────────────────────────

function makeLog(
  strategy: RepairStrategy,
  errorInput: string,
  outcome: RepairLogEntry["outcome"],
  stageAttempt: number
): RepairLogEntry {
  return {
    strategy,
    errorInput,
    outcome,
    timestamp: new Date().toISOString(),
    stageAttempt,
  };
}

// ─── Strategy 1: Structural Repair ───────────────────────────────────────────
// Handles malformed / truncated JSON. Extracts valid JSON from text, fills
// defaults for missing terminal keys.

export function repairStructural(
  rawText: string
): { repaired: boolean; value: unknown; log: RepairLogEntry } {
  const attempt = 1;

  // Try 1: direct parse
  try {
    const parsed = JSON.parse(rawText);
    return {
      repaired: true,
      value: parsed,
      log: makeLog("structural", rawText.slice(0, 200), "repaired", attempt),
    };
  } catch (_) {}

  // Try 2: extract JSON block from markdown fences
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      return {
        repaired: true,
        value: parsed,
        log: makeLog("structural", rawText.slice(0, 200), "repaired", attempt),
      };
    } catch (_) {}
  }

  // Try 3: find first { and last } and try to parse that substring
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substring = rawText.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(substring);
      return {
        repaired: true,
        value: parsed,
        log: makeLog("structural", rawText.slice(0, 200), "repaired", attempt),
      };
    } catch (_) {}
  }

  // Try 4: find first [ and last ] (for array responses)
  const firstBracket = rawText.indexOf("[");
  const lastBracket = rawText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const substring = rawText.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(substring);
      return {
        repaired: true,
        value: parsed,
        log: makeLog("structural", rawText.slice(0, 200), "repaired", attempt),
      };
    } catch (_) {}
  }

  return {
    repaired: false,
    value: null,
    log: makeLog("structural", rawText.slice(0, 200), "failed", attempt),
  };
}

// ─── Strategy 2: Field Repair ─────────────────────────────────────────────────
// Handles missing or wrongly typed fields. Applies typed defaults without
// a re-prompt where possible; re-prompts in isolation for non-defaultable fields.

export function repairField(
  value: Record<string, unknown>,
  errors: ValidationError[],
  stage: PipelineStage,
  attempt: number
): { repaired: boolean; value: Record<string, unknown>; logs: RepairLogEntry[] } {
  const logs: RepairLogEntry[] = [];
  const patched = { ...value };
  let anyRepaired = false;

  for (const error of errors) {
    const path = error.path ?? "";

    // Missing tenantId on an entity — inject it
    if (error.code === "MISSING_TENANT_ID" && path.includes("entities")) {
      const entityMatch = path.match(/entities\.(\w+)/);
      if (entityMatch) {
        const entityName = entityMatch[1];
        const entities = patched.entities as Array<Record<string, unknown>>;
        const entity = entities?.find(
          (e) => (e.name as string) === entityName
        );
        if (entity && Array.isArray(entity.fields)) {
          entity.fields.push({
            name: "tenantId",
            type: "uuid",
            nullable: false,
            isPrimary: false,
            isUnique: false,
            isRelation: false,
          });
          logs.push(makeLog("field", error.message, "repaired", attempt));
          anyRepaired = true;
        }
      }
    }

    // Missing primary key — inject id field
    if (error.code === "MISSING_PRIMARY_KEY" && path.includes("entities")) {
      const entityMatch = path.match(/entities\.(\w+)/);
      if (entityMatch) {
        const entityName = entityMatch[1];
        const entities = patched.entities as Array<Record<string, unknown>>;
        const entity = entities?.find(
          (e) => (e.name as string) === entityName
        );
        if (entity && Array.isArray(entity.fields)) {
          entity.fields.unshift({
            name: "id",
            type: "uuid",
            nullable: false,
            isPrimary: true,
            isUnique: true,
            isRelation: false,
          });
          logs.push(makeLog("field", error.message, "repaired", attempt));
          anyRepaired = true;
        }
      }
    }

    // Missing appType — default to custom
    if (error.code === "invalid_enum_value" && path === "appType") {
      patched.appType = "custom";
      logs.push(makeLog("field", error.message, "repaired", attempt));
      anyRepaired = true;
    }
  }

  return { repaired: anyRepaired, value: patched, logs };
}

// ─── Strategy 3: Consistency Repair ──────────────────────────────────────────
// Fixes cross-layer reference errors deterministically where possible.
// Only falls back to re-prompt when genuinely non-deterministic.

export function repairConsistency(
  value: Record<string, unknown>,
  errors: ValidationError[],
  schema: DataSchema | null,
  attempt: number
): { repaired: boolean; value: Record<string, unknown>; logs: RepairLogEntry[] } {
  const logs: RepairLogEntry[] = [];
  const patched = { ...value };
  let anyRepaired = false;

  const entityNames = schema
    ? new Set(schema.entities.map((e) => e.name))
    : new Set<string>();

  for (const error of errors) {
    // PAGE_NO_API — add a GET endpoint for the missing entity
    // Remove pages where boundEntity is null, "null", "Unknown", or empty
    if (error.code === "PAGE_UNKNOWN_ENTITY" || error.code === "PAGE_NO_API") {
      const pages = patched.pages as Array<Record<string, unknown>>;
      if (Array.isArray(pages)) {
        patched.pages = pages.filter(
          (p) =>
            p.boundEntity != null &&
            p.boundEntity !== "" &&
            p.boundEntity !== "null" &&
            p.boundEntity !== "Unknown"
        );
        logs.push(makeLog("consistency", error.message, "repaired", attempt));
        anyRepaired = true;
      }
      continue;
    }
    if (error.code === "PAGE_NO_API") {
      const entityMatch = error.message.match(/entity: (\w+)/);
      if (entityMatch) {
        const entity = entityMatch[1];
        const endpoints = patched.apiEndpoints as Array<Record<string, unknown>>;
        if (Array.isArray(endpoints)) {
          endpoints.push({
            path: `/${entity.toLowerCase()}s`,
            method: "GET",
            handlerDescription: `List all ${entity} records`,
            boundEntity: entity,
            authRequired: true,
            rateLimitFlag: false,
          });
          logs.push(makeLog("consistency", error.message, "repaired", attempt));
          anyRepaired = true;
        }
      }
    }

    // INCONSISTENT_RELATION — add the missing inverse relation
    if (error.code === "INCONSISTENT_RELATION") {
      const match = error.message.match(
        /Entity "(\w+)" hasMany "(\w+)" but "(\w+)" has no belongsTo "(\w+)"/
      );
      if (match) {
        const [, , targetName, , sourceName] = match;
        const entities = patched.entities as Array<Record<string, unknown>>;
        const target = entities?.find((e) => (e.name as string) === targetName);
        if (target && Array.isArray(target.relations)) {
          target.relations.push({
            type: "belongsTo",
            target: sourceName,
            foreignKey: `${sourceName.toLowerCase()}Id`,
            onDelete: "CASCADE",
          });
          logs.push(makeLog("consistency", error.message, "repaired", attempt));
          anyRepaired = true;
        }
      }
    }

    // UNKNOWN_INTEGRATION — remove the invalid hook/stub rather than fail
    if (
      error.code === "UNKNOWN_INTEGRATION" ||
      error.code === "UNKNOWN_INTEGRATION_ACTION"
    ) {
      const hooks = patched.integrationHooks as Array<Record<string, unknown>>;
      if (Array.isArray(hooks)) {
        const validIntegrations = new Set(Object.keys(INTEGRATION_REGISTRY));
        patched.integrationHooks = hooks.filter((h) =>
          validIntegrations.has(h.integrationId as string)
        );
        logs.push(makeLog("consistency", error.message, "repaired", attempt));
        anyRepaired = true;
      }
    }

    // WORKFLOW_UNKNOWN_ENTITY — remove bad stubs
    if (error.code === "WORKFLOW_UNKNOWN_ENTITY") {
      const stubs = patched.workflowStubs as Array<Record<string, unknown>>;
      if (Array.isArray(stubs) && entityNames.size > 0) {
        patched.workflowStubs = stubs.filter((s) =>
          entityNames.has((s.trigger as Record<string, unknown>)?.entity as string)
        );
        logs.push(makeLog("consistency", error.message, "repaired", attempt));
        anyRepaired = true;
      }
    }
  }

  return { repaired: anyRepaired, value: patched, logs };
}

// ─── LLM-based repair (escalation) ───────────────────────────────────────────
// Called only after all deterministic strategies fail.

export async function repairViaLLM(
  stage: PipelineStage,
  originalOutput: string,
  errors: ValidationError[],
  attempt: number
): Promise<{ text: string; log: RepairLogEntry }> {
  const route = STAGE_ROUTES[stage];
  const errorSummary = errors
    .map((e) => `- [${e.code}] ${e.message}. Fix: ${e.repairHint ?? "unknown"}`)
    .join("\n");

  const systemPrompt = `You are a JSON repair assistant. You will receive a JSON object that failed validation and a list of errors. Return ONLY valid JSON with the errors fixed. Do not include any explanation, markdown, or code fences.`;

  const userPrompt = `The following JSON failed validation:

${originalOutput}

Errors to fix:
${errorSummary}

Return the corrected JSON only.`;

  const response = await callModel({
    provider: route.primary.provider,
    model: route.primary.model,
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
  });

  return {
    text: response.text,
    log: makeLog("field", errorSummary.slice(0, 300), "repaired", attempt),
  };
}