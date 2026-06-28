import { z } from "zod";
import {
  AppIntentSchema,
  DataSchemaOutput,
  AppSpecSchema,
} from "@/types";
import type {
  AppIntent,
  DataSchema,
  AppSpec,
  ValidationResult,
  ValidationError,
} from "@/types";
import { INTEGRATION_REGISTRY } from "@/integrations/registry";

// ─── Helper ───────────────────────────────────────────────────────────────────

function fromZod(err: z.ZodError): ValidationError[] {
  if (!err || !err.issues) return [];
  console.log("[validation] zod issues:", JSON.stringify(err.issues).slice(0, 500));
  return err.issues.map((e) => ({
    code: e.code,
    message: e.message,
    path: e.path.join("."),
    repairHint: `Fix field at path: ${e.path.join(".")}`,
  }));
}
// ─── Stage 1: AppIntent ───────────────────────────────────────────────────────

export function validateIntent(raw: unknown): ValidationResult {
  const result = AppIntentSchema.safeParse(raw);
  if (!result.success) {
    return { valid: false, errors: fromZod(result.error) };
  }
  return { valid: true };
}

// ─── Stage 2: DataSchema ─────────────────────────────────────────────────────

export function validateSchema(raw: unknown): ValidationResult {
  const result = DataSchemaOutput.safeParse(raw);
  if (!result.success) {
    return { valid: false, errors: fromZod(result.error) };
  }

  const schema = raw as DataSchema;
  const errors: ValidationError[] = [];
  const entityNames = new Set(schema.entities.map((e) => e.name));

  for (const entity of schema.entities) {
    // Every entity must have tenantId
    const hasTenantId = entity.fields.some((f) => f.name === "tenantId");
    if (!hasTenantId) {
      errors.push({
        code: "MISSING_TENANT_ID",
        message: `Entity "${entity.name}" is missing a tenantId field`,
        path: `entities.${entity.name}.fields`,
        repairHint: `Add tenantId field of type uuid to entity ${entity.name}`,
      });
    }

    // Every entity must have a primary key
    const hasPrimary = entity.fields.some((f) => f.isPrimary);
    if (!hasPrimary) {
      errors.push({
        code: "MISSING_PRIMARY_KEY",
        message: `Entity "${entity.name}" has no primary key field`,
        path: `entities.${entity.name}.fields`,
        repairHint: `Add id field with isPrimary=true to entity ${entity.name}`,
      });
    }

    // Relation targets must resolve
    for (const rel of entity.relations) {
      if (!entityNames.has(rel.target)) {
        errors.push({
          code: "BROKEN_RELATION",
          message: `Entity "${entity.name}" has relation to unknown entity "${rel.target}"`,
          path: `entities.${entity.name}.relations`,
          repairHint: `Either add entity "${rel.target}" or remove this relation`,
        });
      }
    }

    // Bidirectional consistency check
    for (const rel of entity.relations) {
      if (!entityNames.has(rel.target)) continue;
      const targetEntity = schema.entities.find((e) => e.name === rel.target);
      if (!targetEntity) continue;

      if (rel.type === "hasMany") {
        const hasInverse = targetEntity.relations.some(
          (r) => r.type === "belongsTo" && r.target === entity.name
        );
        if (!hasInverse) {
          errors.push({
            code: "INCONSISTENT_RELATION",
            message: `Entity "${entity.name}" hasMany "${rel.target}" but "${rel.target}" has no belongsTo "${entity.name}"`,
            path: `entities.${rel.target}.relations`,
            repairHint: `Add belongsTo relation from ${rel.target} back to ${entity.name}`,
          });
        }
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true };
}

// ─── Stage 3: AppSpec ────────────────────────────────────────────────────────

export function validateAppSpec(
  raw: unknown,
  schema: DataSchema
): ValidationResult {
  const result = AppSpecSchema.safeParse(raw);
  if (!result.success) {
    return { valid: false, errors: fromZod(result.error) };
  }

  const spec = raw as AppSpec;
  const errors: ValidationError[] = [];
  const entityNames = new Set(schema.entities.map((e) => e.name));
  const registeredIntegrations = new Set(Object.keys(INTEGRATION_REGISTRY));
  const definedRoles = new Set(spec.authRules.roles);

  // Every page must have at least one API endpoint
  for (const page of spec.pages) {
    const hasEndpoint = spec.apiEndpoints.some(
      (ep) => ep.boundEntity === page.boundEntity
    );
    if (!hasEndpoint) {
      errors.push({
        code: "PAGE_NO_API",
        message: `Page "${page.name}" (entity: ${page.boundEntity}) has no corresponding API endpoint`,
        path: `pages.${page.name}`,
        repairHint: `Add a GET endpoint for entity ${page.boundEntity}`,
      });
    }

    // Page bound entity must exist in schema
    if (!entityNames.has(page.boundEntity)) {
      errors.push({
        code: "PAGE_UNKNOWN_ENTITY",
        message: `Page "${page.name}" references unknown entity "${page.boundEntity}"`,
        path: `pages.${page.name}.boundEntity`,
        repairHint: `Use one of: ${[...entityNames].join(", ")}`,
      });
    }
  }

  // Auth rules must reference real roles
  for (const [entity, rolePerms] of Object.entries(spec.authRules.permissions)) {
    for (const role of Object.keys(rolePerms)) {
      if (!definedRoles.has(role)) {
        errors.push({
          code: "UNKNOWN_ROLE",
          message: `Permission for entity "${entity}" references undefined role "${role}"`,
          path: `authRules.permissions.${entity}`,
          repairHint: `Add role "${role}" to authRules.roles or remove this permission`,
        });
      }
    }
  }

  // Integration hooks must reference registered integrations
  for (const hook of spec.integrationHooks) {
    if (!registeredIntegrations.has(hook.integrationId)) {
      errors.push({
        code: "UNKNOWN_INTEGRATION",
        message: `Integration hook references unregistered integration "${hook.integrationId}"`,
        path: `integrationHooks`,
        repairHint: `Registered integrations: ${[...registeredIntegrations].join(", ")}`,
      });
    } else {
      // Validate the action exists
      const integration = INTEGRATION_REGISTRY[hook.integrationId];
      const validAction = integration.actions.some((a) => a.id === hook.actionId);
      if (!validAction) {
        errors.push({
          code: "UNKNOWN_INTEGRATION_ACTION",
          message: `Integration "${hook.integrationId}" has no action "${hook.actionId}"`,
          path: `integrationHooks`,
          repairHint: `Valid actions: ${integration.actions.map((a) => a.id).join(", ")}`,
        });
      }
    }
  }

  // Workflow stubs must reference valid entities
  for (const stub of spec.workflowStubs) {
    if (!entityNames.has(stub.trigger.entity)) {
      errors.push({
        code: "WORKFLOW_UNKNOWN_ENTITY",
        message: `Workflow stub "${stub.name}" references unknown entity "${stub.trigger.entity}"`,
        path: `workflowStubs.${stub.name}`,
        repairHint: `Use one of: ${[...entityNames].join(", ")}`,
      });
    }
    if (!registeredIntegrations.has(stub.integration)) {
      errors.push({
        code: "WORKFLOW_UNKNOWN_INTEGRATION",
        message: `Workflow stub "${stub.name}" references unregistered integration "${stub.integration}"`,
        path: `workflowStubs.${stub.name}`,
        repairHint: `Registered: ${[...registeredIntegrations].join(", ")}`,
      });
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true };
}