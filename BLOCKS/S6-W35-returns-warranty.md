# S6-W35 — Returns / warranty assistance

**Goal:** generate a ready-to-send Magnuson-Moss return or warranty-claim letter for a specific purchase the user owns. Pre-fills from F2 `purchases` + user profile + the existing `intervention/draft-magnuson-moss-return` pack template. Persists as an `interventions` row so the user can track status.

**Why the block exists:**

VISION_COMPLETE.md §3 Sarah narrative: the recall/DOA moments end with "Here's a Magnuson-Moss return letter ready to send." The pack has shipped the template for weeks — this block wires the template into a usable endpoint. Pairs directly with S6-W33 (recall watcher) and S6-W34 (price-drop claim); when a recall fires, the watcher can POST to /returns/draft and have the letter waiting in the dashboard by the time the user wakes up.

No new data. The workflow is:
1. Read purchase row by `purchaseId` (F2 `purchases`)
2. Resolve pack `intervention/draft-magnuson-moss-return` from the registry
3. Token-substitute the template with `{product_name, seller_name, order_id, purchase_date, defect_description, specific_right, user_name, user_contact}`
4. Write an `interventions` row via F2 `createIntervention`
5. Return the rendered draft

## Contract

### Request

```
POST /returns/draft
{
  purchaseId: string,
  defectDescription: string,
  actionType?: "return" | "warranty-service" | "replacement" | "refund",
  specificRight?: string,        // optional override, defaults per actionType
  userName?: string,
  userContact?: string,
}
```

### Response

```ts
{
  ok: true;
  interventionId: string;
  draft: {
    subject: string;
    body: string;
    to?: string | null;          // seller email when known on the purchase row
    format: "email";
  };
  templateSource: string;        // "intervention/draft-magnuson-moss-return@1.0.0"
  fallback: string;              // next-intervention slug ("intervention/file-ftc-complaint")
  generatedAt: string;
}
```

### Action-type → specificRight defaults

- `return` → "refund of the purchase price"
- `warranty-service` → "repair or replacement under the Limited Warranty"
- `replacement` → "a replacement unit"
- `refund` → "refund of the purchase price"

### Token substitution

Simple `{token}` replacement. Tokens not present in inputs are replaced with `[TODO: <token>]` so the user sees exactly what to fill before sending (§10 "never a placeholder" is honored by making the placeholder loud and actionable).

## Implementation checklist

1. `workers/api/src/returns/types.ts` — Zod + TS.
2. `workers/api/src/returns/render.ts` — pure token substitution.
3. `workers/api/src/returns/handler.ts` — HTTP glue: auth-guard → load purchase → load pack → render → createIntervention.
4. Wire `POST /returns/draft` in `index.ts`.
5. Tests.
6. Deploy + smoke.

## Acceptance criteria

- 401 when no principal.
- 404 when purchase doesn't exist or doesn't belong to the user.
- 400 on invalid input.
- Successful path: draft has product + order + purchase date + specific right substituted; intervention row written.
- Missing fields surface as `[TODO: field]` in the rendered body.
- Typecheck + tests green.
- Deployed; smoke returns shaped response.

## Apple-product bar

- **Never a placeholder (§10):** tokens without inputs → visible `[TODO: <name>]` strings in the draft body.
- **Honest loading (§9):** `templateSource` + `fallback` surface so UI knows which pack ran + what to escalate to.
- **Silent until signal (§2):** no outbound email sent. User confirms before sending.

## Files touched

- `workers/api/src/returns/types.ts` (new)
- `workers/api/src/returns/render.ts` (new)
- `workers/api/src/returns/handler.ts` (new)
- `workers/api/src/returns/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
