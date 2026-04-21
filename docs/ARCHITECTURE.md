# Architecture

Lens has one job: turn an AI shopping answer into an audit card in under 20 seconds. The pipeline runs partially in parallel, with each stage playing to a specific Claude Opus 4.7 capability.

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                              User                                      │
  │   paste AI answer  ─┐           ┌─ drop screenshot                     │
  └────────────────────┬┴───────────┴───────────────────────────────────────┘
                       │
                       ▼
             apps/extension      apps/web
                       │                │
                       └─────┬──────────┘
                             ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                   workers/api  (Cloudflare Workers)                    │
  │                                                                        │
  │   POST /audit  |  POST /audit/stream (SSE)                             │
  │                                                                        │
  │   ┌──────────────┐                                                     │
  │   │ 1. EXTRACT   │  Opus 4.7 + extended thinking                       │
  │   │  (src/extract.ts)                                                  │
  │   │  -> UserIntent (criteria, weights)                                 │
  │   │  -> AIRecommendation (picked product + claims + reasoning)         │
  │   │  vision branch: reads screenshot via Opus 4.7 image input          │
  │   └──────┬───────┘                                                     │
  │          │                                                             │
  │          ├─────────────────┬───────────────────────────────────────┐   │
  │          ▼                 ▼                                       ▼   │
  │   ┌──────────────┐  ┌────────────────┐                    ┌──────────┐ │
  │   │ 2. SEARCH    │  │ 5. CROSS-MODEL │                    │          │ │
  │   │  (src/search)│  │  (src/crossModel)                   │   LOG    │ │
  │   │              │  │                │                    │          │ │
  │   │ Opus 4.7 +   │  │ Managed Agent  │                    │  SSE to  │ │
  │   │ web_search_  │  │ fan-out to     │                    │ frontend │ │
  │   │ 20260209     │  │ GPT-5, Gemini, │                    │ per step │ │
  │   │ 1M context   │  │ Kimi K2        │                    │          │ │
  │   │ loads specs  │  │ in parallel    │                    │          │ │
  │   │              │  │                │                    │          │ │
  │   │ -> 10-20     │  │ -> 3 picks +   │                    │          │ │
  │   │   Candidates │  │  agreement map │                    │          │ │
  │   └──────┬───────┘  └────────┬───────┘                    └──────────┘ │
  │          │                   │                                         │
  │          ▼                   │                                         │
  │   ┌──────────────┐           │                                         │
  │   │ 3. VERIFY    │           │                                         │
  │   │  (src/verify)│           │                                         │
  │   │              │           │                                         │
  │   │ Opus 4.7 +   │           │                                         │
  │   │ 1M context   │           │                                         │
  │   │ holds all    │           │                                         │
  │   │ spec sheets  │           │                                         │
  │   │ next to      │           │                                         │
  │   │ every claim  │           │                                         │
  │   │              │           │                                         │
  │   │ -> Claims    │           │                                         │
  │   │   with       │           │                                         │
  │   │   verdicts   │           │                                         │
  │   └──────┬───────┘           │                                         │
  │          ▼                   │                                         │
  │   ┌──────────────┐           │                                         │
  │   │ 4. RANK      │           │                                         │
  │   │  (src/rank)  │           │                                         │
  │   │              │           │                                         │
  │   │ Deterministic│           │                                         │
  │   │ utility =    │           │                                         │
  │   │ Σ wᵢ·sᵢ      │           │                                         │
  │   │ per-crit     │           │                                         │
  │   │ breakdown    │           │                                         │
  │   │ exposed for  │           │                                         │
  │   │ UI tooltips  │           │                                         │
  │   └──────┬───────┘           │                                         │
  │          │                   │                                         │
  │          └─────┬─────────────┘                                         │
  │                ▼                                                       │
  │           AuditResult                                                  │
  │                │                                                       │
  └────────────────┼───────────────────────────────────────────────────────┘
                   ▼
                 Frontend
```

## Why each stage uses Opus 4.7 specifically

| Stage | Capability leaned on | Why Opus 4.7 beats any other model |
|---|---|---|
| 1. Extract | Extended thinking | Decomposing a fluent paragraph into `{criteria, cited product, attribute claims}` requires reasoning about *why* the AI phrased each sentence — the thinking trace is exactly the right tool. |
| 2. Search | Server-side `web_search_20260209` tool + 1M context | 2026 web search has dynamic filtering; Opus 4.7 runs multiple refinement queries, then pulls 10-20 real spec sheets into a 1M-token context to compare alongside the AI's claims. |
| 3. Verify | 1M context + extended thinking | Each claim needs both the product's spec page *and* the candidate catalog simultaneously loaded — the 1M window makes it possible to check "is this claim misleading?" rather than just "is it true?". |
| 4. Rank | — (deterministic) | Intentionally LLM-free. Transparency is the selling point: every weight is inspectable, every score traces to a spec. User can drag sliders and see the ranking re-sort. |
| 5. Cross-model (Managed Agent) | Claude Managed Agent | Long-running, multi-provider hand-off. Agent owns rate limits, retries, and result aggregation. Fan-out to GPT-5, Gemini, Kimi K2 in parallel. |

## Runtime layout

- **`workers/api`** — the orchestrator Worker, one deploy. Hosts `/audit` and `/audit/stream`.
- **`workers/cross-model`** — the Managed Agent endpoint (Day 3). `CROSS_MODEL_AGENT_URL` on `workers/api` points here; when unset, `workers/api` does the fan-out itself as a Day 1 fallback.
- **`apps/web`** — Vite SPA; deploys to Cloudflare Pages.
- **`apps/extension`** — Chrome MV3; load-unpacked for judging, Chrome Web Store later.
- **`packages/shared`** — Zod schemas + TypeScript types; imported by every app and worker.
- **`fixtures/scenarios/*`** — canonical demo inputs with expected verdicts for deterministic playback.

## Open source posture

- MIT license.
- No proprietary data, no pre-existing code from other repos, no third-party paid APIs required for the core demo.
- Third-party integrations (OpenAI, Google, OpenRouter) are optional; if a key is absent, that row is simply omitted from the cross-model panel.
- Anthropic web search is a server tool billed on Anthropic's side — no separate search-provider contract.

## Threat model (what Lens does NOT claim)

- Lens does not *prove* the AI is wrong. It re-solves the problem from scratch and surfaces the gap.
- Lens cannot verify claims the user did not ask the AI about.
- Lens's ranking uses the user's stated criteria. If the user's criteria are incomplete, the spec-optimal pick will be incomplete too. The sliders exist precisely so the user can correct this.
- Cross-model agreement is advisory. Other frontier models are subject to the same training-data priors identified in the underlying paper.
