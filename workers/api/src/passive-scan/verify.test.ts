// S4-W22 — LLM verdict parsing + projection tests.

import { describe, expect, it } from "vitest";
import type { PackRegistry, RegulationPack, InterventionPack, DarkPatternPack } from "@lens/shared";
import { parseVerdicts, projectVerdicts, verifyHits } from "./verify.js";
import type { Hit, PassiveScanRequest } from "./types.js";

const hit: Hit = {
  packSlug: "dark-pattern/hidden-costs",
  brignullId: "hidden-costs",
  severity: "deceptive",
  excerpt: "Destination Amenity Fee $49/night",
};

const dpHiddenCosts: DarkPatternPack = {
  slug: "dark-pattern/hidden-costs",
  type: "dark-pattern",
  version: "1.0.0",
  name: "Hidden costs",
  summary: "",
  status: "published",
  authors: [],
  reviewers: [],
  lastVerified: "2026-04-21",
  retirementDate: null,
  retirementReason: null,
  evidence: [],
  applicability: { pageTypes: [], urlPatterns: [] },
  body: {
    canonicalName: "Hidden costs",
    brignullId: "hidden-costs",
    description: "",
    severity: "deceptive",
    illegalInJurisdictions: [],
    detectionHeuristics: [],
    llmVerifyPrompt: "",
    remediation: "",
    regulatoryLinks: ["regulation/us-federal-ftc-junk-fees"],
    interventionLinks: ["intervention/file-ftc-complaint"],
  },
};

const regJunkFees: RegulationPack = {
  slug: "regulation/us-federal-ftc-junk-fees",
  type: "regulation",
  version: "1.0.0",
  name: "FTC Junk Fees Rule",
  summary: "",
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
    scopeSummary: "",
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
  summary: "",
  status: "published",
  authors: [],
  reviewers: [],
  lastVerified: "2026-04-21",
  retirementDate: null,
  retirementReason: null,
  evidence: [],
  applicability: { triggerTypes: [] },
  body: {
    canonicalName: "File FTC complaint",
    description: "",
    executionType: "escalate-regulator",
    consentTier: "explicit-per-action",
    prerequisites: [],
    template: { format: "ftc-complaint-form", fields: {} },
    successSignals: [],
    failureFallback: null,
    regulatoryBasis: [],
  },
};

const registry: PackRegistry = {
  all: [dpHiddenCosts, regJunkFees, interventionFtc],
  bySlug: new Map<string, never>([
    ["dark-pattern/hidden-costs", dpHiddenCosts as never],
    ["regulation/us-federal-ftc-junk-fees", regJunkFees as never],
    ["intervention/file-ftc-complaint", interventionFtc as never],
  ]),
  categoriesByAlias: new Map(),
  darkPatternsByPageType: new Map(),
  regulationsByJurisdiction: new Map(),
  feesByCategoryContext: new Map(),
  interventionsByTrigger: new Map(),
};

describe("parseVerdicts", () => {
  it("parses a clean JSON response", () => {
    const text = JSON.stringify({
      verdicts: [
        {
          packSlug: "dark-pattern/hidden-costs",
          verdict: "confirmed",
          explanation: "Resort fee disclosed only at checkout.",
          regulationSlug: "regulation/us-federal-ftc-junk-fees",
          interventionSlugs: ["intervention/file-ftc-complaint"],
          feeBreakdown: { label: "Destination Amenity Fee", amountUsd: 49, frequency: "per-night" },
        },
      ],
    });
    const r = parseVerdicts(text);
    expect(r).toHaveLength(1);
    expect(r[0]!.verdict).toBe("confirmed");
    expect(r[0]!.feeBreakdown?.amountUsd).toBe(49);
  });

  it("tolerates markdown fences", () => {
    const text = "```json\n" + JSON.stringify({ verdicts: [{ packSlug: "x", verdict: "dismissed" }] }) + "\n```";
    const r = parseVerdicts(text);
    expect(r).toHaveLength(1);
    expect(r[0]!.verdict).toBe("dismissed");
  });

  it("tolerates surrounding prose", () => {
    const text = 'Sure thing! Here: { "verdicts": [{"packSlug":"x","verdict":"uncertain"}] } done.';
    const r = parseVerdicts(text);
    expect(r[0]!.verdict).toBe("uncertain");
  });

  it("defaults missing fields safely", () => {
    const text = JSON.stringify({ verdicts: [{ packSlug: "x" }] });
    const r = parseVerdicts(text);
    expect(r[0]!.verdict).toBe("uncertain");
    expect(r[0]!.explanation).toBe("");
    expect(r[0]!.regulationSlug).toBeNull();
    expect(r[0]!.interventionSlugs).toEqual([]);
    expect(r[0]!.feeBreakdown).toBeNull();
  });

  it("throws when no JSON is present", () => {
    expect(() => parseVerdicts("sorry, no JSON here")).toThrow(/no JSON/);
  });

  it("throws on malformed JSON with mismatched braces", () => {
    // Input has both open and close braces but invalid JSON content between them.
    expect(() => parseVerdicts("{ verdicts: [{'bad': syntax}] }")).toThrow(/malformed/);
  });

  it("throws when no JSON object is present at all", () => {
    expect(() => parseVerdicts("{ verdicts: [")).toThrow(/no JSON/);
  });
});

describe("projectVerdicts", () => {
  it("enriches confirmed hits with regulation + intervention packs", () => {
    const raws = [
      {
        packSlug: "dark-pattern/hidden-costs",
        verdict: "confirmed" as const,
        explanation: "Resort fee at checkout.",
        regulationSlug: "regulation/us-federal-ftc-junk-fees",
        interventionSlugs: ["intervention/file-ftc-complaint"],
        feeBreakdown: { label: "Destination Amenity Fee", amountUsd: 49, frequency: "per-night" as const },
      },
    ];
    const r = projectVerdicts([hit], raws, registry);
    expect(r.confirmed).toHaveLength(1);
    expect(r.confirmed[0]!.regulatoryCitation?.citation).toBe("16 CFR Part 464");
    expect(r.confirmed[0]!.suggestedInterventions[0]!.canonicalName).toBe("File FTC complaint");
    expect(r.confirmed[0]!.feeBreakdown?.amountUsd).toBe(49);
  });

  it("drops fabricated regulation slugs", () => {
    const raws = [
      {
        packSlug: "dark-pattern/hidden-costs",
        verdict: "confirmed" as const,
        explanation: "",
        regulationSlug: "regulation/made-up",
        interventionSlugs: [],
        feeBreakdown: null,
      },
    ];
    const r = projectVerdicts([hit], raws, registry);
    expect(r.confirmed[0]!.regulatoryCitation).toBeUndefined();
  });

  it("routes dismissed verdicts into the dismissed array", () => {
    const raws = [
      {
        packSlug: "dark-pattern/hidden-costs",
        verdict: "dismissed" as const,
        explanation: "False positive on shipping estimate.",
        regulationSlug: null,
        interventionSlugs: [],
        feeBreakdown: null,
      },
    ];
    const r = projectVerdicts([hit], raws, registry);
    expect(r.confirmed).toHaveLength(0);
    expect(r.dismissed[0]!.reason).toContain("False positive");
  });

  it("marks missing verdicts as uncertain", () => {
    const r = projectVerdicts([hit], [], registry);
    expect(r.confirmed[0]!.verdict).toBe("uncertain");
    expect(r.confirmed[0]!.llmExplanation).toContain("No Stage-2 verdict");
  });
});

describe("verifyHits", () => {
  const req: PassiveScanRequest = {
    host: "marriott.com",
    pageType: "checkout",
    jurisdiction: "us-federal",
    hits: [hit],
  };

  it("returns heuristic-only when opus client is null", async () => {
    const r = await verifyHits(req, registry, null);
    expect(r.ran).toBe("heuristic-only");
    expect(r.confirmed[0]!.verdict).toBe("uncertain");
  });

  it("routes through opus and returns projected confirmed hits", async () => {
    const opus = {
      call: async () =>
        JSON.stringify({
          verdicts: [
            {
              packSlug: "dark-pattern/hidden-costs",
              verdict: "confirmed",
              explanation: "Resort fee only shown at checkout.",
              regulationSlug: "regulation/us-federal-ftc-junk-fees",
              interventionSlugs: ["intervention/file-ftc-complaint"],
              feeBreakdown: { label: "Resort Fee", amountUsd: 49, frequency: "per-night" },
            },
          ],
        }),
    };
    const r = await verifyHits(req, registry, opus);
    expect(r.ran).toBe("opus");
    expect(r.confirmed[0]!.regulatoryCitation?.citation).toBe("16 CFR Part 464");
  });

  it("falls back to heuristic-only on opus error", async () => {
    const opus = {
      call: async () => {
        throw new Error("API down");
      },
    };
    const r = await verifyHits(req, registry, opus);
    expect(r.ran).toBe("heuristic-only");
  });

  it("falls back on unparseable opus response", async () => {
    const opus = { call: async () => "sorry, I cannot comply" };
    const r = await verifyHits(req, registry, opus);
    expect(r.ran).toBe("heuristic-only");
  });
});
