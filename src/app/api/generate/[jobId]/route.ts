import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/store/jobs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = getJob(params.jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Build cost breakdown per stage
  const costBreakdown = Object.entries(job.stages).map(([stage, result]) => ({
    stage,
    tokensUsed: result.tokensUsed ?? 0,
    estimatedCostUSD: result.estimatedCostUSD ?? 0,
    latencyMs: result.latencyMs ?? 0,
  }));

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    prompt: job.prompt,
    createdAt: job.createdAt,
    totalCostUSD: job.totalCostUSD,
    costBreakdown,
    stages: {
      intent: {
        status: job.stages.intent.status,
        latencyMs: job.stages.intent.latencyMs,
        output: job.stages.intent.output,
        repairLog: job.stages.intent.repairLog,
        error: job.stages.intent.error,
      },
      schema: {
        status: job.stages.schema.status,
        latencyMs: job.stages.schema.latencyMs,
        output: job.stages.schema.output,
        repairLog: job.stages.schema.repairLog,
        error: job.stages.schema.error,
      },
      appspec: {
        status: job.stages.appspec.status,
        latencyMs: job.stages.appspec.latencyMs,
        output: job.stages.appspec.output,
        repairLog: job.stages.appspec.repairLog,
        error: job.stages.appspec.error,
      },
    },
  });
}