# S1-W8 — Adaptive preference clarification (Layer 2)

**Depends on:** F3 workflow engine ✅ (reused), existing extract.ts ✅.

**Goal:** When Opus 4.7 returns a UserIntent with one or more criteria at confidence < 0.6, Lens pauses the audit pipeline and asks the user 2–4 concrete binary trade-off questions (conjoint-style). Their answers flow back through an `/clarify` endpoint that updates the weights + optionally adds/renames criteria, and the pipeline resumes. No more "we guessed 0.3 for ANC battery life — hope that's right".

Per `BLOCK_PLAN.md`:

> Preference elicitation ★ (already live, expand)
> - Extension: add adaptive Layer 2 clarification. When any weight has confidence < 0.6, fire 2-4 binary trade-off questions. UI: modal inline in the paste-box with radio choices. Re-run extract with answers fed in.
> - Files: `workers/api/src/workflows/preference-elicit.ts`, `apps/web/src/components/ClarifyModal.tsx`.
> - Acceptance: ambiguous query ("something fast for work") triggers 3 clarifying questions.

Per `docs/PREFERENCE_INFERENCE.md` §Layer 2:

> Opus 4.7 returns a confidence score per inferred weight. When any weight falls below threshold (low confidence), Lens triggers targeted clarification questions framed as concrete binary trade-offs. Example: "When you say *build quality* matters, would you rather have (A) full stainless steel + 11 lb weight + $50 more, or (B) mixed-material + 7 lb + $50 less?" Two to four of these converge to individual-level weights quickly.

## Why the block exists

Ambiguity is the dominant failure mode of natural-language preference extraction. Shoppers say "something fast for work" and the model picks a direction — CPU? RAM? boot time? battery? — without the user ever having been asked. Layer 1 goal-parsing gets us to "the user cares about speed, some weight around 0.3". Layer 2 turns that into a committed preference: given a trade-off the user *must* resolve to move forward, their choice is load-bearing signal, not guesswork.

The research base (`docs/PREFERENCE_INFERENCE.md`): adaptive-questioning LLM elicitation converges ~5× faster than fixed conjoint batteries ([arxiv 2501.14625](https://arxiv.org/abs/2501.14625)), and LLMs' documented weakness at self-reporting uncertainty is compensated by forcing the structured question shape ([OpenReview: Eliciting Human Preferences with Language Models](https://openreview.net/forum?id=LvDwwAgMEW)).

## Architecture

Pure HTTP surface. No DB changes (Tier 1 localStorage already holds the preference profile).

```
POST /clarify
  body: { intent: UserIntent, userPrompt?: string }
  → when any criterion confidence < 0.6:
     { needsClarification: true, questions: Q[] }
  → else: { needsClarification: false, intent: UserIntent }

POST /clarify/apply
  body: { intent: UserIntent, answers: Answer[] }
  → { intent: UserIntent }  // weights updated from answers
```

Question shape:

```ts
type Q = {
  id: string;                       // ULID — ties answer back to the question
  targetCriterion: string;          // which criterion this disambiguates
  prompt: string;                   // user-facing question sentence
  optionA: { label: string; impliedWeightShift: { [criterion: string]: number } };
  optionB: { label: string; impliedWeightShift: { [criterion: string]: number } };
};
```

Each question:
- Names the ambiguous criterion
- Poses concrete A/B alternatives the user understands (not abstract "do you want more speed")
- Carries deterministic weight shifts so the answer updates math without a second Opus round-trip

Answer shape:

```ts
type Answer = { questionId: string; chose: "A" | "B" };
```

### Flow

1. User types "something fast for work" → Layer-1 extract returns `{speed: 0.5, price: 0.3, portability: 0.2}` with `confidence: {speed: 0.4, price: 0.8, portability: 0.7}`.
2. Audit pipeline calls `/clarify` before search runs.
3. `/clarify` sees speed.confidence < 0.6 → calls Opus to generate 3 binary questions focused on speed:
   - Q1: "For 'fast for work,' do you mean: (A) boot + app-launch responsiveness, or (B) heavy-task throughput (video render, compile)?"
   - Q2: "Would you trade: (A) 2 extra minutes at startup for 30% better multi-app multitask headroom, or (B) 30% less multitask headroom for sub-10s cold boot?"
   - Q3: "Web browsing + 2–3 apps vs. rendering or compiling — which matches your day?"
4. User picks A, A, B. → `/clarify/apply` applies the deterministic shifts:
   - Q1 A: add `responsiveness: +0.15, throughput: -0.05`
   - Q2 A: add `responsiveness: +0.10, throughput: -0.10`
   - Q3 B: add `throughput: +0.10, responsiveness: -0.05`
5. Returns updated intent: `{responsiveness: 0.35, throughput: 0.20, price: 0.3, portability: 0.15}`. Renormalized to sum 1.
6. Pipeline resumes with the clarified intent.

### Deterministic weight math

For each answer:
1. Apply `impliedWeightShift` directly to the intent's criteria (creating new criterion names when a shift targets an unknown one).
2. Clip to [0, 1]. Renormalize so weights sum to 1.
3. Mark all clarified criteria's confidence = 0.9 (user-explicit trumps Opus's guess).

### Opus prompt (question generator)

System:

> You are a preference elicitation agent. Given a user intent with one or more low-confidence criteria, generate 2–4 binary trade-off questions that disambiguate the criteria. Each question must:
> - Pose a CONCRETE choice (specific numbers, specific scenarios, no abstract "do you want more X")
> - Have two options A/B that are realistic alternatives a shopper would recognize
> - Imply clear weight shifts on downstream criteria
>
> Return ONLY JSON `{"questions": [{"targetCriterion": "...", "prompt": "...", "optionA": {"label": "...", "impliedWeightShift": {"criterion": delta, ...}}, "optionB": {...}}, ...]}`

User text includes:
- The intent's criteria + confidence scores
- The user's original prompt (for grounding questions in their actual words)
- A hint about the product category

### Confidence emission in Layer 1

Extract.ts needs to return confidence per criterion. Currently it returns `{name, weight, direction, target?}` — no confidence. Additive change: add `confidence?: number` to the criterion shape in UserIntent, populated by Opus at extraction time. Defaults to 1.0 if Opus doesn't provide.

When the user manually edits a slider in the UI, the corresponding criterion's confidence flips to 1.0 (user-explicit wins).

## Apple-product-bar rules

| § | Rule | How S1-W8 meets it |
|---|---|---|
| 2 intelligent | Ambiguous queries ask ONE clarifying question, not five | We cap at 4 questions. Default is 2-3. Re-running with same intent doesn't spawn new questions if confidence is already high. |
| 4 motion with purpose | Modal slides in with 200ms cubic-bezier(0.22, 1, 0.36, 1) | UI layer (not this block) |
| 7 delightful details | Question text is in the user's voice ("you said 'fast for work'") | Prompt uses originalUserQuery verbatim |
| 9 honest loading | "Narrated" sub-event `clarify:generating N questions` | SSE sub-event emitted |

## Files touched

- `packages/shared/src/types.ts` — add `confidence?: number` to UserIntent criterion + new ClarifyQuestion / Answer types
- `workers/api/src/extract.ts` — ask Opus for confidence in its response; default to 1.0 if absent
- `workers/api/src/clarify/types.ts` (new) — Q + Answer shape
- `workers/api/src/clarify/generate.ts` (new) — Opus prompt + JSON parse
- `workers/api/src/clarify/apply.ts` (new) — pure function: answers → updated intent
- `workers/api/src/clarify/handler.ts` (new) — /clarify + /clarify/apply HTTP handlers
- `workers/api/src/clarify/*.test.ts` (new)
- `workers/api/src/index.ts` (modify — wire routes)
- `CHECKLIST.md` (mark ✅)

## Acceptance criteria

- POST /clarify with `intent={..., criteria:[{name:"speed", weight:0.5, confidence:0.4},{name:"price", weight:0.5, confidence:0.8}]}` returns `needsClarification: true` + 2–4 questions targeting the "speed" criterion.
- POST /clarify with all-high-confidence intent returns `needsClarification: false` + the same intent.
- POST /clarify/apply with answers updates weights deterministically. Weights normalize to sum 1. Answered criteria get confidence = 0.9.
- Opus unavailable → clarify returns a canonical fallback question set per category (`speed` → responsiveness vs throughput Q).
- No affiliate-link regressions — this block emits no URLs.
- Typecheck clean. Tests cover: high-confidence pass-through, low-confidence generation (with mocked Opus), apply-answers math, clip/renormalize boundary cases, missing criterion on shift (creates new criterion), Opus failure fallback.
- Typecheck + tests green.
- Deployed.
- Live smoke: `POST /clarify` with ambiguous intent returns real questions.

## Implementation checklist

1. Extend UserIntent criterion type with `confidence?: number`.
2. Update extract.ts prompt + parser to request + read confidence; default 1.0 when absent.
3. Write clarify/types.ts (Q + Answer shapes).
4. Write clarify/generate.ts (Opus call + JSON parse, with fallback canonical Qs).
5. Write clarify/apply.ts (pure deterministic weight math + renormalize + confidence=0.9).
6. Write clarify/handler.ts (POST /clarify + POST /clarify/apply).
7. Wire routes in index.ts.
8. Write tests (generate mock, apply math, handler HTTP surface, fallback path).
9. Typecheck + vitest.
10. Deploy.
11. Smoke (unauth → 200 on /clarify public endpoint).
12. Opus 4.7 judge pass per LOOP_DISCIPLINE (mandatory).
13. Apply judge P0+P1.
14. Commit `lens(S1-W8): ...` + push.
15. CHECKLIST ✅.
