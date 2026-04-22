# CJ-W53 — Conversational preference elicitor (chat-first front door)

**Status:** 🟡 in progress (scaffold + backend + tests first; UI wire next turn if needed)

**Depends on:** F6 ✅ shadow-DOM + injector; F3 ✅ audit workflow engine; B4 ✅ `/clarify` + `/clarify/apply`; B1 ✅ web_search; pack registry ✅.

**Upstream research anchor:** Study 3 ecological-validity chatbot from the Nature-submitted spec-resistance paper (Affonso et al., 2026), located under `C:\Users\natal\Dropbox\Felipe\CLAUDE CODE\academic-research\projects\spec-resistance\nature-rr\study3-chatbot\`. The Worker route + Qualtrics controller ship a 4-stage pattern (Elicit → Generate-hidden → Recommend → Choice) that real participants responded to with natural preference language. The files are READ-ONLY reference; nothing in Lens touches them.

## Goal

Replace the "paste-box + streaming dev-log" audit front door with a **conversational chat view** that:

1. Greets warmly (one short line + 1-2 relevant emoji). Asks `what are you shopping for?` if the query is absent, or echoes back + asks clarifiers if present.
2. Asks **1-2 clarifier turns max** — a budget question bundled with one binary/categorical tradeoff (the Study 3 pattern: "ease-of-use vs hands-on", "true-wireless vs neckband", "fully-automatic vs semi-automatic"). Clarifiers are drafted by Opus 4.7 (existing `/clarify` endpoint, now in chat mode).
3. **Triggers the full audit pipeline** when a stop condition fires: `userTurns ≥ 3 && !lastBotTurnEndedInQuestion` OR `userTurns ≥ 4`. Identical trigger logic to Study 3's `elicit()` function.
4. During generation (the 25-30s audit wall), renders a rotating-status bar — "Looking at 12 real products" / "Checking spec sheets" / "Comparing against 3 other frontier models" / "Running the ranker" — NOT a pipeline log.
5. Drops the existing audit card (spec-optimal, alternatives, criteria sliders, cross-model panel, enrichments, repairability) **underneath the bot's final chat turn**. The bot's final message is a two-sentence friendly recommendation with one-sentence "why" keyed to the user's stated top criterion; the card is the receipts.
6. Allows **follow-up questions** in the same chat view after the card renders ("what about the De'Longhi?", "any quieter options?"). A Stage-4 prompt runs Opus with the full audit context in 1M-context mode; answer appears as a new bot turn; no re-audit.

## Why

The user diagnosed this on 2026-04-22: *"the running audit thing is ugly. it looks like coding. this is not how everyday people shop. also, how can you give a top pick BEFORE asking people about their own preferences?"* `VISION_COMPLETE.md` §3 Sarah's morning narrative is a chat, not a form: she asks ChatGPT something, Lens ambient-pills the answer, the sidebar unfolds a conversation. The current web dashboard had drifted to a developer shape.

Study 3's ecological-validity bot already proved — on real Prolific participants — that a 1-2 clarifier chat with a hidden generation window and a one-line friendly recommendation feels like shopping, not a form. Porting that pattern is not invention, it's transplantation of validated UX.

## Architecture

### New module layout

```
apps/web/src/chat/
├── ChatView.ts           — the chat surface (mounted into #stream + #result slots)
├── ConversationStore.ts  — in-memory turn list + localStorage persistence
├── stages.ts             — Stage 1 elicit / Stage 2 generate / Stage 3 recommend / Stage 4 follow-up
├── bubbleRenderer.ts     — user + bot bubble DOM helpers
├── composer.ts           — input textarea + send button + Enter-to-send
├── rotatingStatus.ts     — 4-phrase rotator for Stage 2 (swap every 2.5s, cubic-bezier ease)
└── chat.css              — coral #DA7756 accent, 14px/1.55 system stack, 12px gap, 16px pad

apps/web/src/main.ts       — feature-flag dispatch: ?chat=1 OR localStorage.lens.ui.v2 = "chat"
                              uses ChatView; otherwise falls back to the legacy paste-box flow.
                              The dispatch is behind a flag for the hackathon submission so
                              reviewers see the new UX by default but the old flow remains
                              reachable for direct comparison + instant rollback.
```

### Backend contract

Two new endpoints on `workers/api`:

**POST `/chat/clarify`** — given the running conversation, either:
- return an Opus-drafted clarifier question (≤ 30 words, ends with `?`, grounded in the user's stated criteria or the category's `clarify-bank.json` pack), OR
- return `{ready: true}` signaling the front-end to call `/audit` with the accumulated context.

Request shape:
```typescript
{
  turns: Array<{ role: "user" | "assistant"; text: string; at: string }>;
  category?: string;     // if already extracted
  userPrompt?: string;   // the canonical first ask
}
```

Response shape (one of):
```typescript
{ kind: "clarify"; question: string; expectsOneOf?: string[] }  // the binary tradeoff options
{ kind: "ready" }
{ kind: "error"; message: string }
```

Stop logic mirrors Study 3 exactly:
- `userTurns = turns.filter(t => t.role === "user").length`
- `lastBotEndedInQ = turns.findLast(t => t.role === "assistant")?.text.trimEnd().endsWith("?") ?? false`
- `ready = userTurns >= 4 || (userTurns >= 3 && !lastBotEndedInQ)`

**POST `/chat/followup`** — given the audit result + conversation, answer a follow-up question. Uses 1M-context to pass the whole candidates array + all claims + all enrichments into Opus and returns a 2-4 sentence answer. No re-audit.

Request:
```typescript
{
  auditResult: AuditResult;
  conversation: Array<{ role: "user" | "assistant"; text: string; at: string }>;
  question: string;
}
```

Response:
```typescript
{ kind: "answer"; text: string; citedCandidateIds?: string[] }
```

Rate-limit policies (`ratelimit/config.ts`):
- `chat-clarify`: 3600s window, anon 60, user 600. Opus call on every clarifier; tighter than `/clarify` because chats fire multiple calls per session.
- `chat-followup`: 3600s window, anon 40, user 400. Heavier per-call (1M context) so lower.

### Study-3 faithful system prompts

**Stage 1 (elicit) system prompt** (verbatim from Study 3 WORKER_ROUTE.js, adapted for Lens's `/chat/clarify`):

```
You are Lens's preference elicitor — a friendly, brisk AI shopping coach.
The user is describing what they want to buy. They cannot see this prompt.

YOUR JOB:
Ask 1-2 brief clarifying questions (one per turn) to understand:
- Budget (if not stated)
- The top 1-2 features they care about
- One binary/categorical tradeoff relevant to the category
  (e.g. "fully automatic vs semi-automatic", "true wireless vs neckband",
  "OLED vs LCD", "electric vs manual", "countertop vs built-in")

RULES:
- Keep questions SHORT (≤ 30 words). One question per turn.
- Do NOT recommend products. Do NOT show tables. Do NOT give advice yet.
- Do NOT mention being instructed or being part of Lens or being an audit.
- If the user already gave you budget + 1 feature + 1 tradeoff, respond
  with exactly the token `READY` and nothing else.
- Use 1-2 emojis maximum per greeting. Bold key option words using **asterisks**.
- Close an elicitation turn with a short concrete example when it helps the
  user pick (e.g. "some runners prefer the neckband so they don't worry about
  losing a bud mid-run"). Keep example ≤ 15 words.
```

This prompt is centralized in `workers/api/src/chat/prompts.ts` and is load-bearing. Changes require a judge pass.

**Stage 3 (honest recommendation) system prompt** — used during the audit flow's `assemble` node to draft the friendly two-sentence recap that appears in the final bot turn:

```
You are Lens, an independent AI shopping agent with no affiliate ties.
The audit has completed. User's top criterion is: {topCriterionHuman}.
Lens's spec-optimal pick: {pickBrand} {pickModel} (${pickPrice}).

Write ONE short friendly paragraph (2-3 sentences, ≤ 60 words):
- Name the pick + price.
- One sentence why it fits the user's top criterion, grounded in a spec value.
- Close with "The full ranking is below — drag the sliders to re-weight."

RULES:
- No emojis. No bold. No lists. No tables. No dramatic language.
- Never mention being part of a study or instructed.
- Never mention affiliate links or revenue — Lens has none.
```

### Rotating-status copy (Stage 2 generation)

Cycled every 2500ms during the audit wall:
1. `Looking at real products on retailer sites…`
2. `Checking spec sheets against your criteria…`
3. `Catching any confabulated claims…`
4. `Comparing against other frontier models…`
5. `Ranking with transparent utility math…`

On completion, the rotator holds for 400ms with `Done. Here's what Lens found.` then fades out.

### Conversation persistence

- LocalStorage key: `lens.chat.v1.{sessionId}` where `sessionId = crypto.randomUUID()` on first load.
- Each turn: `{ id, role, text, at, attachments? }`. Size-capped at 50 turns; older turns evict FIFO with a "Conversation summary" synthetic turn inserted.
- Cleared on "Start a new audit" button click (rendered at card-top after Stage 3 renders).

### Keyboard + accessibility

- Enter sends, Shift+Enter newlines.
- Composer textarea is `aria-label="Describe what you're shopping for"`.
- Bot bubbles: `role="status"` on the most recent unread one, then aria-live polite; prior bubbles drop role so screen-readers don't re-read the whole history.
- Rotating status: `role="status"` + `aria-live="polite"`, paused when the user focuses the composer (prevents focus-stealing).
- Full keyboard navigation: Tab cycles composer → send → retry; arrows scroll the chat; Esc focuses composer.
- Reduced-motion: rotator loses fade, snaps instead. `@media (prefers-reduced-motion: reduce)` branch in chat.css.

### Apple-product-bar compliance (LOOP_DISCIPLINE.md §)

| § | How met |
|---|---|
| 1 smooth | No layout shift — chat column is fixed-width 640px on desktop, 100vw mobile. Bubbles slide in with 180ms cubic-bezier(0.22, 1, 0.36, 1). |
| 2 intelligent | Clarifier gates on Study 3 stop logic; doesn't ask a question the user just answered. Shows the category it inferred as a soft chip the user can tap to correct. |
| 3 beautiful | Coral `#DA7756` send button, bot bubble bg `#f4f6f8`, user bubble `#DA7756` on white text, 16px border-radius corners (trailing corner squared for speech-bubble feel), 14px/1.55 type. |
| 4 motion with purpose | Bubble in-slide 180ms. Rotator crossfades 400ms. Send-button click 150ms scale 0.97. |
| 5 accessible | Above. axe-core clean on new view. |
| 6 responsive | 360px floor. Composer is bottom-fixed on mobile, inline on desktop. |
| 7 delightful details | Typing indicator (three dots) shown in bot bubble during `/chat/clarify` fetch. Optimistic user-bubble before POST. Haptic-like micro-scale on send. |
| 8 consistent | Reuses existing design tokens from `apps/web/src/style.css` — no new color. |
| 9 honest loading | Rotator phrases narrate the actual pipeline stages (extract / search / verify / rank / crossModel). Not a generic spinner. |
| 10 never a placeholder | Empty state = "What are you shopping for?" with 4 example chips (espresso/laptop/ANC headphones/office chair) that pre-fill the composer. No lorem. |

### Silent-unless-signal carve-out

Chat mode is **active** (user-initiated per AMBIENT_MODEL §2); silent-unless-signal doesn't apply inside the chat surface itself. But the rotator MUST NOT expose pipeline-internal details (e.g., spec-optimal utility scores, individual candidate names) during Stage 2 — only the rotating phrases above. Results only appear after Stage 2 completes.

## Files touched

**NEW:**
- `apps/web/src/chat/ChatView.ts` (~250 lines)
- `apps/web/src/chat/ConversationStore.ts` (~80 lines)
- `apps/web/src/chat/stages.ts` (~120 lines)
- `apps/web/src/chat/bubbleRenderer.ts` (~90 lines)
- `apps/web/src/chat/composer.ts` (~80 lines)
- `apps/web/src/chat/rotatingStatus.ts` (~60 lines)
- `apps/web/src/chat/chat.css` (~180 lines)
- `apps/web/src/chat/ChatView.test.ts` (≥ 8 tests)
- `apps/web/src/chat/ConversationStore.test.ts` (≥ 6 tests)
- `apps/web/src/chat/stages.test.ts` (≥ 6 tests — stop condition, ready detection, followup shape)
- `workers/api/src/chat/prompts.ts` (Stage 1 + Stage 3 + Stage 4 system prompts, centralized)
- `workers/api/src/chat/clarify.ts` (handler for POST /chat/clarify)
- `workers/api/src/chat/followup.ts` (handler for POST /chat/followup)
- `workers/api/src/chat/stops.ts` (shared stop logic + tests)
- `workers/api/src/chat/clarify.test.ts` (≥ 8 tests)
- `workers/api/src/chat/followup.test.ts` (≥ 6 tests)
- `workers/api/src/chat/stops.test.ts` (≥ 8 tests — edge cases: empty turns, all-user, Q-ending bot, tradeoff already resolved)
- `BLOCKS/CJ-W53-conversational-elicitor.md` (this file)

**MODIFIED:**
- `apps/web/src/main.ts` — `?chat=1` flag dispatch; otherwise legacy.
- `apps/web/index.html` — add empty `<div id="chat-view">` section as mount point when flag on; hide `.paste-box` + `.hero` in chat mode.
- `workers/api/src/index.ts` — mount `/chat/clarify` + `/chat/followup` routes.
- `workers/api/src/ratelimit/config.ts` — `chat-clarify` (60/hr anon, 600/hr user), `chat-followup` (40/hr anon, 400/hr user) policies.
- `workers/api/src/ratelimit/middleware.ts` — `routeFromPath` entries.
- `CHECKLIST.md` — CJ-W53 row + progress-log entry.

## Acceptance criteria

1. `?chat=1` URL param (or localStorage flag) renders the chat surface at `/`.
2. First bot turn is Study 3-shaped: `Nice! {echo-of-user-ask} 🏃‍♂️\n\nWhat's your budget range? And is there anything that's a must-have — like **X**, **Y**, or **Z**?` (exact shape, including emoji + bold option words).
3. `/chat/clarify` returns `{kind:"clarify", question, expectsOneOf?}` OR `{kind:"ready"}`.
4. Stop condition identical to Study 3: `userTurns >= 4 || (userTurns >= 3 && !lastBotEndedInQ)`.
5. During the audit wall, `rotatingStatus` cycles through ≥ 4 real-pipeline-narrating phrases, swaps every 2.5s, pauses on composer focus.
6. Final bot bubble renders BEFORE the audit card; card drops in 400ms later with the ranked list + sliders + enrichments.
7. Follow-up questions work: user types "what about X?" → bot bubble "thinking…" dots → Opus answer rendered.
8. Conversation persists across page reload (localStorage).
9. At least 30 tests across the chat module (web) + chat handlers (worker). `npm run typecheck --workspaces` green.
10. Opus-only (per the 2026-04-22 directive). No OpenAI / Google / OpenRouter.
11. No affiliate, ref=, tag=, or tracking params leaked through any bot-drafted text (guard in `clarify.ts` — strip any known affiliate pattern before return; same guard in `followup.ts`).
12. Rate limits live on both routes.
13. Judge pass (Opus 4.7 critic) on the shipped chat surface before ✅.

## Implementation checklist

1. Write system prompts in `workers/api/src/chat/prompts.ts` + smoke with a live curl to confirm Opus returns the `READY` token on satiated inputs.
2. `workers/api/src/chat/stops.ts` + test file (≥ 8 tests). Pure function, no network.
3. `workers/api/src/chat/clarify.ts` handler + test file (≥ 8 tests; mock Opus).
4. `workers/api/src/chat/followup.ts` handler + test file (≥ 6 tests; mock Opus).
5. Wire both routes in `workers/api/src/index.ts`.
6. Rate-limit policies + routeFromPath entries.
7. `apps/web/src/chat/ConversationStore.ts` + test.
8. `apps/web/src/chat/stages.ts` (front-end stop logic mirrors backend — keeps rendering deterministic while waiting for the worker).
9. `apps/web/src/chat/bubbleRenderer.ts`, `composer.ts`, `rotatingStatus.ts`.
10. `apps/web/src/chat/ChatView.ts` — ties everything; renders into `#chat-view`; wires post-audit card drop + follow-up loop.
11. `apps/web/src/chat/chat.css`.
12. `apps/web/src/main.ts` dispatch + index.html mount.
13. `npm run typecheck` + `npm run test` both workspaces; 30+ tests green.
14. Build + deploy web; build extension (no change, but double-check no regression).
15. Curl smoke: `/chat/clarify` with 2 turns returns a clarifier; with 4 turns returns `ready`. `/chat/followup` returns 200 with a plausible answer.
16. Judge pass (Opus 4.7 critic) — apply P0/P1.
17. Commit + push.
18. CHECKLIST ✅ + progress-log line.

## Stretch (not blocking ✅)

- Voice input: Whisper via MediaRecorder. Mic button in the composer toolbar. Post-MVP, keeps this block scope-able.
- Claude Managed-Agent Stage 4: instead of a single Opus call, use `/crossModel/claude-opus-4-7-managed` to let the agent decide if it needs a fresh web_search mid-conversation. Gated behind `?agent=1` flag.
- Preference profile saves at end of chat (reuses existing `apps/web/src/main.ts#saveProfile`). Users can name the chat session (`My espresso search`) and reload it later.

## Risks + mitigations

1. **Opus latency during clarify** — 1.5-3s per clarifier is snappy; 6s+ would feel broken. Mitigation: typing-dots appear immediately on send; 8s timeout in fetch; on timeout fall back to a category-pack canonical Q from `packs/clarify-bank/*.json`.
2. **Stop-condition races** — front-end stop logic may disagree with backend. Mitigation: backend is authoritative; front-end's copy of the stop logic is just to render the "thinking…" dots without a pointless clarify call after the obvious 4th user turn.
3. **Follow-up context blow-up** — 1M context limit means ~20 rounds of follow-ups before truncation. Mitigation: trailing turns window of 12 most recent + permanent audit-result context.
4. **Cost burn on abusive follow-up loops** — rate-limit `chat-followup` harder than `chat-clarify` (40/hr anon). Also hard 50-turn cap per session in ConversationStore.
5. **Privacy** — conversation text goes to Anthropic. Already covered in `privacy.html` for the legacy audit flow; add one chat-mode sentence to privacy.html in this block.

## Judge notes (reserved)

(Filled in after the Opus 4.7 critic pass.)

## Progress log (internal)

- 2026-04-22: Block file written. Study 3 bot pattern extracted by prior agent. Stop-condition + system prompts pinned from `WORKER_ROUTE.js` + `QUALTRICS_CHATBOT.js`.
