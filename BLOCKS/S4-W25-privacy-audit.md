# S4-W25 — Data-disclosure (privacy-policy) audit

**Goal:** fetch a product's privacy policy and emit a structured machine-readable summary: what data the vendor collects, who they share it with, how long they retain it, what deletion rights the user has, and whether the consent-flow language carries dark patterns. Closes the Stage-4 decision track at 8 of 8.

**Why the block exists:**

VISION_COMPLETE.md §6 worked example for smart-home devices: Sarah's about to buy a Roomba and wants to know what it sends to the mothership. Currently Lens has no way to answer. Wirecutter + Mozilla Privacy Not Included + EFF Privacy Badger all cover this angle at different levels; Lens surfaces the same data in-line with the checkout flow so the user sees it before they click Place Order.

Follows the S4-W22 passive-scan pattern: Opus 4.7 with pack-composed prompt + graceful heuristic fallback when `ANTHROPIC_API_KEY` is absent. No new D1 table — audits are ephemeral unless persisted via the F2 `audits` repo (caller's choice).

## Contract

### Request

```
POST /privacy-audit
{
  privacyPolicyUrl: string,
  productName?: string,
  vendor?: string,
}
```

### Response

```ts
{
  url: string;
  canonicalUrl: string;
  host: string;
  fetched: boolean;
  http?: number;
  audit: {
    dataCollected: Array<{
      category: string;           // "identity" | "location" | "biometric" | ...
      types: string[];            // "email", "gps-coordinates", ...
      purpose: string;
    }>;
    sharedWithThirdParties: Array<{
      partyCategory: string;      // "advertising" | "analytics" | "affiliate" | ...
      purpose: string;
    }>;
    retention: {
      declared: boolean;
      period: string | null;      // free-form, "30 days" / "until account deletion" / "indefinite"
    };
    deletion: {
      available: boolean;
      mechanism: string | null;   // "contact-support" | "in-app-setting" | "no-mechanism"
    };
    consentDarkPatterns: Array<{
      pattern: string;            // "preselected-opt-in" | "forced-consent" | "bundled-consent" | ...
      severity: "warn" | "blocker";
      evidence: string;           // 60-chr snippet
    }>;
    regulatoryFrameworks: string[];   // detected frameworks: GDPR, CCPA, COPPA, etc.
  };
  transparencyScore: number;       // 0..100 (higher = more transparent)
  band: "low" | "moderate" | "high";
  source: "opus" | "heuristic-only";
  runId: string;                   // ULID
  latencyMs: number;
  generatedAt: string;
}
```

### Transparency score

Start 50, add/subtract per signal:

```
+5 per regulatoryFramework declared (GDPR/CCPA/COPPA/...) cap +15
+10 if deletion.available
+10 if retention.declared + specific period (not "indefinite")
+5 per dataCollected category disclosed, cap +15 (transparency about collection is good)
+5 if sharedWithThirdParties explicitly enumerated (vs "trusted partners")
-10 per consentDarkPattern warn
-20 per consentDarkPattern blocker
clamp [0, 100]
```

Bands: `<40` low · `40-69` moderate · `≥70` high.

### Heuristic fallback

When Opus is unavailable, the heuristic scanner runs a regex suite:
- `gdpr`, `ccpa`, `coppa`, `pipeda`, `lgpd` — regulatory framework detection.
- data-type keywords: `email|phone|name|address|location|IP address|device ID|cookies|biometric|facial recognition|health data|payment`.
- third-party language: `trusted partners|advertising partners|analytics providers|service providers`.
- retention: `retention|retain|keep|store|deletion|delete`.
- deletion-rights language: `right to delete|request deletion|your rights`.
- dark-pattern phrases: `by continuing, you agree|click I agree|select all checkboxes|auto-selected for your convenience|opt-out requires contacting us`.

### Apple-product bar

- **Never a placeholder (§10):** when fetch fails, `audit` has empty arrays + `fetched: false` + explicit reason; UI always gets a valid shape.
- **Honest loading (§9):** `source: "opus" | "heuristic-only"` + `latencyMs` so UI can say "Audited in 2.3s via Opus 4.7".
- **Silent until signal (§2):** no fan-out. One URL in, one verdict out.

## Implementation checklist

1. `workers/api/src/privacy-audit/types.ts` — Zod + TS.
2. `workers/api/src/privacy-audit/heuristic.ts` — regex scanner.
3. `workers/api/src/privacy-audit/prompt.ts` — Opus system prompt + user message composer.
4. `workers/api/src/privacy-audit/verify.ts` — JSON parser + result projector.
5. `workers/api/src/privacy-audit/score.ts` — pure transparency-score + band.
6. `workers/api/src/privacy-audit/handler.ts` — HTTP glue: fetch → htmlToText → heuristic OR opus → score.
7. `workers/api/src/index.ts` — wire `POST /privacy-audit`.
8. Tests per module.
9. Deploy + smoke.

## Acceptance criteria

- Valid URL + reachable page + heuristic fallback → structured audit with non-empty regulatoryFrameworks when the text contains "GDPR" or "CCPA".
- Unreachable URL → `fetched: false`, empty audit, band `low`.
- Invalid URL → 400.
- Typecheck + all tests green.
- Deployed; smoke curl returns structured response.

## Files touched

- `workers/api/src/privacy-audit/types.ts` (new)
- `workers/api/src/privacy-audit/heuristic.ts` (new)
- `workers/api/src/privacy-audit/prompt.ts` (new)
- `workers/api/src/privacy-audit/verify.ts` (new)
- `workers/api/src/privacy-audit/score.ts` (new)
- `workers/api/src/privacy-audit/handler.ts` (new)
- `workers/api/src/privacy-audit/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
