import { describe, expect, it } from "vitest";
import { bandFor, computeTransparencyScore } from "./score.js";
import { EMPTY } from "./verify.js";
import type { PrivacyAudit } from "./types.js";

function audit(over: Partial<PrivacyAudit>): PrivacyAudit {
  return { ...EMPTY, ...over };
}

describe("computeTransparencyScore", () => {
  it("empty audit → baseline 50", () => {
    expect(computeTransparencyScore(audit({}))).toBe(50);
  });

  it("GDPR + CCPA + deletion + specific retention → boost into high band", () => {
    const r = computeTransparencyScore(
      audit({
        regulatoryFrameworks: ["GDPR", "CCPA"],
        deletion: { available: true, mechanism: "in-app-setting" },
        retention: { declared: true, period: "30 days" },
        dataCollected: [{ category: "identity", types: ["email"], purpose: "account" }],
      }),
    );
    // 50 + 10 (2 frameworks) + 10 del + 10 retention + 5 dataCollected = 85
    expect(r).toBe(85);
    expect(bandFor(r)).toBe("high");
  });

  it("forced-consent blocker subtracts 20", () => {
    const r = computeTransparencyScore(
      audit({
        consentDarkPatterns: [
          { pattern: "forced-consent-by-continuing", severity: "blocker", evidence: "x" },
        ],
      }),
    );
    expect(r).toBe(30);
    expect(bandFor(r)).toBe("low");
  });

  it("indefinite retention declared → +3, not +10", () => {
    const r = computeTransparencyScore(
      audit({ retention: { declared: true, period: "indefinite" } }),
    );
    expect(r).toBe(53);
  });

  it("score clamps at [0, 100]", () => {
    const low = computeTransparencyScore(
      audit({
        consentDarkPatterns: [
          { pattern: "a", severity: "blocker", evidence: "x" },
          { pattern: "b", severity: "blocker", evidence: "x" },
          { pattern: "c", severity: "blocker", evidence: "x" },
        ],
      }),
    );
    expect(low).toBe(0);

    const high = computeTransparencyScore(
      audit({
        regulatoryFrameworks: ["GDPR", "CCPA", "CPRA", "COPPA", "HIPAA"], // cap +15
        deletion: { available: true, mechanism: "in-app-setting" },
        retention: { declared: true, period: "30 days" },
        dataCollected: [
          { category: "a", types: [], purpose: "" },
          { category: "b", types: [], purpose: "" },
          { category: "c", types: [], purpose: "" },
          { category: "d", types: [], purpose: "" }, // cap +15
        ],
        sharedWithThirdParties: [{ partyCategory: "x", purpose: "" }],
      }),
    );
    expect(high).toBeLessThanOrEqual(100);
  });
});

describe("bandFor", () => {
  it("<40 → low", () => expect(bandFor(30)).toBe("low"));
  it("40-69 → moderate", () => {
    expect(bandFor(40)).toBe("moderate");
    expect(bandFor(69)).toBe("moderate");
  });
  it("≥70 → high", () => {
    expect(bandFor(70)).toBe("high");
    expect(bandFor(100)).toBe("high");
  });
});
