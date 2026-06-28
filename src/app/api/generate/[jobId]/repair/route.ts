import { NextRequest, NextResponse } from "next/server";
import { getJob, emit, updateStage } from "@/store/jobs";
import { repairStructural, repairField, repairConsistency } from "@/repair";
import { validateIntent, validateSchema, validateAppSpec } from "@/validation";
import type { PipelineStage, ValidationError } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await req.json();
  const { stage } = body as {
    stage: PipelineStage;
    errorHint?: string;
  };

  if (!stage || !["intent", "schema", "appspec"].includes(stage)) {
    return NextResponse.json(
      { error: "stage must be one of: intent, schema, appspec" },
      { status: 400 }
    );
  }

  const stageResult = job.stages[stage];

  if (!stageResult.output) {
    return NextResponse.json(
      { error: `Stage ${stage} has no output to repair` },
      { status: 400 }
    );
  }

  const logs: import("@/types").RepairLogEntry[] = [];
  let parsed = stageResult.output as Record<string, unknown>;

  // Initial validation
  let validation =
    stage === "intent"
      ? validateIntent(parsed)
      : stage === "schema"
      ? validateSchema(parsed)
      : validateAppSpec(
          parsed,
          job.stages.schema.output as Parameters<typeof validateAppSpec>[1]
        );

  if (validation.valid) {
    return NextResponse.json({
      message: "Stage output is already valid",
      repairLog: [],
    });
  }

  const errors = (validation as { valid: false; errors: ValidationError[] }).errors;

  // 1. Structural repair
  const structural = repairStructural(JSON.stringify(parsed));
  logs.push(structural.log);

  if (structural.repaired) {
    parsed = structural.value as Record<string, unknown>;
  }

  // 2. Field repair
  const fieldRepair = repairField(parsed, errors, stage, 1);
  logs.push(...fieldRepair.logs);
  parsed = fieldRepair.value;

  // 3. Consistency repair
  const consistencyRepair = repairConsistency(
    parsed,
    errors,
    stage === "appspec"
      ? (job.stages.schema.output as Parameters<typeof repairConsistency>[2])
      : null,
    2
  );

  logs.push(...consistencyRepair.logs);
  parsed = consistencyRepair.value;

  // Re-validate
  validation =
    stage === "intent"
      ? validateIntent(parsed)
      : stage === "schema"
      ? validateSchema(parsed)
      : validateAppSpec(
          parsed,
          job.stages.schema.output as Parameters<typeof validateAppSpec>[1]
        );

  updateStage(jobId, stage, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output: parsed as any,
    repairLog: [...stageResult.repairLog, ...logs],
    status: validation.valid ? "complete" : "failed",
  });

  emit(jobId, {
    type: validation.valid ? "stage_complete" : "stage_failed",
    stage,
    timestamp: new Date().toISOString(),
    data: parsed,
    repairLog: logs,
  });

  return NextResponse.json({
    repaired: validation.valid,
    repairLog: logs,
    remainingErrors: validation.valid
      ? []
      : (validation as { valid: false; errors: ValidationError[] }).errors,
  });
}