import { z } from "zod";

// ─── Stage 1: AppIntent ───────────────────────────────────────────────────────

export const AppTypeEnum = z.enum([
  "crm",
  "project_management",
  "ecommerce",
  "hr_tool",
  "inventory",
  "content_platform",
  "analytics",
  "custom",
]);

export const AppIntentSchema = z.object({
  appName: z.string().min(1),
  appType: AppTypeEnum,
  features: z.array(z.string()).min(1),
  entities: z.array(z.string()).min(1),
  integrations_requested: z.array(z.string()),
  assumptions: z.array(z.string()),
  clarification_required: z
    .object({
      flag: z.literal(true),
      question: z.string(),
    })
    .optional(),
});

export type AppIntent = z.infer<typeof AppIntentSchema>;

// ─── Stage 2: DataSchema ─────────────────────────────────────────────────────

export const FieldTypeEnum = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "uuid",
  "text",
  "json",
  "enum",
]);

export const FieldSchema = z.object({
  name: z.string(),
  type: FieldTypeEnum,
  nullable: z.boolean(),
  isPrimary: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isRelation: z.boolean().optional(),
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.string().optional(),
});

export const RelationSchema = z.object({
  type: z.enum(["hasMany", "belongsTo", "hasOne"]),
  target: z.string(),
  foreignKey: z.string(),
  onDelete: z.enum(["CASCADE", "SET_NULL", "RESTRICT"]).optional(),
});

export const EntitySchemaItem = z.object({
  name: z.string(),
  tableName: z.string().regex(/^[a-z_]+$/, "Must be snake_case"),
  fields: z.array(FieldSchema).min(1),
  relations: z.array(RelationSchema),
});

export const DataSchemaOutput = z.object({
  entities: z.array(EntitySchemaItem).min(1),
});

export type EntitySchema = z.infer<typeof EntitySchemaItem>;
export type DataSchema = z.infer<typeof DataSchemaOutput>;

// ─── Stage 3: AppSpec ────────────────────────────────────────────────────────

export const ComponentTypeEnum = z.enum(["table", "form", "chart", "card"]);
export const LayoutTypeEnum = z.enum(["list", "detail", "dashboard", "settings"]);
export const HttpMethodEnum = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export const PermissionEnum = z.enum(["read", "write", "delete"]);

export const PageSchema = z.object({
  name: z.string(),
  route: z.string().startsWith("/"),
  layout: LayoutTypeEnum,
  boundEntity: z.string(),
  components: z.array(ComponentTypeEnum).min(1),
});

export const ApiEndpointSchema = z.object({
  path: z.string().startsWith("/"),
  method: HttpMethodEnum,
  handlerDescription: z.string(),
  boundEntity: z.string(),
  authRequired: z.boolean(),
  rateLimitFlag: z.boolean(),
});

export const AuthRuleSchema = z.object({
  roles: z.array(z.string()).min(1),
  permissions: z.record(
    z.string(), // entity name
    z.record(z.string(), z.array(PermissionEnum)) // role -> permissions
  ),
});

export const IntegrationHookSchema = z.object({
  integrationId: z.string(),
  trigger: z.object({
    entity: z.string(),
    event: z.enum(["created", "updated", "deleted", "status_changed"]),
    condition: z.string().optional(),
  }),
  actionId: z.string(),
});

export const WorkflowStubSchema = z.object({
  name: z.string(),
  trigger: z.object({
    entity: z.string(),
    event: z.enum(["created", "updated", "deleted", "status_changed"]),
    condition: z.string().optional(),
  }),
  integration: z.string(),
  action: z.string(),
  payload: z.record(z.string(), z.string()),
});

export const AppSpecSchema = z.object({
  pages: z.array(PageSchema).min(1),
  apiEndpoints: z.array(ApiEndpointSchema).min(1),
  authRules: AuthRuleSchema,
  integrationHooks: z.array(IntegrationHookSchema),
  workflowStubs: z.array(WorkflowStubSchema),
});

export type AppSpec = z.infer<typeof AppSpecSchema>;

// ─── Validation & Repair ─────────────────────────────────────────────────────

export type ValidationError = {
  code: string;
  message: string;
  path?: string;
  repairHint?: string;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

export type RepairStrategy = "structural" | "field" | "consistency";

export type RepairLogEntry = {
  strategy: RepairStrategy;
  errorInput: string;
  outcome: "repaired" | "escalated" | "failed";
  timestamp: string;
  stageAttempt: number;
};

// ─── Job ─────────────────────────────────────────────────────────────────────

export type PipelineStage = "intent" | "schema" | "appspec";

export type StageStatus = "pending" | "running" | "complete" | "failed";

export type StageResult = {
  stage: PipelineStage;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  output?: AppIntent | DataSchema | AppSpec;
  error?: string;
  repairLog: RepairLogEntry[];
  tokensUsed?: number;
  estimatedCostUSD?: number;
};

export type Job = {
  id: string;
  prompt: string;
  createdAt: string;
  status: "pending" | "running" | "complete" | "failed";
  stages: Record<PipelineStage, StageResult>;
  totalCostUSD: number;
  events: SSEEvent[];
};

// ─── SSE Events ──────────────────────────────────────────────────────────────

export type SSEEventType =
  | "stage_start"
  | "stage_complete"
  | "stage_failed"
  | "generation_complete"
  | "generation_failed";

export type SSEEvent = {
  type: SSEEventType;
  stage?: PipelineStage;
  timestamp: string;
  data?: unknown;
  error?: string;
  repairLog?: RepairLogEntry[];
};

// ─── Provider / Gateway ──────────────────────────────────────────────────────

export type AIProvider =
  | "openai"
  | "anthropic"
  | "groq"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "mistral"
  | "google_ai";

export type ModelTier = "fast" | "capable" | "fallback";

export type ModelRoute = {
  provider: AIProvider;
  model: string;
  tier: ModelTier;
};

export type StageRouteConfig = {
  primary: ModelRoute;
  fallback: ModelRoute;
};

export type GatewayRequest = {
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
};

export type GatewayResponse = {
  text: string;
  tokensUsed: number;
  estimatedCostUSD: number;
  provider: AIProvider;
  model: string;
};