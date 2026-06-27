import { runIntentStage } from "@/pipeline/stage1-intent";
import { runSchemaStage } from "@/pipeline/stage2-schema";
import { runAppSpecStage } from "@/pipeline/stage3-appspec";
import { createJob, emit, updateStage, setJobStatus } from "@/store/jobs";
import type { PipelineStage } from "@/types";

export async function runPipeline(prompt: string): Promise<string> {
  const job = createJob(prompt);
  const jobId = job.id;

  // Run pipeline async — don't await here, caller gets jobId immediately
  setImmediate(() => executePipeline(jobId, prompt));

  return jobId;
}

async function executePipeline(jobId: string, prompt: string): Promise<void> {
  setJobStatus(jobId, "running");

  // ── Stage 1: Intent ──────────────────────────────────────────────────────
  const intentStart = Date.now();
  emit(jobId, {
    type: "stage_start",
    stage: "intent",
    timestamp: new Date().toISOString(),
  });

  updateStage(jobId, "intent", { status: "running", startedAt: new Date().toISOString() });

  const intentResult = await runIntentStage(prompt);
  const intentLatency = Date.now() - intentStart;

  if (!intentResult.intent) {
    updateStage(jobId, "intent", {
      status: "failed",
      completedAt: new Date().toISOString(),
      latencyMs: intentLatency,
      repairLog: intentResult.repairLog,
      tokensUsed: intentResult.tokensUsed,
      estimatedCostUSD: intentResult.estimatedCostUSD,
    });
    emit(jobId, {
      type: "stage_failed",
      stage: "intent",
      timestamp: new Date().toISOString(),
      error: intentResult.error,
      repairLog: intentResult.repairLog,
    });
    setJobStatus(jobId, "failed");
    emit(jobId, { type: "generation_failed", timestamp: new Date().toISOString(), error: intentResult.error });
    return;
  }

  updateStage(jobId, "intent", {
    status: "complete",
    completedAt: new Date().toISOString(),
    latencyMs: intentLatency,
    output: intentResult.intent,
    repairLog: intentResult.repairLog,
    tokensUsed: intentResult.tokensUsed,
    estimatedCostUSD: intentResult.estimatedCostUSD,
  });
  emit(jobId, {
    type: "stage_complete",
    stage: "intent",
    timestamp: new Date().toISOString(),
    data: intentResult.intent,
    repairLog: intentResult.repairLog,
  });

  // ── Stage 2: Schema ──────────────────────────────────────────────────────
  const schemaStart = Date.now();
  emit(jobId, {
    type: "stage_start",
    stage: "schema",
    timestamp: new Date().toISOString(),
  });

  updateStage(jobId, "schema", { status: "running", startedAt: new Date().toISOString() });

  const schemaResult = await runSchemaStage(intentResult.intent);
  const schemaLatency = Date.now() - schemaStart;

  if (!schemaResult.schema) {
    updateStage(jobId, "schema", {
      status: "failed",
      completedAt: new Date().toISOString(),
      latencyMs: schemaLatency,
      repairLog: schemaResult.repairLog,
      tokensUsed: schemaResult.tokensUsed,
      estimatedCostUSD: schemaResult.estimatedCostUSD,
    });
    emit(jobId, {
      type: "stage_failed",
      stage: "schema",
      timestamp: new Date().toISOString(),
      error: schemaResult.error,
      repairLog: schemaResult.repairLog,
    });
    setJobStatus(jobId, "failed");
    emit(jobId, { type: "generation_failed", timestamp: new Date().toISOString(), error: schemaResult.error });
    return;
  }

  updateStage(jobId, "schema", {
    status: "complete",
    completedAt: new Date().toISOString(),
    latencyMs: schemaLatency,
    output: schemaResult.schema,
    repairLog: schemaResult.repairLog,
    tokensUsed: schemaResult.tokensUsed,
    estimatedCostUSD: schemaResult.estimatedCostUSD,
  });
  emit(jobId, {
    type: "stage_complete",
    stage: "schema",
    timestamp: new Date().toISOString(),
    data: schemaResult.schema,
    repairLog: schemaResult.repairLog,
  });

  // ── Stage 3: AppSpec ─────────────────────────────────────────────────────
  const appspecStart = Date.now();
  emit(jobId, {
    type: "stage_start",
    stage: "appspec",
    timestamp: new Date().toISOString(),
  });

  updateStage(jobId, "appspec", { status: "running", startedAt: new Date().toISOString() });

  const appspecResult = await runAppSpecStage(schemaResult.schema, intentResult.intent);
  const appspecLatency = Date.now() - appspecStart;

  if (!appspecResult.appSpec) {
    updateStage(jobId, "appspec", {
      status: "failed",
      completedAt: new Date().toISOString(),
      latencyMs: appspecLatency,
      repairLog: appspecResult.repairLog,
      tokensUsed: appspecResult.tokensUsed,
      estimatedCostUSD: appspecResult.estimatedCostUSD,
    });
    emit(jobId, {
      type: "stage_failed",
      stage: "appspec",
      timestamp: new Date().toISOString(),
      error: appspecResult.error,
      repairLog: appspecResult.repairLog,
    });
    setJobStatus(jobId, "failed");
    emit(jobId, { type: "generation_failed", timestamp: new Date().toISOString(), error: appspecResult.error });
    return;
  }

  updateStage(jobId, "appspec", {
    status: "complete",
    completedAt: new Date().toISOString(),
    latencyMs: appspecLatency,
    output: appspecResult.appSpec,
    repairLog: appspecResult.repairLog,
    tokensUsed: appspecResult.tokensUsed,
    estimatedCostUSD: appspecResult.estimatedCostUSD,
  });
  emit(jobId, {
    type: "stage_complete",
    stage: "appspec",
    timestamp: new Date().toISOString(),
    data: appspecResult.appSpec,
    repairLog: appspecResult.repairLog,
  });

  setJobStatus(jobId, "complete");
  emit(jobId, {
    type: "generation_complete",
    timestamp: new Date().toISOString(),
    data: {
      intent: intentResult.intent,
      schema: schemaResult.schema,
      appSpec: appspecResult.appSpec,
    },
  });
}