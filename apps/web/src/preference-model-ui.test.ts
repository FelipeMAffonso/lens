import { describe, expect, it } from "vitest";
import type { AuditResult } from "@lens/shared";
import { preferenceModelPanel, renderCriteriaChips } from "./preference-model-ui.js";

function resultWithPreferenceModel(): AuditResult {
  return {
    id: "audit_1",
    host: "unknown",
    intent: {
      category: "wireless chargers",
      rawCriteriaText: "travel charger under $100",
      criteria: [
        {
          name: "price",
          weight: 0.4,
          direction: "lower_is_better",
          confidence: 0.92,
          source: "budget",
          rationale: "Budget max USD 100 makes lower price part of the utility function.",
        },
      ],
      preferenceModel: {
        version: "layered-utility-v1",
        confidence: 0.81,
        needsClarification: true,
        layers: [
          { layer: "stated", status: "used", signals: 1, rationale: "Parsed from the user's words." },
          { layer: "revealed", status: "requires_consent", signals: 0, rationale: "\"><script>alert(1)</script>" },
        ],
        userControls: ["Edit or delete every criterion weight."],
        privacy: {
          dataTier: "in_flight",
          usesExternalBehavior: false,
          consentRequiredFor: [
            "Gmail receipt ingestion",
            "Plaid transaction monitoring",
            "server-side purchase history",
            "push notification watchers",
          ],
          retention: "per_request",
        },
      },
    },
    aiRecommendation: {
      host: "unknown",
      pickedProduct: { name: "(no AI recommendation - user query only)" },
      claims: [],
      reasoningTrace: "",
    },
    candidates: [],
    specOptimal: null,
    aiPickCandidate: null,
    claims: [],
    crossModel: [],
    elapsedMs: { extract: 1, search: 1, verify: 1, rank: 1, crossModel: 0, total: 4 },
    createdAt: "2026-04-25T00:00:00.000Z",
  };
}

describe("preference model UI", () => {
  it("renders utility-model provenance, consent, and clarification state", () => {
    const html = preferenceModelPanel(resultWithPreferenceModel());
    expect(html).toContain("Utility model derived before ranking");
    expect(html).toContain("81% confidence");
    expect(html).toContain("clarification recommended");
    expect(html).toContain("Plaid transaction monitoring");
    expect(html).toContain("not used for this run");
    expect(html).toContain("requires consent");
    expect(html).not.toContain("<script>");
  });

  it("renders criterion source/confidence metadata and escapes criterion labels", () => {
    const host = document.createElement("div");
    renderCriteriaChips(host, [
      {
        name: "<img src=x onerror=alert(1)>",
        weight: 0.2,
        direction: "higher_is_better",
        confidence: 0.5,
        source: "category_prior",
        rationale: "Category prior filled this in.",
      },
      {
        name: "price",
        weight: 0.8,
        direction: "lower_is_better",
        confidence: 0.92,
        source: "budget",
      },
    ]);
    expect(host.querySelectorAll(".criterion-chip")).toHaveLength(2);
    expect(host.textContent).toContain("Budget");
    expect(host.textContent).toContain("92% confidence");
    expect(host.textContent).toContain("Category Prior");
    expect(host.innerHTML).not.toContain("<img");
    expect(host.querySelector(".criterion-chip")?.getAttribute("aria-label")).toContain("Price");
  });
});
