// S4-W22 — Stage-2 prompt composition.
//
// Builds the Opus 4.7 system prompt + user message from a batch of hits.
// Keeps composition deterministic so unit tests can assert the exact string.

import type {
  DarkPatternPack,
  RegulationPack,
  InterventionPack,
  Pack,
  PackRegistry,
} from "@lens/shared";
import { darkPatternsPrompt, regulationsPrompt } from "../packs/prompter.js";
import type { Hit, PassiveScanRequest } from "./types.js";

/**
 * System prompt instructing Opus 4.7 to return per-hit verdicts in a strict
 * JSON shape that `verify.ts` parses back.
 */
export function buildSystemPrompt(
  darkPatternPacks: DarkPatternPack[],
  regulationPacks: RegulationPack[],
  interventionPacks: InterventionPack[],
): string {
  const sections: string[] = [];
  sections.push(
    "You are Lens, the consumer's independent agent. You are confirming or dismissing lightweight heuristic hits that fired on a user's active browsing session. Your only job here is Stage 2 verification.",
  );
  sections.push("");
  sections.push(darkPatternsPrompt(darkPatternPacks));
  sections.push("");
  sections.push(regulationsPrompt(regulationPacks));
  if (interventionPacks.length > 0) {
    sections.push("");
    sections.push(
      `AVAILABLE INTERVENTIONS (slug → description):\n${interventionPacks
        .map((i) => `- ${i.slug}: ${i.body.canonicalName} — ${i.body.description.slice(0, 140)}`)
        .join("\n")}`,
    );
  }
  sections.push("");
  sections.push(
    `OUTPUT CONTRACT: respond with a single JSON object (no markdown fences, no prose outside the JSON). The shape MUST be:
{
  "verdicts": [
    {
      "packSlug": "dark-pattern/<slug>",
      "verdict": "confirmed" | "uncertain" | "dismissed",
      "explanation": "1-2 sentences on why the excerpt confirms or dismisses the pattern",
      "regulationSlug": "regulation/<slug>" | null,
      "interventionSlugs": ["intervention/<slug>", ...],
      "feeBreakdown": { "label": "...", "amountUsd": number | null, "frequency": "one-time" | "per-night" | "per-month" | "per-year" | "per-transaction" | null } | null
    }
  ]
}

Rules:
- One verdict per input hit, keyed by packSlug.
- Only cite regulations whose slug is in the "APPLICABLE REGULATIONS" list above.
- Only suggest interventions whose slug is in the "AVAILABLE INTERVENTIONS" list above.
- "confirmed" = the excerpt clearly matches the pattern. "uncertain" = the excerpt is ambiguous or not enough context. "dismissed" = the excerpt does NOT match the pattern or the heuristic fired on unrelated content.
- For hidden-costs and drip-pricing hits, try to extract the fee name + amount into feeBreakdown.
- Never fabricate a regulation slug or intervention slug. If none apply, use null / empty array.`,
  );
  return sections.filter(Boolean).join("\n");
}

export function buildUserMessage(req: PassiveScanRequest): string {
  const lines: string[] = [];
  lines.push(`HOST: ${req.host}`);
  lines.push(`PAGE TYPE: ${req.pageType}`);
  lines.push(`JURISDICTION: ${req.jurisdiction ?? "us-federal"}`);
  if (req.url) lines.push(`URL: ${req.url}`);
  lines.push("");
  lines.push(`HEURISTIC HITS (Stage 1) — confirm or dismiss each:`);
  req.hits.forEach((h, i) => {
    lines.push("");
    lines.push(`[${i + 1}] packSlug: ${h.packSlug}`);
    lines.push(`    brignullId: ${h.brignullId}`);
    lines.push(`    severity: ${h.severity}`);
    lines.push(`    excerpt: "${truncate(h.excerpt, 200)}"`);
  });
  lines.push("");
  lines.push("Return a single JSON object per the OUTPUT CONTRACT.");
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 3) + "...";
}

/**
 * Given the request's hits, pick the subset of packs needed for the prompt.
 * Keeps the prompt narrowly scoped — if the extension only flagged
 * `hidden-costs`, we don't splice every dark-pattern pack into Opus.
 */
export function selectPacksForHits(
  hits: Hit[],
  registry: Pick<PackRegistry, "bySlug">,
): {
  darkPatternPacks: DarkPatternPack[];
  regulationSlugs: Set<string>;
  interventionSlugs: Set<string>;
} {
  const darkPatternPacks: DarkPatternPack[] = [];
  const regulationSlugs = new Set<string>();
  const interventionSlugs = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const h of hits) {
    if (seenSlugs.has(h.packSlug)) continue;
    seenSlugs.add(h.packSlug);
    const pack = registry.bySlug.get(h.packSlug) as Pack | undefined;
    if (!pack || pack.type !== "dark-pattern") continue;
    const dp = pack as DarkPatternPack;
    darkPatternPacks.push(dp);
    // Follow regulation + intervention links
    for (const r of dp.body.regulatoryLinks ?? []) regulationSlugs.add(r);
    for (const i of dp.body.interventionLinks ?? []) interventionSlugs.add(i);
  }
  return { darkPatternPacks, regulationSlugs, interventionSlugs };
}
