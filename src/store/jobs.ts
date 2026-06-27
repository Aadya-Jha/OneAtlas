import { v4 as uuidv4 } from "uuid";
import type { Job, PipelineStage, SSEEvent, StageResult } from "@/types";

// ─── In-memory job store ──────────────────────────────────────────────────────

const jobs = new Map<string, Job>();

export function createJob(prompt: string): Job {
  const id = uuidv4();
  const now = new Date().toISOString();

  const makeStage = (stage: PipelineStage): StageResult => ({
    stage,
    status: "pending",
    repairLog: [],
  });

  const job: Job = {
    id,
    prompt,
    createdAt: now,
    status: "pending",
    stages: {
      intent: makeStage("intent"),
      schema: makeStage("schema"),
      appspec: makeStage("appspec"),
    },
    totalCostUSD: 0,
    events: [],
  };

  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function pushEvent(jobId: string, event: SSEEvent): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(event);
}

export function updateStage(
  jobId: string,
  stage: PipelineStage,
  update: Partial<StageResult>
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.stages[stage] = { ...job.stages[stage], ...update };
  job.totalCostUSD = Object.values(job.stages).reduce(
    (sum, s) => sum + (s.estimatedCostUSD ?? 0),
    0
  );
}

export function setJobStatus(
  jobId: string,
  status: Job["status"]
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = status;
}

// SSE subscriber system
type Subscriber = (event: SSEEvent) => void;
const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(jobId: string, cb: Subscriber): () => void {
  if (!subscribers.has(jobId)) {
    subscribers.set(jobId, new Set());
  }
  subscribers.get(jobId)!.add(cb);

  return () => {
    subscribers.get(jobId)?.delete(cb);
  };
}

export function emit(jobId: string, event: SSEEvent): void {
  pushEvent(jobId, event);
  subscribers.get(jobId)?.forEach((cb) => cb(event));
}