// S4-W22 — end-to-end integration test for the /passive-scan Hono route.
// Spins up a minimal Hono app with the route + a stubbed pack registry +
// a mockable Opus client to prove the contract matches the spec.

import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { PackRegistry, DarkPatternPack, RegulationPack, InterventionPack } from "@lens/shared";
import { handlePassiveScan } from "./handler.js";

// Build a real-looking registry from stub pack objects.
const dp: DarkPatternPack = {
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
  applicability: { pageTypes: ["checkout", "cart"], urlPatterns: [] },
  body: {
    canonicalName: "Hidden costs",
    brignullId: "hidden-costs",
    description: "Hidden mandatory fees at checkout.",
    severity: "deceptive",
    illegalInJurisdictions: [],
    detectionHeuristics: [],
    llmVerifyPrompt: "Confirm fee disclosure timing.",
    remediation: "",
    regulatoryLinks: ["regulation/us-federal-ftc-junk-fees"],
    interventionLinks: ["intervention/file-ftc-complaint"],
  },
};

const reg: RegulationPack = {
  slug: "regulation/us-federal-ftc-junk-fees",
  type: "regulation",
  version: "1.0.0",
  name: "FTC Junk Fees",
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
    scopeSummary: "Live events + lodging.",
    userRightsPlainLanguage: "Mandatory fees must be in the advertised total price.",
    enforcementSignals: [],
    evidenceRefs: [],
  },
};

const inv: InterventionPack = {
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
    description: "Draft and route to FTC.",
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
  all: [dp, reg, inv],
  bySlug: new Map<string, never>([
    ["dark-pattern/hidden-costs", dp as never],
    ["regulation/us-federal-ftc-junk-fees", reg as never],
    ["intervention/file-ftc-complaint", inv as never],
  ]),
  categoriesByAlias: new Map(),
  darkPatternsByPageType: new Map(),
  regulationsByJurisdiction: new Map(),
  feesByCategoryContext: new Map(),
  interventionsByTrigger: new Map(),
};

function buildApp() {
  const app = new Hono<{
    Bindings: Record<string, unknown>;
    Variables: { userId?: string; anonUserId?: string };
  }>();
  app.post("/passive-scan", (c) => handlePassiveScan(c as never, registry));
  return app;
}

// Hono app.request accepts a third `env` argument that becomes c.env at runtime.
async function post(app: ReturnType<typeof buildApp>, body: unknown, env: Record<string, unknown> = {}) {
  return app.request(
    "/passive-scan",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("POST /passive-scan — integration", () => {
  const marriott = {
    host: "marriott.com",
    pageType: "checkout",
    url: "https://www.marriott.com/booking/confirm",
    hits: [
      {
        packSlug: "dark-pattern/hidden-costs",
        brignullId: "hidden-costs",
        severity: "deceptive",
        excerpt: "Destination Amenity Fee $49/night · Subtotal $249 · Total $298",
      },
    ],
  };

  it("rejects invalid body with 400", async () => {
    const app = buildApp();
    const res = await post(app, { host: "x", hits: [] }); // empty hits → fail
    expect(res.status).toBe(400);
  });

  it("returns heuristic-only when ANTHROPIC_API_KEY is unset", async () => {
    const app = buildApp();
    const res = await post(app, marriott, {}); // no key
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      confirmed: Array<{ verdict: string }>;
      ran: string;
      runId: string;
    };
    expect(body.ran).toBe("heuristic-only");
    expect(body.confirmed[0]!.verdict).toBe("uncertain");
    expect(body.runId).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/); // Crockford base32
  });

  it("always attaches a ULID runId + latency + ran marker", async () => {
    const app = buildApp();
    const res = await post(app, marriott, {});
    const body = (await res.json()) as {
      runId: string;
      latencyMs: number;
      ran: "opus" | "heuristic-only";
      confirmed: Array<{ verdict: string }>;
      dismissed: unknown[];
    };
    expect(body.runId.length).toBeGreaterThan(10);
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(["opus", "heuristic-only"]).toContain(body.ran);
    expect(Array.isArray(body.confirmed)).toBe(true);
    expect(Array.isArray(body.dismissed)).toBe(true);
  });

  it("accepts a request with multiple hits up to the cap", async () => {
    const many = {
      ...marriott,
      hits: Array.from({ length: 10 }, (_, i) => ({
        packSlug: "dark-pattern/hidden-costs",
        brignullId: `hit-${i}`,
        severity: "deceptive" as const,
        excerpt: `Fee line ${i}: $${10 + i}`,
      })),
    };
    const app = buildApp();
    const res = await post(app, many, {});
    expect(res.status).toBe(200);
  });

  it("rejects > 20 hits per request", async () => {
    const hits = Array.from({ length: 21 }, (_, i) => ({
      packSlug: "dark-pattern/hidden-costs",
      brignullId: `h${i}`,
      severity: "deceptive" as const,
      excerpt: "x",
    }));
    const app = buildApp();
    const res = await post(app, { ...marriott, hits }, {});
    expect(res.status).toBe(400);
  });
});
