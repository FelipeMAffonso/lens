import { describe, expect, it } from "vitest";
import { parseAuditJson, EMPTY } from "./verify.js";

describe("parseAuditJson", () => {
  it("parses a canonical valid JSON into PrivacyAudit shape", () => {
    const raw = JSON.stringify({
      dataCollected: [{ category: "identity", types: ["email", "name"], purpose: "account ops" }],
      sharedWithThirdParties: [{ partyCategory: "analytics", purpose: "product improvement" }],
      retention: { declared: true, period: "30 days" },
      deletion: { available: true, mechanism: "in-app-setting" },
      consentDarkPatterns: [{ pattern: "bundled-consent", severity: "warn", evidence: "accept all" }],
      regulatoryFrameworks: ["GDPR", "CCPA"],
    });
    const r = parseAuditJson(raw);
    expect(r.dataCollected).toHaveLength(1);
    expect(r.dataCollected[0]!.types).toEqual(["email", "name"]);
    expect(r.sharedWithThirdParties[0]!.partyCategory).toBe("analytics");
    expect(r.retention.period).toBe("30 days");
    expect(r.deletion.available).toBe(true);
    expect(r.consentDarkPatterns[0]!.severity).toBe("warn");
    expect(r.regulatoryFrameworks).toEqual(["GDPR", "CCPA"]);
  });

  it("tolerates markdown fences", () => {
    const fenced = "```json\n" + JSON.stringify({ ...EMPTY, regulatoryFrameworks: ["GDPR"] }) + "\n```";
    const r = parseAuditJson(fenced);
    expect(r.regulatoryFrameworks).toEqual(["GDPR"]);
  });

  it("defaults safely on missing fields", () => {
    const r = parseAuditJson(JSON.stringify({ dataCollected: [] }));
    expect(r.retention.declared).toBe(false);
    expect(r.deletion.available).toBe(false);
    expect(r.consentDarkPatterns).toEqual([]);
  });

  it("drops dataCollected entries without category", () => {
    const r = parseAuditJson(JSON.stringify({
      dataCollected: [{ types: ["x"] }, { category: "identity", types: [], purpose: "" }],
    }));
    expect(r.dataCollected).toHaveLength(1);
  });

  it("invalid severity defaults to warn", () => {
    const r = parseAuditJson(JSON.stringify({
      consentDarkPatterns: [{ pattern: "p", severity: "fatal", evidence: "x" }],
    }));
    expect(r.consentDarkPatterns[0]!.severity).toBe("warn");
  });

  it("throws on totally missing JSON", () => {
    expect(() => parseAuditJson("no json here")).toThrow(/no JSON/);
  });

  it("throws on malformed JSON with braces", () => {
    expect(() => parseAuditJson("{ totally bad }")).toThrow(/malformed/);
  });
});
