// S4-W23 — orchestrator: enrich → rules → rollup.

import { enrichFromName } from "./profiles.js";
import { runAllRules } from "./rules.js";
import type {
  CompatCheckResponse,
  CompatItem,
  CompatRequest,
  OverallVerdict,
  RuleResult,
} from "./types.js";

export function checkCompat(req: CompatRequest): CompatCheckResponse {
  const target = enrichFromName(req.target);
  const equipment = req.equipment.map(enrichFromName);

  const rules = runAllRules(target, equipment);
  const overall = rollup(rules);
  const rationale = explainOverall(overall, rules, target, equipment);
  const missingSpecs = detectMissingSpecs(rules, target, equipment);

  return {
    overall,
    rationale,
    rules,
    missingSpecs,
    generatedAt: new Date().toISOString(),
  };
}

function rollup(rules: RuleResult[]): OverallVerdict {
  if (rules.length === 0) return "no-rule-matched";
  const hasBlockerFail = rules.some((r) => r.verdict === "fail" && r.severity === "blocker");
  if (hasBlockerFail) return "incompatible";
  const hasFailOrWarn = rules.some((r) => r.verdict === "fail" || r.verdict === "warn");
  if (hasFailOrWarn) return "partial";
  const hasPass = rules.some((r) => r.verdict === "pass");
  if (hasPass) return "compatible";
  return "no-rule-matched";
}

function explainOverall(
  overall: OverallVerdict,
  rules: RuleResult[],
  target: CompatItem,
  equipment: CompatItem[],
): string {
  const tName = target.name ?? target.category;
  const eqCount = equipment.length;
  if (overall === "no-rule-matched") {
    return `Lens has no compatibility rule covering "${tName}" against ${eqCount === 1 ? "this equipment item" : `these ${eqCount} equipment items`}. The rule library is opinionated and incomplete — this is NOT a guarantee of compatibility.`;
  }
  const blockers = rules.filter((r) => r.verdict === "fail" && r.severity === "blocker");
  const warns = rules.filter((r) => r.verdict === "warn" || (r.verdict === "fail" && r.severity === "info"));
  const passes = rules.filter((r) => r.verdict === "pass");
  const lines: string[] = [];
  if (overall === "incompatible") {
    lines.push(
      `Incompatible — ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} identified.`,
    );
  } else if (overall === "partial") {
    lines.push(`Partial match — ${warns.length} issue${warns.length === 1 ? "" : "s"} to check before purchase.`);
  } else if (overall === "compatible") {
    lines.push(`Compatible — ${passes.length} supporting rule${passes.length === 1 ? "" : "s"} matched.`);
  }
  return lines.join(" ");
}

function detectMissingSpecs(rules: RuleResult[], target: CompatItem, equipment: CompatItem[]): string[] {
  const missing = new Set<string>();
  // Heuristic: when no rule fired at all, emit common-needed specs hints.
  if (rules.length === 0) {
    if (target.category === "ssd") missing.add("target.specs.formFactor");
    if (target.category === "charger") missing.add("target.specs.watts");
    if (target.category === "hdmi-cable") missing.add("target.specs.hdmi");
    for (const eq of equipment) {
      if (eq.category === "laptops" && !eq.specs?.storage) missing.add("equipment.specs.storage");
      if (eq.category === "laptops" && !eq.specs?.chargingW) missing.add("equipment.specs.chargingW");
      if (eq.category === "phones" && !eq.specs?.charging) missing.add("equipment.specs.charging");
    }
  }
  return [...missing];
}
