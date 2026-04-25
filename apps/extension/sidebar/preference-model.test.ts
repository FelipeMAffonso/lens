import { describe, expect, it } from "vitest";

import { preferenceModelCard, type SidebarCriterion, type SidebarPreferenceModel } from "./preference-model";

describe("preferenceModelCard", () => {
  const criteria: SidebarCriterion[] = [
    {
      name: "battery_life",
      weight: 0.42,
      direction: "maximize",
      confidence: 0.92,
      source: "typed_intent",
      rationale: "\"><script>alert(1)</script>",
    },
    {
      name: "price",
      weight: 0.31,
      direction: "minimize",
      confidence: 0.88,
      source: "typed_intent",
    },
  ];

  const model: SidebarPreferenceModel = {
    version: "layered-utility-v1",
    confidence: 0.84,
    needsClarification: true,
    layers: [
      { layer: "typed_intent", status: "used", signals: 2, rationale: "User stated it." },
      { layer: "revealed_purchases", status: "requires_consent", signals: 0, rationale: "Needs opt-in." },
      { layer: "financial_context", status: "requires_consent", signals: 0, rationale: "Needs opt-in." },
    ],
    userControls: ["Edit weights or disable any preference source before ranking."],
    privacy: {
      dataTier: "local_only",
      usesExternalBehavior: false,
      consentRequiredFor: ["revealed_purchases", "financial_context"],
      retention: "session",
    },
  };

  it("renders preference provenance and consent boundaries", () => {
    const html = preferenceModelCard(model, criteria);

    expect(html).toContain("Utility model derived before ranking");
    expect(html).toContain("84% confidence - clarification recommended");
    expect(html).toContain("Battery life");
    expect(html).toContain("Typed Intent - 92%");
    expect(html).toContain("Revealed Purchases, Financial Context");
    expect(html).toContain("Edit weights or disable any preference source before ranking.");
  });

  it("escapes criterion rationale used in attributes", () => {
    const html = preferenceModelCard(model, criteria);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders a graceful fallback when model provenance is absent", () => {
    const html = preferenceModelCard(undefined, criteria);

    expect(html).toContain("Preference provenance was not returned");
    expect(html).toContain("pref-mini-muted");
  });
});
