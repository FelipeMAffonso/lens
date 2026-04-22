# S4-W22 — Dark-pattern checkout scan — Stage-2 `/passive-scan` endpoint

**Status at block start:** Stage-1 heuristics live in `apps/extension/darkPatterns.ts` and render per-pattern + aggregate badges. Extension `background.ts` only stashes hits into in-memory `hitsByTab`. Worker has no `/passive-scan` route. `AMBIENT_MODEL.md §2` describes the intended two-stage pipeline; this block wires Stage 2 end-to-end.

**Why this block is load-bearing:**

The Marriott worked example in `VISION_COMPLETE.md §6` — the demo beat that separates Lens from "another dark-pattern checker" — requires:

1. Extension detects `Destination Amenity Fee $49/night` via Stage-1 selectors + regex.
2. Worker confirms it's a deceptive hidden-cost pattern with Opus 4.7.
3. Worker cites FTC Junk Fees Rule (16 CFR Part 464) as the applicable regulation.
4. Worker surfaces the `intervention/file-ftc-complaint` pack for one-click advocacy.
5. Badge renders with regulation citation + fee breakdown + "Draft FTC complaint" action.

Today, step 2 doesn't exist. This block builds it.

## The contract

### Request (from extension Stage-1 → Worker)

```ts
// POST /passive-scan
{
  host: string;                       // "marriott.com"
  pageType: "checkout" | "cart" | "product" | "article" | "landing" | "other";
  url?: string;                       // trimmed — no query, no fragment
  jurisdiction?: string;              // default "us-federal"
  hits: Array<{
    packSlug: string;                 // "dark-pattern/hidden-costs"
    brignullId: string;               // "hidden-costs"
    severity: "nuisance" | "manipulative" | "deceptive" | "illegal-in-jurisdiction";
    excerpt: string;                  // ≤ 200 chars around matched DOM node
  }>;
}
```

### Response

```ts
{
  confirmed: Array<{
    packSlug: string;
    brignullId: string;
    verdict: "confirmed" | "uncertain";
    llmExplanation: string;           // 1-2 sentences
    regulatoryCitation?: {
      packSlug: string;               // "regulation/us-federal-ftc-junk-fees"
      officialName: string;
      citation: string;               // "16 CFR Part 464"
      status: "in-force" | "vacated" | "proposed" | "superseded";
      effectiveDate: string;          // ISO date
    };
    suggestedInterventions: Array<{
      packSlug: string;               // "intervention/file-ftc-complaint"
      canonicalName: string;
      consentTier: string;            // "explicit-per-action"
    }>;
    feeBreakdown?: {                  // only for hidden-costs / drip-pricing
      label: string;
      amountUsd?: number;
      frequency?: "one-time" | "per-night" | "per-month" | "per-year";
    };
  }>;
  dismissed: Array<{ packSlug: string; reason: string }>;
  latencyMs: number;
  ran: "opus" | "heuristic-only";    // "heuristic-only" when Opus skipped
  runId: string;                      // ULID for observability
}
```

### Design decisions

- **Zod at the boundary.** Every field validated on entry; hits array capped at 20 (a page with 20+ patterns is pathological — treat as one aggregate).
- **Fail-open.** If `ANTHROPIC_API_KEY` is absent, return `ran: "heuristic-only"` with every hit marked `verdict: "uncertain"`. The extension still renders badges; it just can't cite regulations.
- **Rate-limit via F18.** `/passive-scan` is already in `ratelimit/config.ts` (60 anon / 600 user per hour). `routeFromPath` already maps it to policy.
- **Observability.** Every run writes one row to `passive_scans` (migration 0004) + emits structured logs through `obs/log.ts`. Bus event `passive_scan.completed` emitted for the ticker aggregator.
- **Cross-user ticker contribution.** Each confirmed hit increments a k-anonymous counter for `{host, brignullId}` so `/ticker?dimension=dark-patterns` can surface "marriott.com flagged for hidden-costs 847 times in 90 days" without per-user data.
- **Prompt composition.** Use existing `packs/prompter.ts#darkPatternsPrompt` + `regulationsPrompt`. Add a new `passiveScanUserMessage` helper that frames the excerpt + host + pageType.

## Implementation checklist

1. **Migration `0004_passive_scans.sql`** — table `passive_scans` (runId PK, timestamp, host, pageType, hitCount, confirmedCount, latencyMs, userId nullable, anonUserId nullable) + `passive_scan_aggregates` (hostBrignullId composite, count, firstSeen, lastSeen) for the ticker cross-ref.
2. **`workers/api/src/passive-scan/types.ts`** — Zod schemas + TypeScript types mirroring the contract above.
3. **`workers/api/src/passive-scan/prompt.ts`** — build the Opus 4.7 system prompt + user message from a batch of hits.
4. **`workers/api/src/passive-scan/verify.ts`** — call Opus 4.7, parse JSON verdicts, map to regulation + intervention packs.
5. **`workers/api/src/passive-scan/repo.ts`** — D1 writes for the two tables; both are no-ops when `LENS_D1` is unset (graceful).
6. **`workers/api/src/passive-scan/handler.ts`** — the HTTP glue: validate → verify → persist → respond.
7. **Wire in `workers/api/src/index.ts`** — `app.post("/passive-scan", ...)`.
8. **Tests:**
   - `passive-scan/types.test.ts` — Zod validation boundaries.
   - `passive-scan/prompt.test.ts` — prompt composition given fixtures.
   - `passive-scan/verify.test.ts` — JSON parsing (mock Opus client).
   - `passive-scan/handler.test.ts` — integration test with a stub pack registry + stub Opus client.
9. **Extension background.ts update:**
   - Forward `LENS_SCAN_HITS` to `/passive-scan` with per-host consent gating (already in `content/consent.ts`).
   - Forward the `confirmed` response back to the content script via `chrome.tabs.sendMessage`.
10. **Extension content.ts update:** when Stage-2 confirmation arrives, upgrade the existing badges from `heuristic` styling to `confirmed + regulation` styling — attach citation + intervention action.
11. **Deploy** via `wrangler deploy` + `wrangler d1 migrations apply`.
12. **Smoke test** — `curl -s -X POST lens-api.../passive-scan -H 'content-type: application/json' -d '<fixture>'` returns structured verdicts.

## Apple-product bar (per LOOP_DISCIPLINE.md)

- **Silent until signal (AMBIENT_MODEL §5):** Stage 2 runs only when Stage 1 already fired. Zero packets on ordinary pages.
- **Honest loading (§9):** response includes `latencyMs` so the extension can report "Lens confirmed in 840ms" instead of an indefinite spinner.
- **Explain on hover (§5):** `regulatoryCitation.officialName` + `citation` map onto the badge tooltip. One click reveals `llmExplanation`.
- **Never a placeholder (§10):** fail-open returns `ran: "heuristic-only"` with `verdict: "uncertain"` — a real, honest state, not a `TODO`.

## Acceptance criteria

1. `POST /passive-scan` returns 200 with the contract shape for valid input.
2. `POST /passive-scan` returns 400 on malformed input (Zod error list).
3. Response enumerates regulation citations from real packs (no fabrication) — verified against `registry.bySlug`.
4. When `ANTHROPIC_API_KEY` unset, endpoint returns `ran: "heuristic-only"` with all hits `verdict: "uncertain"`. No 500.
5. `passive_scans` table row exists for every call (when D1 bound).
6. Ticker aggregate row exists for each `{host, brignullId}` pair (when D1 bound).
7. Extension background posts to the endpoint; confirmed verdicts upgrade badge styling.
8. `npm run typecheck --workspaces` + `npx vitest run` green.
9. Deployed live; smoke curl returns confirmed payload for the Marriott fixture.

## Files touched

- `workers/api/migrations/0004_passive_scans.sql` (new)
- `workers/api/src/passive-scan/types.ts` (new)
- `workers/api/src/passive-scan/prompt.ts` (new)
- `workers/api/src/passive-scan/verify.ts` (new)
- `workers/api/src/passive-scan/repo.ts` (new)
- `workers/api/src/passive-scan/handler.ts` (new)
- `workers/api/src/passive-scan/*.test.ts` (4 new test files)
- `workers/api/src/index.ts` (modified — wire route + env additions if needed)
- `workers/api/src/packs/prompter.ts` (modified — may add user-message helper)
- `apps/extension/background.ts` (modified — Stage-2 escalation)
- `apps/extension/content.ts` (modified — receive confirmations)
- `apps/extension/content/overlay/badge.ts` (modified — upgrade state on confirmation)
