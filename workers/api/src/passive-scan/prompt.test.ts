// S4-W22 — prompt composition unit tests.

import { describe, expect, it } from "vitest";
import type { DarkPatternPack, RegulationPack, InterventionPack } from "@lens/shared";
import { buildSystemPrompt, buildUserMessage, selectPacksForHits } from "./prompt.js";
import type { PassiveScanRequest } from "./types.js";

const dpHiddenCosts: DarkPatternPack = {
  slug: "dark-pattern/hidden-costs",
  type: "dark-pattern",
  version: "1.0.0",
  name: "Hidden costs",
  summary: "Costs shown only at checkout.",
  status: "published",
  authors: [],
  reviewers: [],
  lastVerified: "2026-04-21",
  retirementDate: null,
  retirementReason: null,
  evidence: [],
  applicability: { pageTypes: ["checkout", "cart"], urlPatterns: [] },
  body: {
    canonicalName: "Hidden costs",
    brignullId: "hidden-costs",
    description: "Hidden mandatory fees revealed at checkout.",
    severity: "deceptive",
    illegalInJurisdictions: [],
    detectionHeuristics: [],
    llmVerifyPrompt: "Confirm fee disclosure timing.",
    remediation: "Warn + disclose.",
    regulatoryLinks: ["regulation/us-federal-ftc-junk-fees"],
    interventionLinks: ["intervention/file-ftc-complaint"],
  },
};

const regJunkFees: RegulationPack = {
  slug: "regulation/us-federal-ftc-junk-fees",
  type: "regulation",
  version: "1.0.0",
  name: "FTC Junk Fees Rule",
  summary: "Requires disclosure of mandatory fees.",
  status: "published",
  authors: [],
  reviewers: [],
  lastVerified: "2026-04-21",
  retirementDate: null,
  retirementReason: null,
  evidence: [],
  applicability: {
    jurisdiction: "us-federal",
    productCategories: [],
    businessScope: { appliesTo: [] },
  },
  body: {
    officialName: "Trade Regulation Rule on Unfair or Deceptive Fees",
    citation: "16 CFR Part 464",
    status: "in-force",
    effectiveDate: "2025-05-12",
    vacatedDate: null,
    vacatedBy: null,
    supersededBy: null,
    supersedes: null,
    scopeSummary: "Live events + lodging.",
    userRightsPlainLanguage: "Mandatory fees must be in the advertised price.",
    enforcementSignals: [],
    evidenceRefs: [],
  },
};

const interventionFtc: InterventionPack = {
  slug: "intervention/file-ftc-complaint",
  type: "intervention",
  version: "1.0.0",
  name: "File FTC complaint",
  summary: "Route to reportfraud.ftc.gov.",
  status: "published",
  authors: [],
  reviewers: [],
  lastVerified: "2026-04-21",
  retirementDate: null,
  retirementReason: null,
  evidence: [],
  applicability: { triggerTypes: ["junk-fee-violation"] },
  body: {
    canonicalName: "File FTC complaint",
    description: "Draft and route a complaint to the FTC.",
    executionType: "escalate-regulator",
    consentTier: "explicit-per-action",
    prerequisites: [],
    template: { format: "ftc-complaint-form", fields: {} },
    successSignals: [],
    failureFallback: null,
    regulatoryBasis: [],
  },
};

describe("buildSystemPrompt", () => {
  it("includes dark pattern, regulation, and intervention fragments", () => {
    const sys = buildSystemPrompt([dpHiddenCosts], [regJunkFees], [interventionFtc]);
    expect(sys).toContain("DARK PATTERNS TO CHECK");
    expect(sys).toContain("Hidden costs");
    expect(sys).toContain("APPLICABLE REGULATIONS");
    expect(sys).toContain("16 CFR Part 464");
    expect(sys).toContain("AVAILABLE INTERVENTIONS");
    expect(sys).toContain("intervention/file-ftc-complaint");
    expect(sys).toContain("OUTPUT CONTRACT");
  });
  it("omits the interventions listing when none are available", () => {
    const sys = buildSystemPrompt([dpHiddenCosts], [regJunkFees], []);
    // The section header has the slug-arrow; the OUTPUT CONTRACT mentions the
    // phrase "AVAILABLE INTERVENTIONS" in a rule, so assert the specific header
    // (with the Unicode arrow) is absent.
    expect(sys).not.toContain("AVAILABLE INTERVENTIONS (slug →");
  });
});

describe("buildUserMessage", () => {
  const req: PassiveScanRequest = {
    host: "marriott.com",
    pageType: "checkout",
    jurisdiction: "us-federal",
    hits: [
      {
        packSlug: "dark-pattern/hidden-costs",
        brignullId: "hidden-costs",
        severity: "deceptive",
        excerpt: "Destination Amenity Fee $49/night",
      },
    ],
  };

  it("includes host, page type, and numbered hits", () => {
    const msg = buildUserMessage(req);
    expect(msg).toContain("HOST: marriott.com");
    expect(msg).toContain("PAGE TYPE: checkout");
    expect(msg).toContain("JURISDICTION: us-federal");
    expect(msg).toContain("[1] packSlug: dark-pattern/hidden-costs");
    expect(msg).toContain("Destination Amenity Fee $49/night");
  });

  it("truncates excerpts over 200 chars with ellipsis", () => {
    const long = { ...req, hits: [{ ...req.hits[0]!, excerpt: "a".repeat(250) }] };
    const msg = buildUserMessage(long);
    expect(msg).toMatch(/a{197}\.\.\."/);
  });
});

describe("selectPacksForHits", () => {
  const registryStub = {
    bySlug: new Map<string, unknown>([
      ["dark-pattern/hidden-costs", dpHiddenCosts],
      ["regulation/us-federal-ftc-junk-fees", regJunkFees],
      ["intervention/file-ftc-complaint", interventionFtc],
    ]),
  };

  it("returns packs referenced by hits + their regulation/intervention links", () => {
    const result = selectPacksForHits(
      [
        {
          packSlug: "dark-pattern/hidden-costs",
          brignullId: "hidden-costs",
          severity: "deceptive",
          excerpt: "x",
        },
      ],
      registryStub as never,
    );
    expect(result.darkPatternPacks).toHaveLength(1);
    expect(result.darkPatternPacks[0]!.slug).toBe("dark-pattern/hidden-costs");
    expect([...result.regulationSlugs]).toContain("regulation/us-federal-ftc-junk-fees");
    expect([...result.interventionSlugs]).toContain("intervention/file-ftc-complaint");
  });

  it("de-duplicates when the same packSlug appears twice", () => {
    const result = selectPacksForHits(
      [
        { packSlug: "dark-pattern/hidden-costs", brignullId: "hidden-costs", severity: "deceptive", excerpt: "a" },
        { packSlug: "dark-pattern/hidden-costs", brignullId: "hidden-costs", severity: "deceptive", excerpt: "b" },
      ],
      registryStub as never,
    );
    expect(result.darkPatternPacks).toHaveLength(1);
  });

  it("silently skips unknown packs without throwing", () => {
    const result = selectPacksForHits(
      [
        {
          packSlug: "dark-pattern/nonexistent",
          brignullId: "nope",
          severity: "deceptive",
          excerpt: "x",
        },
      ],
      registryStub as never,
    );
    expect(result.darkPatternPacks).toHaveLength(0);
  });
});
