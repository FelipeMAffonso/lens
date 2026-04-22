// S4-W22 — Stage-2 LLM verification.
//
// Pure-ish layer: parses a JSON response from Opus 4.7, joins it against
// the pack registry to attach citations + interventions, and emits a
// ConfirmedHit[] + DismissedHit[] pair. Keeps the Opus call behind an
// interface so unit tests can mock it.

import type {
  DarkPatternPack,
  RegulationPack,
  InterventionPack,
  PackRegistry,
  Pack,
} from "@lens/shared";
import type {
  ConfirmedHit,
  DismissedHit,
  FeeBreakdown,
  Hit,
  InterventionSuggestion,
  PassiveScanRequest,
  RegulatoryCitation,
} from "./types.js";
import { buildSystemPrompt, buildUserMessage, selectPacksForHits } from "./prompt.js";

interface RawVerdict {
  packSlug: string;
  verdict: "confirmed" | "uncertain" | "dismissed";
  explanation: string;
  regulationSlug: string | null;
  interventionSlugs: string[];
  feeBreakdown: FeeBreakdown | null;
}

export interface OpusClient {
  call: (opts: { system: string; user: string; maxOutputTokens?: number }) => Promise<string>;
}

/**
 * Parse a JSON response from Opus into RawVerdict[]. Robust to:
 *  - markdown-fenced JSON (```json ... ```)
 *  - leading/trailing prose
 *  - missing fields (defaults applied)
 */
export function parseVerdicts(text: string): RawVerdict[] {
  // Extract the first {...} object. Opus is instructed to return bare JSON
  // but we defend against markdown fences or extra whitespace.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : text.trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("verify: no JSON object found in Opus response");
  }
  const json = candidate.slice(firstBrace, lastBrace + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`verify: malformed JSON: ${(err as Error).message}`);
  }
  const root = parsed as { verdicts?: unknown };
  if (!root || !Array.isArray(root.verdicts)) {
    throw new Error("verify: missing verdicts[] array");
  }
  const out: RawVerdict[] = [];
  for (const v of root.verdicts) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const packSlug = typeof r.packSlug === "string" ? r.packSlug : "";
    const verdict =
      r.verdict === "confirmed" || r.verdict === "uncertain" || r.verdict === "dismissed"
        ? r.verdict
        : "uncertain";
    const explanation = typeof r.explanation === "string" ? r.explanation : "";
    const regulationSlug = typeof r.regulationSlug === "string" ? r.regulationSlug : null;
    const interventionSlugs = Array.isArray(r.interventionSlugs)
      ? r.interventionSlugs.filter((s): s is string => typeof s === "string")
      : [];
    const feeBreakdown = coerceFeeBreakdown(r.feeBreakdown);
    if (!packSlug) continue;
    out.push({ packSlug, verdict, explanation, regulationSlug, interventionSlugs, feeBreakdown });
  }
  return out;
}

function coerceFeeBreakdown(v: unknown): FeeBreakdown | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label : null;
  if (!label) return null;
  const amountUsd =
    typeof r.amountUsd === "number" && Number.isFinite(r.amountUsd) ? r.amountUsd : undefined;
  const allowedFreq: Array<NonNullable<FeeBreakdown["frequency"]>> = [
    "one-time",
    "per-night",
    "per-month",
    "per-year",
    "per-transaction",
  ];
  const freq = typeof r.frequency === "string" && (allowedFreq as string[]).includes(r.frequency)
    ? (r.frequency as NonNullable<FeeBreakdown["frequency"]>)
    : undefined;
  const out: FeeBreakdown = { label };
  if (amountUsd !== undefined) out.amountUsd = amountUsd;
  if (freq !== undefined) out.frequency = freq;
  return out;
}

/**
 * Project raw LLM verdicts into the external contract: enrich with
 * regulation + intervention pack data from the registry; drop any slug
 * the LLM fabricated that isn't in the registry.
 */
export function projectVerdicts(
  hits: Hit[],
  raws: RawVerdict[],
  registry: PackRegistry,
): { confirmed: ConfirmedHit[]; dismissed: DismissedHit[] } {
  const byPackSlug = new Map(raws.map((r) => [r.packSlug, r]));
  const confirmed: ConfirmedHit[] = [];
  const dismissed: DismissedHit[] = [];
  for (const hit of hits) {
    const raw = byPackSlug.get(hit.packSlug);
    if (!raw) {
      // LLM didn't return a verdict for this hit — treat as uncertain.
      confirmed.push({
        packSlug: hit.packSlug,
        brignullId: hit.brignullId,
        verdict: "uncertain",
        llmExplanation: "No Stage-2 verdict returned by verifier.",
        suggestedInterventions: [],
      });
      continue;
    }
    if (raw.verdict === "dismissed") {
      dismissed.push({ packSlug: hit.packSlug, reason: raw.explanation || "Dismissed by Stage 2." });
      continue;
    }
    const c: ConfirmedHit = {
      packSlug: hit.packSlug,
      brignullId: hit.brignullId,
      verdict: raw.verdict,
      llmExplanation: raw.explanation,
      suggestedInterventions: lookupInterventions(registry, raw.interventionSlugs),
    };
    const citation = raw.regulationSlug
      ? lookupRegulation(registry, raw.regulationSlug)
      : undefined;
    if (citation) c.regulatoryCitation = citation;
    if (raw.feeBreakdown) c.feeBreakdown = raw.feeBreakdown;
    confirmed.push(c);
  }
  return { confirmed, dismissed };
}

function lookupRegulation(registry: PackRegistry, slug: string): RegulatoryCitation | undefined {
  const pack = registry.bySlug.get(slug) as Pack | undefined;
  if (!pack || pack.type !== "regulation") return undefined;
  const reg = pack as RegulationPack;
  return {
    packSlug: reg.slug,
    officialName: reg.body.officialName,
    citation: reg.body.citation,
    status: reg.body.status,
    effectiveDate: reg.body.effectiveDate,
    userRightsPlainLanguage: reg.body.userRightsPlainLanguage,
  };
}

function lookupInterventions(registry: PackRegistry, slugs: string[]): InterventionSuggestion[] {
  const out: InterventionSuggestion[] = [];
  for (const slug of slugs) {
    const pack = registry.bySlug.get(slug) as Pack | undefined;
    if (!pack || pack.type !== "intervention") continue;
    const iv = pack as InterventionPack;
    out.push({
      packSlug: iv.slug,
      canonicalName: iv.body.canonicalName,
      consentTier: iv.body.consentTier,
    });
  }
  return out;
}

/**
 * Top-level: build prompt, call Opus, parse, project. Handles the Opus error
 * path by returning uncertain verdicts without a regulation citation.
 */
export async function verifyHits(
  req: PassiveScanRequest,
  registry: PackRegistry,
  opus: OpusClient | null,
): Promise<{
  confirmed: ConfirmedHit[];
  dismissed: DismissedHit[];
  ran: "opus" | "heuristic-only";
}> {
  // Fail-open: no opus client means no Stage-2 — return uncertain heuristics.
  if (!opus) return heuristicOnly(req.hits);

  const { darkPatternPacks, regulationSlugs, interventionSlugs } = selectPacksForHits(
    req.hits,
    registry,
  );

  const regulationPacks = [...regulationSlugs]
    .map((s) => registry.bySlug.get(s) as Pack | undefined)
    .filter((p): p is RegulationPack => p?.type === "regulation");
  const interventionPacks = [...interventionSlugs]
    .map((s) => registry.bySlug.get(s) as Pack | undefined)
    .filter((p): p is InterventionPack => p?.type === "intervention");

  const system = buildSystemPrompt(darkPatternPacks, regulationPacks, interventionPacks);
  const user = buildUserMessage(req);

  let text: string;
  try {
    text = await opus.call({ system, user, maxOutputTokens: 2048 });
  } catch (err) {
    console.error("[passive-scan] opus error:", (err as Error).message);
    return heuristicOnly(req.hits);
  }

  let raws: RawVerdict[];
  try {
    raws = parseVerdicts(text);
  } catch (err) {
    console.error("[passive-scan] parse error:", (err as Error).message);
    return heuristicOnly(req.hits);
  }

  const { confirmed, dismissed } = projectVerdicts(req.hits, raws, registry);
  return { confirmed, dismissed, ran: "opus" };
}

function heuristicOnly(hits: Hit[]): {
  confirmed: ConfirmedHit[];
  dismissed: DismissedHit[];
  ran: "heuristic-only";
} {
  return {
    confirmed: hits.map((h) => ({
      packSlug: h.packSlug,
      brignullId: h.brignullId,
      verdict: "uncertain" as const,
      llmExplanation:
        "Stage-2 verification unavailable (missing credentials or model error). Heuristic match only.",
      suggestedInterventions: [],
    })),
    dismissed: [],
    ran: "heuristic-only",
  };
}
