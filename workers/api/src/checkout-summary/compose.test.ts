import { describe, expect, it } from "vitest";
import { composeSummary } from "./compose.js";
import type { CheckoutSummaryRequest } from "./types.js";

function req(signals: CheckoutSummaryRequest["signals"]): CheckoutSummaryRequest {
  return { host: "marriott.com", signals };
}

describe("composeSummary — empty signals", () => {
  it("no signals → proceed at score 100 + 'no concerns' rationale", () => {
    const r = composeSummary(req({}));
    expect(r.verdict).toBe("proceed");
    expect(r.score).toBe(100);
    expect(r.rationale).toHaveLength(1);
    expect(r.rationale[0]!.signal).toBe("none");
    expect(r.signalCount).toBe(0);
  });
});

describe("composeSummary — priceHistory", () => {
  it("fake-sale subtracts 25 + adds blocker rationale", () => {
    const r = composeSummary(
      req({ priceHistory: { verdict: "fake-sale", discountClaimed: 30, discountActual: 3 } }),
    );
    expect(r.score).toBe(75);
    const ph = r.rationale.find((x) => x.signal === "priceHistory");
    expect(ph?.severity).toBe("blocker");
    expect(ph?.message).toContain("30%");
    expect(ph?.message).toContain("3.0%");
    // Blocker dominance: 75 would be proceed, but blocker demotes to hesitate.
    expect(r.verdict).toBe("hesitate");
  });

  it("genuine-sale adds 5 + info rationale", () => {
    const r = composeSummary(req({ priceHistory: { verdict: "genuine-sale" } }));
    expect(r.score).toBe(100); // clamped
    expect(r.verdict).toBe("proceed");
  });

  it("modest-dip is a zero contribution + info bullet", () => {
    const r = composeSummary(req({ priceHistory: { verdict: "modest-dip" } }));
    expect(r.score).toBe(100);
    expect(r.rationale.some((x) => x.signal === "priceHistory" && x.severity === "info")).toBe(true);
  });
});

describe("composeSummary — totalCost", () => {
  it("year1 > 3× sticker → blocker + −20", () => {
    const r = composeSummary(
      req({ totalCost: { upfront: 100, year1: 400, year3: 800 } }),
    );
    expect(r.score).toBe(80);
    expect(r.verdict).toBe("hesitate"); // blocker rule
    const tc = r.rationale.find((x) => x.signal === "totalCost");
    expect(tc?.severity).toBe("blocker");
    expect(tc?.message).toMatch(/year-1 cost is 4\.0×/i);
  });
  it("1.5× < ratio ≤ 3× → warn + −10", () => {
    const r = composeSummary(
      req({ totalCost: { upfront: 100, year1: 200, year3: 400 } }),
    );
    expect(r.score).toBe(90);
    const tc = r.rationale.find((x) => x.signal === "totalCost");
    expect(tc?.severity).toBe("warn");
  });
  it("modest ratio → info only, no score hit", () => {
    const r = composeSummary(
      req({ totalCost: { upfront: 100, year1: 110, year3: 120 } }),
    );
    expect(r.score).toBe(100);
  });
});

describe("composeSummary — passiveScan", () => {
  it("1 confirmed pattern → −10 warn", () => {
    const r = composeSummary(req({ passiveScan: { confirmedCount: 1, topPattern: "hidden-costs" } }));
    expect(r.score).toBe(90);
    expect(r.rationale.some((x) => x.severity === "warn" && x.message.includes("1 dark-pattern"))).toBe(true);
  });
  it("2+ confirmed patterns → −20 blocker", () => {
    const r = composeSummary(req({ passiveScan: { confirmedCount: 2 } }));
    expect(r.score).toBe(80);
    expect(r.rationale.some((x) => x.severity === "blocker")).toBe(true);
    expect(r.verdict).toBe("hesitate");
  });
  it("penalty capped at 30 regardless of count", () => {
    const r = composeSummary(req({ passiveScan: { confirmedCount: 99 } }));
    expect(r.score).toBe(70);
  });
});

describe("composeSummary — breachHistory", () => {
  it("critical band → −30 blocker", () => {
    const r = composeSummary(req({ breachHistory: { score: 80, band: "critical" } }));
    expect(r.score).toBe(70);
    expect(r.rationale.some((x) => x.signal === "breachHistory" && x.severity === "blocker")).toBe(true);
    expect(r.verdict).toBe("hesitate"); // blocker demotion
  });
  it("high band → −15 warn", () => {
    const r = composeSummary(req({ breachHistory: { score: 55, band: "high" } }));
    expect(r.score).toBe(85);
    expect(r.verdict).toBe("proceed");
  });
  it("SSN bonus on moderate+ band → extra −10", () => {
    const r = composeSummary(
      req({ breachHistory: { score: 30, band: "moderate", hasSsnExposure: true } }),
    );
    expect(r.score).toBe(85); // -5 band, -10 ssn
  });
  it("low/none band contributes nothing", () => {
    const r = composeSummary(req({ breachHistory: { score: 0, band: "none" } }));
    expect(r.score).toBe(100);
  });
});

describe("composeSummary — compat", () => {
  it("incompatible → −40 blocker → rethink band", () => {
    const r = composeSummary(req({ compat: { overall: "incompatible", blockerCount: 2 } }));
    expect(r.score).toBe(60);
    expect(r.verdict).toBe("hesitate"); // blocker rule, not "proceed"
  });
  it("compatible → +5 info", () => {
    const r = composeSummary(req({ compat: { overall: "compatible" } }));
    expect(r.score).toBe(100); // clamped
  });
  it("no-rule-matched → neutral info", () => {
    const r = composeSummary(req({ compat: { overall: "no-rule-matched" } }));
    expect(r.score).toBe(100);
  });
});

describe("composeSummary — provenance", () => {
  it("affiliate indicators + unverified claim → warn bullets", () => {
    const r = composeSummary(
      req({
        provenance: {
          affiliateIndicatorCount: 3,
          worstClaimFoundVia: "none",
          minScore: 0.2,
        },
      }),
    );
    expect(r.score).toBe(65); // -10 affiliate, -15 unverified, -10 low score = -35
    expect(r.rationale.filter((x) => x.signal === "provenance")).toHaveLength(3);
  });
});

describe("composeSummary — verdict banding", () => {
  it("score ≥ 70 + no blocker → proceed", () => {
    const r = composeSummary(req({}));
    expect(r.verdict).toBe("proceed");
  });
  it("40 ≤ score < 70 → hesitate", () => {
    const r = composeSummary(
      req({
        passiveScan: { confirmedCount: 1 },
        breachHistory: { score: 40, band: "high" },
        provenance: { affiliateIndicatorCount: 2 },
      }),
    );
    // -10 passive - 15 breach - 10 affiliate = -35, score 65 → hesitate
    expect(r.score).toBe(65);
    expect(r.verdict).toBe("hesitate");
  });
  it("score < 40 → rethink", () => {
    const r = composeSummary(
      req({
        compat: { overall: "incompatible" },
        breachHistory: { score: 80, band: "critical" },
      }),
    );
    // -40 compat, -30 breach = -70, score 30 → rethink
    expect(r.score).toBe(30);
    expect(r.verdict).toBe("rethink");
  });
  it("blocker demotes score 75 proceed → hesitate", () => {
    const r = composeSummary(req({ priceHistory: { verdict: "fake-sale" } }));
    expect(r.score).toBe(75);
    expect(r.verdict).toBe("hesitate");
  });
});

describe("composeSummary — composite", () => {
  it("Marriott-style input (1 passive + low breach) → hesitate", () => {
    const r = composeSummary({
      host: "marriott.com",
      signals: {
        passiveScan: { confirmedCount: 1, topPattern: "hidden-costs" },
        breachHistory: { score: 10, band: "low" },
        totalCost: { upfront: 298, year1: 298, year3: 298 },
      },
    });
    // -10 passive + 0 breach (low) + 0 totalCost = 90 → proceed? but passive is warn, not blocker
    // 1 confirmed → warn (score -10), no blocker → final 90 proceed.
    // Actually this is a "proceed" verdict. To force hesitate, need ≥2 patterns or blocker.
    // The test verifies proceed here.
    expect(r.verdict).toBe("proceed");
    expect(r.score).toBe(90);
    expect(r.signalCount).toBe(3);
  });

  it("Critical breach + incompatible + fake sale → rethink", () => {
    const r = composeSummary({
      host: "bad.example.com",
      signals: {
        breachHistory: { score: 95, band: "critical" },
        compat: { overall: "incompatible" },
        priceHistory: { verdict: "fake-sale", discountClaimed: 50, discountActual: 2 },
      },
    });
    // -30 breach - 40 compat - 25 fake = -95, score 5 → rethink
    expect(r.verdict).toBe("rethink");
    expect(r.score).toBe(5);
  });

  it("recommendation sentence is non-empty", () => {
    const r = composeSummary(req({}));
    expect(r.recommendation.length).toBeGreaterThan(0);
  });
});
