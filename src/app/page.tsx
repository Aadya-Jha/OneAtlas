"use client";

import { useState, useRef } from "react";
import type {
  SSEEvent,
  AppIntent,
  DataSchema,
  AppSpec,
  RepairLogEntry,
  PipelineStage,
} from "@/types";

type StageInfo = {
  status: "pending" | "running" | "complete" | "failed";
  latencyMs?: number;
  repairLog: RepairLogEntry[];
  error?: string;
};

type PipelineState = {
  jobId: string | null;
  status: "idle" | "running" | "complete" | "failed";
  stages: Record<PipelineStage, StageInfo>;
  intent: AppIntent | null;
  schema: DataSchema | null;
  appSpec: AppSpec | null;
  error: string | null;
};

const defaultStage = (): StageInfo => ({ status: "pending", repairLog: [] });

const initialState: PipelineState = {
  jobId: null,
  status: "idle",
  stages: {
    intent: defaultStage(),
    schema: defaultStage(),
    appspec: defaultStage(),
  },
  intent: null,
  schema: null,
  appSpec: null,
  error: null,
};

const EXAMPLE_PROMPTS = [
  "CRM for a real estate agency. Agents manage leads, properties, and deals. WhatsApp notifications when a deal closes.",
  "Task manager for an engineering team. Slack alert when tasks go overdue.",
  "E-commerce backend with Stripe payments and Gmail order confirmations.",
];

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "green" | "orange" | "blue" | "red" | "purple" }) {
  const styles = {
    default: "bg-gray-100 text-gray-600",
    green:   "bg-emerald-50 text-emerald-700",
    orange:  "bg-amber-50 text-amber-700",
    blue:    "bg-indigo-50 text-indigo-700",
    red:     "bg-red-50 text-red-600",
    purple:  "bg-purple-50 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

function StageRow({ stage, info, isLast }: { stage: PipelineStage; info: StageInfo; isLast: boolean }) {
  const labels: Record<PipelineStage, string> = {
    intent: "Intent Extraction",
    schema: "Schema Generation",
    appspec: "AppSpec Generation",
  };
  const dotStyle = {
    pending:  "bg-gray-200",
    running:  "bg-[#E8372A] animate-pulse",
    complete: "bg-emerald-500",
    failed:   "bg-red-500",
  }[info.status];

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center pt-0.5">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotStyle}`} />
        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-8" />}
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${info.status === "pending" ? "text-gray-400" : "text-gray-900"}`}>
            {labels[stage]}
          </span>
          {info.status === "complete" && <Badge variant="green">{info.latencyMs ? `${(info.latencyMs / 1000).toFixed(1)}s` : "Done"}</Badge>}
          {info.status === "running" && <Badge variant="orange">Running</Badge>}
          {info.status === "failed" && <Badge variant="red">Failed</Badge>}
          {info.repairLog.length > 0 && <Badge variant="orange">{info.repairLog.length} repair{info.repairLog.length > 1 ? "s" : ""}</Badge>}
        </div>
        {info.error && <p className="text-xs text-red-500 mt-1 truncate max-w-xs">{info.error}</p>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function EntitiesPanel({ schema }: { schema: DataSchema }) {
  const [expanded, setExpanded] = useState<string | null>(schema.entities[0]?.name ?? null);
  return (
    <div>
      <SectionLabel>Entities · {schema.entities.length}</SectionLabel>
      <div className="space-y-2">
        {schema.entities.map((entity) => (
          <div key={entity.name} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
              onClick={() => setExpanded(expanded === entity.name ? null : entity.name)}
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#E8372A] text-xs font-bold">{entity.name[0]}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{entity.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{entity.tableName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default">{entity.fields.length} fields</Badge>
                {entity.relations.length > 0 && <Badge variant="blue">{entity.relations.length} relations</Badge>}
                <span className="text-gray-300 text-xs ml-1">{expanded === entity.name ? "▲" : "▼"}</span>
              </div>
            </button>
            {expanded === entity.name && (
              <div className="border-t border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-2 text-gray-400 font-medium">Field</th>
                      <th className="text-left px-4 py-2 text-gray-400 font-medium">Type</th>
                      <th className="text-left px-4 py-2 text-gray-400 font-medium">Nullable</th>
                      <th className="text-left px-4 py-2 text-gray-400 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity.fields.map((f) => (
                      <tr key={f.name} className="border-t border-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-700">{f.name}</td>
                        <td className="px-4 py-2"><Badge variant="blue">{f.type}</Badge></td>
                        <td className="px-4 py-2 text-gray-400">{f.nullable ? "yes" : "no"}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            {f.isPrimary && <Badge variant="orange">PK</Badge>}
                            {f.isUnique && <Badge variant="purple">UQ</Badge>}
                            {f.isRelation && <Badge variant="green">FK</Badge>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entity.relations.length > 0 && (
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-1.5">
                    <p className="text-xs text-gray-400 font-medium mb-2">Relations</p>
                    {entity.relations.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Badge variant="blue">{r.type}</Badge>
                        <span className="font-medium text-gray-700">{r.target}</span>
                        <span className="text-gray-400">via {r.foreignKey}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PagesPanel({ spec }: { spec: AppSpec }) {
  const layoutColor: Record<string, "blue" | "green" | "purple" | "orange"> = {
    list: "blue", detail: "green", dashboard: "purple", settings: "orange",
  };
  return (
    <div>
      <SectionLabel>Pages · {spec.pages.length}</SectionLabel>
      <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Page</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Route</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Layout</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Entity</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Components</th>
            </tr>
          </thead>
          <tbody>
            {spec.pages.map((p, i) => (
              <tr key={p.route} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                <td className="px-4 py-2.5 font-semibold text-gray-800">{p.name}</td>
                <td className="px-4 py-2.5 font-mono text-[#E8372A]">{p.route}</td>
                <td className="px-4 py-2.5"><Badge variant={layoutColor[p.layout] ?? "default"}>{p.layout}</Badge></td>
                <td className="px-4 py-2.5 text-gray-500">{p.boundEntity}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {p.components.map((c) => <Badge key={c} variant="default">{c}</Badge>)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EndpointsPanel({ spec }: { spec: AppSpec }) {
  const methodStyle: Record<string, string> = {
    GET:    "bg-emerald-50 text-emerald-700",
    POST:   "bg-blue-50 text-blue-700",
    PUT:    "bg-amber-50 text-amber-700",
    PATCH:  "bg-orange-50 text-orange-700",
    DELETE: "bg-red-50 text-red-600",
  };
  return (
    <div>
      <SectionLabel>API Endpoints · {spec.apiEndpoints.length}</SectionLabel>
      <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Method</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Path</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Entity</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Auth</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {spec.apiEndpoints.map((ep, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded font-bold font-mono ${methodStyle[ep.method] ?? "bg-gray-100 text-gray-600"}`}>
                    {ep.method}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-gray-700">{ep.path}</td>
                <td className="px-4 py-2.5 text-gray-500">{ep.boundEntity}</td>
                <td className="px-4 py-2.5">
                  {ep.authRequired ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-400 max-w-xs truncate">{ep.handlerDescription}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkflowsPanel({ spec }: { spec: AppSpec }) {
  if (!spec.workflowStubs.length) return null;
  const integrationColor: Record<string, "green" | "blue" | "orange" | "red" | "purple"> = {
    slack: "purple", stripe: "blue", gmail: "red", whatsapp: "green", webhook: "orange",
    notion: "orange", jira: "blue", github: "orange",
  };
  return (
    <div>
      <SectionLabel>Workflow Stubs · {spec.workflowStubs.length}</SectionLabel>
      <div className="grid gap-3">
        {spec.workflowStubs.map((w, i) => (
          <div key={i} className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-gray-900">{w.name}</p>
              <Badge variant={integrationColor[w.integration] ?? "default"}>{w.integration}</Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <div className="bg-gray-50 rounded-md px-2 py-1 flex items-center gap-1.5">
                <span className="text-gray-400">entity</span>
                <span className="font-medium text-gray-700">{w.trigger.entity}</span>
              </div>
              <span className="text-gray-300">→</span>
              <div className="bg-gray-50 rounded-md px-2 py-1 flex items-center gap-1.5">
                <span className="text-gray-400">on</span>
                <span className="font-medium text-gray-700">{w.trigger.event}</span>
              </div>
              {w.trigger.condition && (
                <>
                  <span className="text-gray-300">→</span>
                  <div className="bg-amber-50 rounded-md px-2 py-1 text-amber-700 font-medium">if {w.trigger.condition}</div>
                </>
              )}
              <span className="text-gray-300">→</span>
              <div className="bg-indigo-50 rounded-md px-2 py-1 text-indigo-700 font-medium">{w.action}</div>
            </div>
            {Object.keys(w.payload).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2 font-medium">Payload mapping</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(w.payload).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1 text-xs bg-gray-50 rounded-md px-2 py-1">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-300 mx-0.5">→</span>
                      <span className="text-gray-700 font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthPanel({ spec }: { spec: AppSpec }) {
  return (
    <div>
      <SectionLabel>Auth · {spec.authRules.roles.length} roles</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(spec.authRules.permissions).map(([entity, rolePerms]) => (
          <div key={entity} className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <span className="text-[#E8372A] text-xs font-bold">{entity[0]}</span>
              </div>
              <p className="text-sm font-semibold text-gray-800">{entity}</p>
            </div>
            <div className="space-y-2">
              {Object.entries(rolePerms).map(([role, perms]) => (
                <div key={role} className="flex items-center justify-between">
                  <Badge variant="purple">{role}</Badge>
                  <div className="flex gap-1">
                    {(perms as string[]).map((p) => (
                      <Badge key={p} variant={p === "delete" ? "red" : p === "write" ? "orange" : "green"}>{p}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<PipelineState>(initialState);
  const esRef = useRef<EventSource | null>(null);

  function updateStageInfo(stage: PipelineStage, update: Partial<StageInfo>) {
    setState((s) => ({
      ...s,
      stages: { ...s.stages, [stage]: { ...s.stages[stage], ...update } },
    }));
  }

  async function handleSubmit() {
    if (!prompt.trim() || state.status === "running") return;
    if (esRef.current) esRef.current.close();
    setState({ ...initialState, status: "running" });

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const err = await res.json();
      setState((s) => ({ ...s, status: "failed", error: err.error }));
      return;
    }

    const { jobId } = await res.json();
    setState((s) => ({ ...s, jobId }));

    // Wait for the server to register the job before opening the SSE stream
    await new Promise((resolve) => setTimeout(resolve, 500));

    let es: EventSource;
    const connectStream = () => {
      es = new EventSource(`/api/generate/${jobId}/stream`);
      
      es.onmessage = (e) => {
        const event: SSEEvent = JSON.parse(e.data);
        switch (event.type) {
          case "stage_start":
            if (event.stage) updateStageInfo(event.stage, { status: "running" });
            break;
          case "stage_complete":
            if (event.stage) {
              updateStageInfo(event.stage, { status: "complete", repairLog: event.repairLog ?? [] });
              if (event.stage === "intent") setState((s) => ({ ...s, intent: event.data as AppIntent }));
              if (event.stage === "schema") setState((s) => ({ ...s, schema: event.data as DataSchema }));
              if (event.stage === "appspec") setState((s) => ({ ...s, appSpec: event.data as AppSpec }));
            }
            break;
          case "stage_failed":
            if (event.stage)
              updateStageInfo(event.stage, { status: "failed", repairLog: event.repairLog ?? [], error: event.error });
            break;
          case "generation_complete":
            setState((s) => ({ ...s, status: "complete" }));
            es.close();
            break;
          case "generation_failed":
            setState((s) => ({ ...s, status: "failed", error: event.error ?? "Generation failed" }));
            es.close();
            break;
        }
      };

      es.onerror = async () => {
        es.close();
        // Check if job is already complete before showing error
        try {
          const statusRes = await fetch(`/api/generate/${jobId}`);
          const jobData = await statusRes.json();
          if (jobData.status === "complete") {
            setState((s) => ({
              ...s,
              status: "complete",
              intent: jobData.stages.intent.output,
              schema: jobData.stages.schema.output,
              appSpec: jobData.stages.appspec.output,
              stages: {
                intent: { status: "complete", repairLog: jobData.stages.intent.repairLog ?? [] },
                schema: { status: "complete", repairLog: jobData.stages.schema.repairLog ?? [] },
                appspec: { status: "complete", repairLog: jobData.stages.appspec.repairLog ?? [] },
              },
            }));
          } else if (jobData.status === "failed") {
            setState((s) => ({ ...s, status: "failed", error: "Generation failed" }));
          } else {
            // Still running, retry stream after delay
            await new Promise((r) => setTimeout(r, 1000));
            connectStream();
          }
        } catch {
          setState((s) => ({ ...s, status: "failed", error: "Connection lost" }));
        }
      };

      esRef.current = es;
    };

    connectStream();
  }

  const totalRepairs = Object.values(state.stages).reduce((n, s) => n + s.repairLog.length, 0);
  const stagesComplete = Object.values(state.stages).filter((s) => s.status === "complete").length;

  return (
    <div className="min-h-screen bg-[#F7F7F8]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Nav */}
      <header className="bg-white border-b border-[#EBEBEB] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#E8372A] flex items-center justify-center">
              <span className="text-white text-xs font-black tracking-tight">OA</span>
            </div>
            <span className="text-sm font-bold text-gray-900">OneAtlas</span>
            <span className="text-gray-200 mx-0.5">·</span>
            <span className="text-sm text-gray-400">AI Pipeline</span>
          </div>
          <div className="flex items-center gap-4">
            {state.jobId && (
              <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-100 rounded px-2 py-1">
                {state.jobId.slice(0, 8)}…
              </span>
            )}
            <a href="/api/integrations" target="_blank" className="text-xs text-gray-500 hover:text-[#E8372A] transition-colors">
              Integrations ↗
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Left sidebar */}
          <div className="lg:col-span-1 space-y-4">

            {/* Input card */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-5">
                <p className="text-xs font-semibold text-[#E8372A] uppercase tracking-widest mb-2">AI Generation</p>
                <h1 className="text-lg font-bold text-gray-900 mb-1 leading-tight">Describe your app</h1>
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                  Plain English → entities, pages, API, auth, and workflow stubs.
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
                  placeholder="e.g. A CRM for real estate agents with WhatsApp notifications when a deal closes…"
                  rows={5}
                  className="w-full text-sm text-gray-800 placeholder-gray-300 border border-[#EBEBEB] rounded-xl px-3.5 py-3 resize-none focus:outline-none focus:border-gray-300 transition-colors leading-relaxed"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || state.status === "running"}
                  className="mt-3 w-full bg-[#E8372A] hover:bg-[#D12E23] active:bg-[#BC2920] disabled:bg-gray-100 disabled:text-gray-400 text-white disabled:cursor-not-allowed text-sm font-semibold rounded-xl py-2.5 transition-all"
                >
                  {state.status === "running" ? "Generating…" : "Generate AppSpec"}
                </button>
                <p className="text-center text-xs text-gray-300 mt-2">⌘ Enter to submit</p>
              </div>

              {state.status === "idle" && (
                <div className="border-t border-[#EBEBEB] px-5 py-4">
                  <p className="text-xs font-medium text-gray-400 mb-2.5">Try an example</p>
                  <div className="space-y-2">
                    {EXAMPLE_PROMPTS.map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => setPrompt(ex)}
                        className="w-full text-left text-xs text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors leading-relaxed"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Progress card */}
            {state.status !== "idle" && (
              <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm px-5 py-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-900">Pipeline</p>
                  {state.status === "complete" && <Badge variant="green">Complete</Badge>}
                  {state.status === "failed" && <Badge variant="red">Failed</Badge>}
                  {state.status === "running" && <Badge variant="orange">{stagesComplete}/3</Badge>}
                </div>
                {(["intent", "schema", "appspec"] as PipelineStage[]).map((stage, i) => (
                  <StageRow key={stage} stage={stage} info={state.stages[stage]} isLast={i === 2} />
                ))}
                {totalRepairs > 0 && (
                  <div className="pt-3 border-t border-gray-50">
                    <p className="text-xs text-amber-600 font-medium">⚡ {totalRepairs} auto-repair{totalRepairs > 1 ? "s" : ""} applied</p>
                  </div>
                )}
              </div>
            )}

            {/* Stats */}
            {state.status === "complete" && state.schema && state.appSpec && (
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Entities" value={state.schema.entities.length} sub="in schema" />
                <StatCard label="Pages" value={state.appSpec.pages.length} sub="generated" />
                <StatCard label="Endpoints" value={state.appSpec.apiEndpoints.length} sub="API routes" />
                <StatCard label="Workflows" value={state.appSpec.workflowStubs.length} sub="stubs" />
              </div>
            )}

            {/* Error */}
            {state.error && (
              <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-4">
                <p className="text-xs font-semibold text-red-600 mb-1">Generation failed</p>
                <p className="text-xs text-red-500 leading-relaxed">{state.error}</p>
              </div>
            )}
          </div>

          {/* Main output area */}
          <div className="lg:col-span-2">
            {state.status === "idle" && (
              <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm min-h-[480px] flex flex-col items-center justify-center text-center px-8">
                <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
                  <span className="text-gray-300 text-2xl">⊞</span>
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-2">AppSpec appears here</p>
                <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                  Describe your app on the left. The pipeline returns entities, pages, API endpoints, auth rules, and integration workflows.
                </p>
              </div>
            )}

            {state.status === "running" && !state.appSpec && (
              <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm min-h-[480px] flex flex-col items-center justify-center gap-4">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#E8372A] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-400">
                  {state.stages.intent.status === "running" && "Extracting intent…"}
                  {state.stages.schema.status === "running" && "Generating schema…"}
                  {state.stages.appspec.status === "running" && "Building AppSpec…"}
                  {state.stages.intent.status === "pending" && "Starting pipeline…"}
                </p>
              </div>
            )}

            {state.schema && state.appSpec && state.intent && (
              <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm">
                {/* App header */}
                <div className="px-6 py-5 border-b border-[#EBEBEB]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <h2 className="text-lg font-bold text-gray-900">{state.intent.appName}</h2>
                        <Badge variant="blue">{state.intent.appType}</Badge>
                      </div>
                      {state.intent.integrations_requested.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-xs text-gray-400 mr-1">Integrations:</span>
                          {state.intent.integrations_requested.map((int) => (
                            <Badge key={int} variant="orange">{int}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {state.jobId && (
                      <a
                        href={`/api/generate/${state.jobId}`}
                        target="_blank"
                        className="text-xs text-[#E8372A] hover:underline whitespace-nowrap flex-shrink-0"
                      >
                        View JSON ↗
                      </a>
                    )}
                  </div>

                  {state.intent.features.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {state.intent.features.slice(0, 6).map((f) => (
                        <Badge key={f} variant="default">{f}</Badge>
                      ))}
                      {state.intent.features.length > 6 && (
                        <Badge variant="default">+{state.intent.features.length - 6} more</Badge>
                      )}
                    </div>
                  )}

                  {state.intent.assumptions.length > 0 && (
                    <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2">Assumptions made</p>
                      <ul className="space-y-1">
                        {state.intent.assumptions.map((a, i) => (
                          <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                            <span className="flex-shrink-0 mt-0.5">·</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Spec panels */}
                <div className="px-6 py-6 space-y-8">
                  <EntitiesPanel schema={state.schema} />
                  <PagesPanel spec={state.appSpec} />
                  <EndpointsPanel spec={state.appSpec} />
                  <WorkflowsPanel spec={state.appSpec} />
                  <AuthPanel spec={state.appSpec} />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}