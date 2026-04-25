import { describe, expect, it } from "vitest";
import type { UserIntent } from "@lens/shared";
import {
  applyWeightMapToCriteriaJson,
  criteriaJsonToWeightMap,
  derivePreferenceIntent,
} from "./inference.js";

describe("derivePreferenceIntent", () => {
  it("adds an inspectable layered utility model before recommendation", () => {
    const intent: UserIntent = {
      category: "wireless chargers",
      criteria: [
        { name: "portable", weight: 0.6, direction: "higher_is_better", confidence: 0.7 },
        { name: "budget", weight: 0.4, direction: "lower_is_better", confidence: 0.9 },
      ],
      budget: { max: 100, currency: "USD" },
      rawCriteriaText: "portable wireless charger under $100",
    };
    const out = derivePreferenceIntent(intent, { mode: "url" });
    expect(out.preferenceModel?.version).toBe("layered-utility-v1");
    expect(out.preferenceModel?.layers.some((l) => l.layer === "stated" && l.status === "used")).toBe(true);
    expect(out.preferenceModel?.layers.some((l) => l.layer === "budget" && l.status === "used")).toBe(true);
    expect(out.preferenceModel?.privacy.usesExternalBehavior).toBe(false);
    expect(out.criteria.some((c) => c.name === "device_compatibility")).toBe(true);
    expect(out.criteria.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 4);
  });

  it("marks uncertain inferred priors as clarification candidates", () => {
    const out = derivePreferenceIntent({
      category: "air purifier",
      criteria: [{ name: "nice", weight: 1, direction: "higher_is_better", confidence: 0.45 }],
      rawCriteriaText: "something nice",
    });
    expect(out.preferenceModel?.needsClarification).toBe(true);
    expect(out.criteria.some((c) => c.name === "filter_cost")).toBe(true);
  });

  it("documents opt-in revealed and sensitive data controls", () => {
    const out = derivePreferenceIntent(
      {
        category: "subscription software",
        criteria: [{ name: "privacy", weight: 1, direction: "higher_is_better", confidence: 0.8 }],
        rawCriteriaText: "private subscription app",
      },
      { revealedConsent: false },
    );
    const revealed = out.preferenceModel?.layers.find((l) => l.layer === "revealed");
    expect(revealed?.status).toBe("requires_consent");
    expect(out.preferenceModel?.userControls.join(" ")).toContain("Plaid");
    expect(out.preferenceModel?.privacy.consentRequiredFor).toContain("Plaid transaction monitoring");
  });

  it("covers everyday safety-critical and household categories with explicit priors", () => {
    const cases = [
      ["baby car seat", ["safety", "recall_history", "fit_compatibility"]],
      ["smart tv", ["display_quality", "input_latency", "privacy"]],
      ["robot vacuum", ["cleaning_performance", "parts_availability", "noise"]],
      ["tires", ["safety", "wet_grip", "tread_life"]],
      ["sunscreen skincare", ["ingredient_safety", "allergen_risk", "skin_type_fit"]],
      ["refrigerator appliance", ["energy_efficiency", "reliability", "repairability"]],
    ] as const;

    for (const [category, expected] of cases) {
      const out = derivePreferenceIntent({
        category,
        criteria: [{ name: "price", weight: 1, direction: "lower_is_better", confidence: 0.75 }],
        rawCriteriaText: `${category} under budget`,
      });
      for (const name of expected) {
        expect(out.criteria.some((c) => c.name === name), category).toBe(true);
      }
      expect(out.criteria.reduce((s, c) => s + c.weight, 0), category).toBeCloseTo(1, 4);
    }
  });
});

describe("criteria JSON helpers", () => {
  it("reads old object-shaped preference weights", () => {
    expect(criteriaJsonToWeightMap(JSON.stringify({ price: 0.4, build_quality: 0.6 }))).toEqual({
      price: 0.4,
      build_quality: 0.6,
    });
  });

  it("reads current array-shaped criteria weights", () => {
    const map = criteriaJsonToWeightMap(
      JSON.stringify([
        { name: "Budget", weight: 0.35 },
        { name: "battery", weight: 0.65 },
      ]),
    );
    expect(map).toEqual({ price: 0.35, battery_life: 0.65 });
  });

  it("preserves array-shaped criteria metadata while applying revealed weights", () => {
    const out = applyWeightMapToCriteriaJson(
      JSON.stringify([
        { name: "price", weight: 0.4, direction: "lower_is_better", confidence: 0.9 },
        { name: "build_quality", weight: 0.6, direction: "higher_is_better", confidence: 0.8 },
      ]),
      { price: 0.3, build_quality: 0.7 },
    ) as Array<{ name: string; weight: number; direction: string; confidence: number }>;
    expect(out.find((c) => c.name === "build_quality")?.weight).toBe(0.7);
    expect(out.find((c) => c.name === "price")?.direction).toBe("lower_is_better");
    expect(out.find((c) => c.name === "price")?.confidence).toBe(0.9);
  });
});
