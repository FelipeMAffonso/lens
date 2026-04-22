import { describe, expect, it } from "vitest";
import { assessMatches, bandFromCvss } from "./assess.js";
import type { FirmwareMatch } from "./types.js";

function mkMatch(cvss: number | null, severity: "critical" | "high" | "medium" | "low" | "informational"): FirmwareMatch {
  return {
    advisory: {
      source: "manufacturer",
      advisoryId: "X-1",
      vendor: "Acme",
      affectedModels: ["Foo"],
      title: "t",
      description: "d",
      severity,
      cvssScore: cvss,
      cveIds: [],
      fixedFirmwareVersion: null,
      remediationSteps: "r",
      publishedAt: "2026-01-01",
      sourceUrl: "https://example.invalid",
    },
    purchase: {
      id: "p",
      user_id: "u",
      product_name: "Foo",
      brand: "Acme",
      category: "routers",
      purchased_at: "2025-01-01T00:00:00.000Z",
    },
    score: 1,
    reasons: ["match"],
  };
}

describe("bandFromCvss", () => {
  it("maps 9.8 → critical", () => {
    expect(bandFromCvss(9.8, "critical")).toBe("critical");
  });
  it("maps 7.5 → high", () => {
    expect(bandFromCvss(7.5, "high")).toBe("high");
  });
  it("maps 4.6 → medium", () => {
    expect(bandFromCvss(4.6, "medium")).toBe("medium");
  });
  it("maps 3.1 → low", () => {
    expect(bandFromCvss(3.1, "low")).toBe("low");
  });
  it("exactly 9.0 → critical, 8.9 → high", () => {
    expect(bandFromCvss(9.0, "critical")).toBe("critical");
    expect(bandFromCvss(8.9, "high")).toBe("high");
  });
  it("exactly 7.0 → high, 6.9 → medium", () => {
    expect(bandFromCvss(7.0, "high")).toBe("high");
    expect(bandFromCvss(6.9, "medium")).toBe("medium");
  });
  it("null CVSS falls back to declared severity", () => {
    expect(bandFromCvss(null, "critical")).toBe("critical");
    expect(bandFromCvss(null, "high")).toBe("high");
    expect(bandFromCvss(null, "low")).toBe("low");
    expect(bandFromCvss(null, "informational")).toBe("informational");
    expect(bandFromCvss(null, "medium")).toBe("medium");
  });
});

describe("assessMatches", () => {
  it("critical + high → shouldNotify=true", () => {
    const a = assessMatches([mkMatch(9.8, "critical"), mkMatch(7.5, "high")]);
    expect(a[0]!.shouldNotify).toBe(true);
    expect(a[1]!.shouldNotify).toBe(true);
    expect(a[0]!.shouldDashboardOnly).toBe(false);
    expect(a[1]!.shouldDashboardOnly).toBe(false);
  });

  it("medium + low + informational → shouldDashboardOnly=true, shouldNotify=false", () => {
    const a = assessMatches([mkMatch(5.0, "medium"), mkMatch(3.0, "low"), mkMatch(null, "informational")]);
    for (const m of a) {
      expect(m.shouldNotify).toBe(false);
      expect(m.shouldDashboardOnly).toBe(true);
    }
  });

  it("preserves original fields", () => {
    const a = assessMatches([mkMatch(9.8, "critical")]);
    expect(a[0]!.advisory.advisoryId).toBe("X-1");
    expect(a[0]!.purchase.id).toBe("p");
    expect(a[0]!.reasons).toEqual(["match"]);
  });

  it("empty input → empty output", () => {
    expect(assessMatches([])).toEqual([]);
  });
});
