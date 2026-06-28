import { callStage } from "@/gateway";
import { validateSchema } from "@/validation";
import { repairStructural, repairField, repairConsistency, repairViaLLM } from "@/repair";
import type { AppIntent, DataSchema, RepairLogEntry, ValidationError } from "@/types";

const SYSTEM_PROMPT = `You are a database architect. Convert an AppIntent into a DataSchema.

You MUST respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

The JSON must match this exact structure:
{
  "entities": [
    {
      "name": "PascalCase entity name",
      "tableName": "snake_case_table_name",
      "fields": [
        {
          "name": "fieldName",
          "type": "string | number | boolean | date | uuid | text | json | enum",
          "nullable": false,
          "isPrimary": true/false,
          "isUnique": true/false,
          "isRelation": false,
          "enumValues": ["optional", "for", "enum", "types"],
          "defaultValue": "optional default"
        }
      ],
      "relations": [
        {
          "type": "hasMany | belongsTo | hasOne",
          "target": "TargetEntityName",
          "foreignKey": "foreignKeyField",
          "onDelete": "CASCADE | SET_NULL | RESTRICT"
        }
      ]
    }
  ]
}

CRITICAL RULES:
1. EVERY entity MUST have an "id" field (type: uuid, isPrimary: true, isUnique: true, nullable: false)
2. EVERY entity MUST have a "tenantId" field (type: uuid, nullable: false)
3. EVERY entity MUST have "createdAt" (type: date) and "updatedAt" (type: date)
4. Relations MUST be bidirectional: if A hasMany B, then B must have belongsTo A
5. tableName must be snake_case plural (e.g. "deals", "user_profiles")
6. Include ALL entities mentioned in the AppIntent
7. Add realistic fields based on the entity's purpose`;

function buildUserPrompt(intent: AppIntent): string {
  return `Convert this AppIntent into a DataSchema:

${JSON.stringify(intent, null, 2)}

Return ONLY the JSON DataSchema object.`;
}

export async function runSchemaStage(intent: AppIntent): Promise<{
  schema: DataSchema | null;
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
    const res = await callStage("schema", SYSTEM_PROMPT, buildUserPrompt(intent), 2000);
    rawText = res.text;
    tokensUsed += res.tokensUsed;
    estimatedCostUSD += res.estimatedCostUSD;
  } catch (e) {
    return {
      schema: null,
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
        "schema",
        rawText,
        [{ code: "INVALID_JSON", message: "Could not parse JSON from response" }],
        2
      );
      repairLog.push(llmRepair.log);
      const retry = repairStructural(llmRepair.text);
      repairLog.push(retry.log);
      if (!retry.repaired) {
        return {
          schema: null,
          repairLog,
          tokensUsed,
          estimatedCostUSD,
          error: "Structural repair failed after LLM escalation",
        };
      }
      parsed = retry.value;
    } catch (e) {
      return {
        schema: null,
        repairLog,
        tokensUsed,
        estimatedCostUSD,
        error: `Repair escalation failed: ${(e as Error).message}`,
      };
    }
  } else {
    parsed = structural.value;
  }

  // ── Field repair ──────────────────────────────────────────────────────────
  let validation = validateSchema(parsed);

  if (!validation.valid) {
    const fieldRepair = repairField(
      parsed as Record<string, unknown>,
      (validation as { valid: false; errors: ValidationError[] }).errors,
      "schema",
      2
    );
    repairLog.push(...fieldRepair.logs);
    parsed = fieldRepair.value;
    validation = validateSchema(parsed);
  }

  // ── Consistency repair ────────────────────────────────────────────────────
  if (!validation.valid) {
    const consistencyRepair = repairConsistency(
      parsed as Record<string, unknown>,
      (validation as { valid: false; errors: ValidationError[] }).errors,
      null,
      3
    );
    repairLog.push(...consistencyRepair.logs);
    parsed = consistencyRepair.value;
    validation = validateSchema(parsed);
  }

  // ── LLM escalation ───────────────────────────────────────────────────────
  if (!validation.valid) {
    try {
      const errors = (validation as { valid: false; errors: ValidationError[] }).errors;
      const llmRepair = await repairViaLLM(
        "schema",
        JSON.stringify(parsed, null, 2),
        errors,
        4
      );
      repairLog.push(llmRepair.log);
      const retry = repairStructural(llmRepair.text);
      repairLog.push(retry.log);
      if (retry.repaired) {
        parsed = retry.value;
        // Final field + consistency repair on LLM output
        const fr = repairField(
          parsed as Record<string, unknown>,
          errors,
          "schema",
          5
        );
        repairLog.push(...fr.logs);
        parsed = fr.value;
        const cr = repairConsistency(
          parsed as Record<string, unknown>,
          errors,
          null,
          5
        );
        repairLog.push(...cr.logs);
        parsed = cr.value;
        validation = validateSchema(parsed);
      }
    } catch (_) {}
  }

  if (!validation.valid) {
    const errors = (validation as { valid: false; errors: ValidationError[] }).errors;
    return {
      schema: null,
      repairLog,
      tokensUsed,
      estimatedCostUSD,
      error: `Schema validation failed after all repairs: ${JSON.stringify(errors)}`,
    };
  }

  return {
    schema: parsed as DataSchema,
    repairLog,
    tokensUsed,
    estimatedCostUSD,
  };
}