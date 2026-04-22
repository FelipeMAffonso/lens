// TypeScript types for Knowledge Packs. Matches packs/SCHEMA.md.

export type PackType = "category" | "dark-pattern" | "regulation" | "fee" | "intervention";
export type PackStatus = "draft" | "reviewed" | "published" | "deprecated" | "retired";

export interface PackAuthor {
  name: string;
  affiliation?: string;
}

export interface PackEvidence {
  ref: string;
  claim: string;
  sourceUrl: string;
  retrieved: string;
  primary: boolean;
}

export interface PackEnvelope<T extends PackType, A, B> {
  slug: string;
  type: T;
  version: string;
  name: string;
  summary: string;
  status: PackStatus;
  authors: PackAuthor[];
  reviewers: PackAuthor[];
  lastVerified: string;
  retirementDate: string | null;
  retirementReason: string | null;
  evidence: PackEvidence[];
  applicability: A;
  body: B;
}

/* ------------------------------------------------------------------- Category */

export interface CategoryApplicability {
  categoryAliases: string[];
  productTags: string[];
}

export interface CategoryCriterion {
  name: string;
  unit: string;
  direction: "higher_is_better" | "lower_is_better" | "target" | "binary";
  typicalRange?: (number | string)[];
  target?: number | string | boolean;
  notes?: string;
}

export interface SpecNormalizationRule {
  regex: string;
  unit?: string;
  unitMap?: Record<string, number>;
}

export interface ConfabulationPattern {
  pattern: string;
  reality: string;
  verdict: "true" | "false" | "misleading" | "unverifiable";
  checkPrompt: string;
}

export interface HiddenCost {
  name: string;
  annualCostUsd: [number, number];
  frequency: string;
}

export interface CategoryBody {
  criteria: CategoryCriterion[];
  specNormalization: Record<string, SpecNormalizationRule>;
  confabulationPatterns: ConfabulationPattern[];
  counterfeitSignals: { signal: string; action: string }[];
  compatibilityQuestions: string[];
  typicalHiddenCosts: HiddenCost[];
  regulatoryLinks: string[];
  repairability?: {
    ifixitCategoryId: string | null;
    typicalPartsAvailability: string;
    notes?: string;
  };
}

export type CategoryPack = PackEnvelope<"category", CategoryApplicability, CategoryBody>;

/* ---------------------------------------------------------------- Dark Pattern */

export interface DarkPatternApplicability {
  pageTypes: string[];
  urlPatterns?: string[];
}

export interface DetectionHeuristic {
  kind: string;
  selector?: string;
  patterns?: string[];
  caseSensitive?: boolean;
  trigger?: string;
  description?: string;
  location?: string;
  context?: string;
  secondaryRequired?: string[];
}

export interface DarkPatternBody {
  canonicalName: string;
  brignullId: string;
  description: string;
  severity: "nuisance" | "manipulative" | "deceptive" | "illegal-in-jurisdiction";
  illegalInJurisdictions: string[];
  detectionHeuristics: DetectionHeuristic[];
  llmVerifyPrompt: string;
  remediation: string;
  regulatoryLinks: string[];
  interventionLinks: string[];
}

export type DarkPatternPack = PackEnvelope<"dark-pattern", DarkPatternApplicability, DarkPatternBody>;

/* ----------------------------------------------------------------- Regulation */

export interface RegulationApplicability {
  jurisdiction: string;
  productCategories: string[];
  businessScope: {
    appliesTo?: string[];
    userResidency?: string;
    note?: string;
  };
}

export interface RegulationBody {
  officialName: string;
  citation: string;
  status: "in-force" | "delayed" | "vacated" | "superseded" | "preempted";
  effectiveDate: string;
  vacatedDate: string | null;
  vacatedBy: string | null;
  supersededBy: string | null;
  supersedes: string | null;
  scopeSummary: string;
  userRightsPlainLanguage: string;
  enforcementSignals: { action: string; url?: string; description?: string }[];
  evidenceRefs: string[];
}

export type RegulationPack = PackEnvelope<"regulation", RegulationApplicability, RegulationBody>;

/* ------------------------------------------------------------------------ Fee */

export interface FeeApplicability {
  categoryContext: string[];
  pageTypes: string[];
}

export interface FeeBody {
  canonicalName: string;
  description: string;
  typicalRange: { min: number; max: number | null; unit: string; frequency: string };
  identificationSignals: {
    kind: string;
    patterns?: string[];
    caseSensitive?: boolean;
    selector?: string;
  }[];
  disclosureLegality: {
    jurisdiction: string;
    regulationSlug: string | null;
    requirement: string;
  }[];
  negotiability: {
    waivableOnRequest: string;
    typicalSuccessRate: number;
    script: string | null;
  };
  interventionLinks: string[];
}

export type FeePack = PackEnvelope<"fee", FeeApplicability, FeeBody>;

/* ----------------------------------------------------------------- Intervention */

export interface InterventionApplicability {
  triggerTypes: string[];
}

export interface InterventionBody {
  canonicalName: string;
  description: string;
  executionType:
    | "surface-warn"
    | "refuse-redirect"
    | "draft-offer"
    | "automate-consent"
    | "escalate-regulator"
    | "community-flag";
  consentTier:
    | "implicit"
    | "explicit-one-time"
    | "explicit-durable"
    | "explicit-per-action"
    | "explicit-delegated-autonomous"
    | "explicit-data-contribution";
  prerequisites: { kind: string; description: string }[];
  template: Record<string, unknown>;
  successSignals: { kind: string; description?: string; within?: string }[];
  failureFallback: { nextIntervention: string } | null;
  regulatoryBasis: string[];
}

export type InterventionPack = PackEnvelope<"intervention", InterventionApplicability, InterventionBody>;

/* ---------------------------------------------------------------------- Union */

export type Pack = CategoryPack | DarkPatternPack | RegulationPack | FeePack | InterventionPack;

/* Typed registry (keyed by slug, values typed by kind) */
export interface PackRegistry {
  all: Pack[];
  bySlug: Map<string, Pack>;
  categoriesByAlias: Map<string, CategoryPack>;
  darkPatternsByPageType: Map<string, DarkPatternPack[]>;
  regulationsByJurisdiction: Map<string, RegulationPack[]>;
  feesByCategoryContext: Map<string, FeePack[]>;
  interventionsByTrigger: Map<string, InterventionPack[]>;
}
