# OneAtlas — AI Generation Pipeline

A multi-stage AI pipeline that converts a natural language app description into a validated, machine-readable AppSpec.

## Live Demo
https://your-deployment.vercel.app

---

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Zod
- Server-Sent Events (SSE)
- Groq API

---

## Local Setup (under 5 minutes)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/oneatlas.git
cd oneatlas
npm install
```

### 2. Add environment variables

```bash
cp .env.example .env.local
```

Fill in the required keys:

- `GROQ_API_KEY`
- `OPENROUTER_API_KEY` (optional fallback)
- `GEMINI_API_KEY` (optional)
- `OPENAI_API_KEY` (optional)
- `ANTHROPIC_API_KEY` (optional)
- `DEEPSEEK_API_KEY` (optional)
- `MISTRAL_API_KEY` (optional)
- `GOOGLE_AI_API_KEY` (optional)

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000

---

## Folder Structure

```text
src/
├── types/
│   └── index.ts
├── gateway/
│   ├── index.ts
│   └── routing.config.ts
├── validation/
│   └── index.ts
├── repair/
│   └── index.ts
├── integrations/
│   └── registry.ts
├── pipeline/
│   ├── stage1-intent.ts
│   ├── stage2-schema.ts
│   ├── stage3-appspec.ts
│   └── orchestrator.ts
├── store/
│   └── jobs.ts
└── app/
    ├── page.tsx
    └── api/
        ├── generate/
        └── integrations/
```

---

## Pipeline Architecture

Prompt → Intent Extraction → Validation → Schema Generation → Validation → AppSpec Generation → Validation → Final AppSpec

Each stage:

- Calls the configured AI gateway
- Runs Zod validation
- Invokes the repair engine on validation failure
- Streams progress through SSE
- Proceeds only after successful validation

---

## Design Goals

- Deterministic multi-stage generation
- Validation between every stage
- Automatic recovery from invalid model output
- Configuration-driven routing
- Clear separation between generation and orchestration

---

## Stage Details

### Stage 1 — Intent Extraction

**Input:** Natural language prompt

**Output:** AppIntent

- appName
- appType
- features
- entities
- integrations_requested
- assumptions

Handles vague prompts by recording explicit assumptions.

### Stage 2 — Schema Generation

**Input:** AppIntent

**Output:** DataSchema

Generates:

- Entities
- Fields
- Relations

Adds standard metadata:

- id
- tenantId
- createdAt
- updatedAt

Validates entity relationships before proceeding.

### Stage 3 — AppSpec Generation

**Input:** AppIntent + DataSchema

**Output:** AppSpec

Generates:

- Pages
- API endpoints
- Auth rules
- Workflow stubs
- Integration hooks

Ensures pages, endpoints and workflows remain internally consistent.

---

## AI Gateway & Routing

Model routing is centralized in `src/gateway/routing.config.ts`.

Pipeline stages remain independent of provider-specific implementations, allowing routing behaviour to be modified through configuration instead of changing stage logic.

The evaluation configuration included with this repository is optimized for a stable and reproducible local development setup.

---

## Repair Engine

Three repair strategies are executed after validation failures.

### Structural Repair

- malformed JSON
- truncated output
- invalid formatting

### Field Repair

- missing required fields
- default value injection
- type correction

### Consistency Repair

- invalid relations
- missing API/page mappings
- invalid integration references

If deterministic repair fails, an LLM-based repair prompt is used.

Every repair attempt is logged.

---

## Integration Registry

| Integration | Status |
|-------------|--------|
| Slack | Implemented |
| Gmail | Implemented |
| Stripe | Implemented |
| WhatsApp | Implemented |
| Webhook | Implemented |
| Notion | Stubbed |
| Jira | Stubbed |
| GitHub | Stubbed |

---

## API Endpoints

| Method | Endpoint |
|--------|----------|
| POST | `/api/generate` |
| GET | `/api/generate/:jobId` |
| GET | `/api/generate/:jobId/stream` |
| POST | `/api/generate/:jobId/repair` |
| GET | `/api/integrations` |

---

## Frontend

The UI provides:

- Prompt editor
- Live pipeline progress
- Validation status
- Repair history
- Generated AppSpec viewer
- Integration registry
- Cost summary

---

## Deliberate Cuts

To prioritize pipeline reliability within the implementation window:

- Persistent storage deferred (currently in-memory)
- OAuth flows deferred
- Stubbed integrations do not perform live HTTP requests
- API rate limiting not implemented
- Evaluation executed manually instead of through an automated runner

---

## Known Limitations

- Jobs are stored in memory and are lost after restart.
- Stubbed integrations expose schemas but not live execution.
- OAuth authentication is intentionally omitted.
- API rate limiting is not implemented.
- External provider rate limits depend on the configured API.

---

## What Is Implemented

- Multi-stage AI pipeline
- Validation after every stage
- Repair engine
- Config-driven routing
- SSE streaming
- Integration registry
- Workflow generation
- Cost estimation
- Typed Zod schemas
- Interactive frontend

---

## What Is Stubbed

- Live HTTP execution for Notion, Jira and GitHub
- OAuth authentication flows
- Persistent job storage
- API rate limiting

---

## Evaluation

A separate `evaluation.md` file contains:

- Results for all evaluation prompts
- Success/failure
- Repair behaviour
- Latency
- Summary of observations

---

## What Would You Build Next With 2 More Days?

1. Redis-backed persistent job storage
2. Code generation from AppSpec
3. Live integration execution
4. Streaming partial generation
5. Automated evaluation runner and benchmarking
