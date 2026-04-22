import type { CategoryPack, DarkPatternPack, RegulationPack, FeePack } from "@lens/shared";

/**
 * Compose pack contributions into prompt fragments.
 *
 * Each stage in the audit pipeline calls one of the helpers below to get the
 * pack-specific instructions to splice into its system prompt. The prompter
 * enforces per-fragment length caps so a heavy pack doesn't blow the context
 * window.
 */

const CAP_CRITERIA = 2000;
const CAP_CONFAB = 2500;
const CAP_NORMALIZATION = 1500;
const CAP_DARK_PATTERNS = 3000;
const CAP_REGULATIONS = 2500;
const CAP_FEES = 2000;

function truncate(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return s.slice(0, cap - 30) + "\n...[truncated for token budget]";
}

/**
 * Fragment 1 — criteria template.
 * Injected into EXTRACT when a category pack is selected, so preference
 * elicitation starts from the known set of criteria instead of re-deriving from scratch.
 */
export function categoryCriteriaPrompt(pack: CategoryPack): string {
  const lines = [`CATEGORY CRITERIA TEMPLATE for "${pack.name}" (${pack.slug} v${pack.version}):`];
  for (const c of pack.body.criteria) {
    const range = c.typicalRange ? ` range=${JSON.stringify(c.typicalRange)}` : "";
    const target = c.target !== undefined ? ` target=${JSON.stringify(c.target)}` : "";
    const notes = c.notes ? ` — ${c.notes}` : "";
    lines.push(`- ${c.name} [${c.unit}, ${c.direction}${range}${target}]${notes}`);
  }
  lines.push(
    `\nUse this template as a starting point when parsing user preferences. Keep criterion names consistent with the template so downstream ranking can apply specNormalization.`,
  );
  return truncate(lines.join("\n"), CAP_CRITERIA);
}

/**
 * Fragment 2 — confabulation patterns.
 * Injected into VERIFY so the claim-checker has category-specific red flags.
 */
export function categoryConfabulationsPrompt(pack: CategoryPack): string {
  if (pack.body.confabulationPatterns.length === 0) return "";
  const lines = [
    `KNOWN CONFABULATION PATTERNS for "${pack.name}" (${pack.slug} v${pack.version}):`,
    "When a product page or AI recommendation contains any of the patterns below, raise the corresponding verdict and cite the reality.",
  ];
  for (const p of pack.body.confabulationPatterns) {
    lines.push(
      `- Pattern: "${p.pattern}"\n  Reality: ${p.reality}\n  Default verdict: ${p.verdict}\n  Check: ${p.checkPrompt}`,
    );
  }
  return truncate(lines.join("\n"), CAP_CONFAB);
}

/**
 * Fragment 3 — spec normalization rules.
 * Injected into SEARCH so the product-research agent parses specs consistently.
 */
export function categoryNormalizationPrompt(pack: CategoryPack): string {
  const entries = Object.entries(pack.body.specNormalization);
  if (entries.length === 0) return "";
  const lines = [`SPEC NORMALIZATION RULES for "${pack.name}":`];
  for (const [field, rule] of entries) {
    const map = rule.unitMap ? ` unit-map=${JSON.stringify(rule.unitMap)}` : rule.unit ? ` unit=${rule.unit}` : "";
    lines.push(`- ${field}: regex /${rule.regex}/${map}`);
  }
  lines.push(`\nNormalize cited spec values into the units above before ranking.`);
  return truncate(lines.join("\n"), CAP_NORMALIZATION);
}

/**
 * Fragment 4 — dark pattern detection rules for a page.
 * Injected into audit flows that consume a page URL / screenshot.
 */
export function darkPatternsPrompt(packs: DarkPatternPack[]): string {
  if (packs.length === 0) return "";
  const lines = ["DARK PATTERNS TO CHECK (Brignull canonical taxonomy + FTC 2022 report):"];
  for (const p of packs) {
    lines.push(
      `- slug=${p.slug} — ${p.body.canonicalName} (severity=${p.body.severity}): ${p.body.description} Detection: ${p.body.llmVerifyPrompt}`,
    );
  }
  return truncate(lines.join("\n"), CAP_DARK_PATTERNS);
}

/**
 * Fragment 5 — regulations applicable to a jurisdiction + category.
 * Injected into verdict drafting so Lens can cite specific rules when flagging.
 */
export function regulationsPrompt(packs: RegulationPack[]): string {
  if (packs.length === 0) return "";
  const lines = [`APPLICABLE REGULATIONS (in-force only; vacated rules excluded):`];
  for (const r of packs) {
    const dates = r.body.vacatedDate
      ? ` (vacated ${r.body.vacatedDate} by ${r.body.vacatedBy})`
      : ` (effective ${r.body.effectiveDate})`;
    lines.push(
      `- slug=${r.slug} — ${r.body.officialName} (${r.body.citation})${dates}\n  Scope: ${r.body.scopeSummary}\n  User rights: ${r.body.userRightsPlainLanguage}`,
    );
  }
  return truncate(lines.join("\n"), CAP_REGULATIONS);
}

/**
 * Fragment 6 — fee taxonomy applicable to a category.
 * Used by the hidden-cost / total-price workflows.
 */
export function feesPrompt(packs: FeePack[]): string {
  if (packs.length === 0) return "";
  const lines = [`FEE TAXONOMY (watch for these in cart/checkout):`];
  for (const f of packs) {
    lines.push(
      `- ${f.body.canonicalName}: ${f.body.description}\n  Signals: ${f.body.identificationSignals.map((s) => s.patterns?.join("/") ?? s.kind).join("; ")}`,
    );
  }
  return truncate(lines.join("\n"), CAP_FEES);
}
