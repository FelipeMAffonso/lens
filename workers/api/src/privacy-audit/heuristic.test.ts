import { describe, expect, it } from "vitest";
import { runHeuristicAudit } from "./heuristic.js";

describe("runHeuristicAudit", () => {
  it("extracts identity + device data-type categories", () => {
    const text = `We collect your email address, full name, and device identifier to operate the service. Cookies are used for authentication.`;
    const r = runHeuristicAudit(text);
    const categories = r.dataCollected.map((d) => d.category);
    expect(categories).toContain("identity");
    expect(categories).toContain("device");
    const identity = r.dataCollected.find((d) => d.category === "identity");
    expect(identity?.types).toContain("email");
    expect(identity?.types).toContain("name");
  });

  it("detects advertising + analytics partners", () => {
    const text = `We share data with advertising partners and analytics services to improve our product.`;
    const r = runHeuristicAudit(text);
    const parties = r.sharedWithThirdParties.map((p) => p.partyCategory);
    expect(parties).toContain("advertising");
    expect(parties).toContain("analytics");
  });

  it("detects GDPR + CCPA frameworks", () => {
    const text = `This policy complies with the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).`;
    const r = runHeuristicAudit(text);
    expect(r.regulatoryFrameworks).toEqual(expect.arrayContaining(["GDPR", "CCPA"]));
  });

  it("flags forced-consent-by-continuing dark pattern", () => {
    const text = `By continuing to use this service, you agree to these terms.`;
    const r = runHeuristicAudit(text);
    const p = r.consentDarkPatterns.find((x) => x.pattern === "forced-consent-by-continuing");
    expect(p?.severity).toBe("blocker");
    expect(p?.evidence).toContain("continuing");
  });

  it("flags opt-out-requires-contact", () => {
    const text = `To opt out, please contact our support team at privacy@example.com.`;
    const r = runHeuristicAudit(text);
    expect(r.consentDarkPatterns.some((p) => p.pattern === "opt-out-requires-contact")).toBe(true);
  });

  it("flags indefinite-retention", () => {
    const text = `We retain your data for as long as necessary to operate the service.`;
    const r = runHeuristicAudit(text);
    expect(r.consentDarkPatterns.some((p) => p.pattern === "indefinite-retention")).toBe(true);
  });

  it("flags non-specific-sharing (trusted partners)", () => {
    const text = `We may share your data with our trusted partners.`;
    const r = runHeuristicAudit(text);
    expect(r.consentDarkPatterns.some((p) => p.pattern === "non-specific-sharing")).toBe(true);
  });

  it("detects deletion rights via mechanism keywords", () => {
    const text = `You have the right to delete your account at any time through your account settings.`;
    const r = runHeuristicAudit(text);
    expect(r.deletion.available).toBe(true);
    expect(r.deletion.mechanism).toBe("in-app-setting");
  });

  it("detects retention with specific period", () => {
    const text = `We retain data for 90 days after account deletion.`;
    const r = runHeuristicAudit(text);
    expect(r.retention.declared).toBe(true);
    expect(r.retention.period?.toLowerCase()).toContain("90");
  });

  it("empty policy → empty audit", () => {
    const r = runHeuristicAudit("");
    expect(r.dataCollected).toEqual([]);
    expect(r.sharedWithThirdParties).toEqual([]);
    expect(r.regulatoryFrameworks).toEqual([]);
  });
});
