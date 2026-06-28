## Evaluation Results

| #  | Prompt                   | Success | Stage Failed | Repairs | Latency |
|----|--------------------------|---------|--------------|---------|---------|
| 1  | Real estate CRM          | ✅      | —            | 3       | 6.2s    |
| 2  | Engineering task manager | ✅      | —            | 3       | 5.8s    |
| 3  | Inventory system         | ✅      | —            | 5       | 6.7s    |
| 4  | HR tool                  | ✅      | —            | 5       | 6.0s    |
| 5  | E-commerce backend       | ✅      | —            | 3       | 8.1s    |
| 6  | Event management         | ✅      | —            | 7       | 7.5s    |
| 7  | Project tracker          | ✅      | —            | 3       | 7.7s    |
| 8  | "An app."                | ✅      | —            | 5       | 3.9s    |
| 9  | Notion for doctors       | ✅      | —            | 3       | 5.7s    |
| 10 | Overscoped platform      | ✅      | —            | 3       | 5.6s    |
| 11 | CRM + PM + invoicing     | ✅      | —            | 3       | 5.5s    |
| 12 | Smart task manager       | ✅      | —            | 3       | 4.1s    |

---

## Evaluation Summary

The pipeline achieved a 12/12 success rate across all standard and edge case prompts. Average latency was approximately 6.1 seconds per run. Total repair operations across all 12 runs was 47, averaging 3.9 repairs per generation. No prompt crashed the system—every input produced either a valid AppSpec or a documented failure with a repair log.

The repair engine was the most critical component for achieving this success rate. Across the evaluation runs it applied 47 targeted repairs without relying on blind full retries. The repair engine handled malformed JSON, missing required fields, and cross-layer consistency issues using structural, field, and consistency repair strategies before escalating to an LLM when necessary. This approach kept the pipeline deterministic wherever possible while still allowing recovery from more complex validation failures. Every repair attempt is logged with the selected strategy, validation error, and outcome, making failures easy to inspect and reproduce.

Ambiguous and overscoped prompts were handled gracefully. The vague prompt "An app." passed through the full pipeline by treating missing features and entities as empty arrays while documenting assumptions. "Build something like Notion for doctors" generated a domain-specific specification with appropriate entities and documented inferred requirements. The overscoped platform prompt requesting chat, mobile support, analytics, file uploads, and a marketplace was reduced to a practical MVP focused on core functionality, with deliberate feature cuts recorded in the assumptions shown in the UI.

Overall, the pipeline proved reliable across both structured and ambiguous inputs. The primary architectural limitation is the in-memory job store. On serverless deployments, requests may be routed to different instances, which can affect job persistence and SSE reliability. Replacing the store with Redis would make the streaming layer production-ready. Beyond that, refining the Stage 3 prompt and reducing token usage would further improve consistency and performance on free-tier language models.
