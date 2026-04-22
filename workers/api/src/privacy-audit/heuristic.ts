// S4-W25 — heuristic privacy-policy scanner.
// No LLM. Regex over normalized policy text. Used when ANTHROPIC_API_KEY
// absent or when Opus fails. Deliberately conservative — we surface what
// we can detect, not what we can interpret.

import type { DarkPatternEntry, DataCollectedEntry, PrivacyAudit, SharedWithEntry } from "./types.js";

/**
 * Data-type keyword table keyed by broad category. Keeps heuristics honest:
 * we only claim a category is collected when a specific keyword lands.
 */
const DATA_TYPE_RULES: Array<{ category: string; type: string; re: RegExp }> = [
  { category: "identity", type: "email", re: /\b(email\s+address|your\s+email)\b/i },
  { category: "identity", type: "name", re: /\b(full\s+name|first\s+and\s+last\s+name|your\s+name)\b/i },
  { category: "identity", type: "phone", re: /\bphone\s+number\b/i },
  { category: "identity", type: "mailing-address", re: /\b(mailing|shipping|billing)\s+address\b/i },
  { category: "location", type: "gps-coordinates", re: /\b(gps\s+coordinates|precise\s+location|latitude\s+and\s+longitude)\b/i },
  { category: "location", type: "ip-address", re: /\bip\s+address(es)?\b/i },
  { category: "device", type: "device-id", re: /\bdevice\s+(id|identifier|fingerprint)\b/i },
  { category: "device", type: "cookies", re: /\bcookies?\b/i },
  { category: "biometric", type: "biometric-data", re: /\bbiometric\b/i },
  { category: "biometric", type: "facial-recognition", re: /\bfacial\s+recognition\b/i },
  { category: "health", type: "health-data", re: /\b(health\s+data|medical\s+information|fitness\s+data)\b/i },
  { category: "financial", type: "payment-card", re: /\b(payment\s+card|credit\s+card|debit\s+card|card\s+number)\b/i },
  { category: "financial", type: "bank-account", re: /\bbank\s+account\b/i },
  { category: "behavioral", type: "browsing-history", re: /\bbrowsing\s+(history|behavior|activity)\b/i },
  { category: "behavioral", type: "purchase-history", re: /\bpurchase\s+history\b/i },
];

const SHARED_WITH_PATTERNS: Array<{ partyCategory: string; re: RegExp }> = [
  { partyCategory: "advertising", re: /\b(advertising|ad\s+network|marketing)\s+(partners?|providers?|services?|platforms?)\b/i },
  { partyCategory: "analytics", re: /\banalytics\s+(partners?|providers?|services?|companies)\b/i },
  { partyCategory: "affiliate", re: /\baffiliate\s+(partners?|networks?|programs?)\b/i },
  { partyCategory: "service-providers", re: /\b(service\s+providers?|cloud\s+providers?|hosting\s+providers?)\b/i },
  { partyCategory: "data-brokers", re: /\bdata\s+brokers?\b/i },
  { partyCategory: "law-enforcement", re: /\b(law\s+enforcement|legal\s+authorities|government\s+agencies)\b/i },
];

const REGULATORY_FRAMEWORKS: Array<[string, RegExp]> = [
  ["GDPR", /\b(gdpr|general\s+data\s+protection\s+regulation)\b/i],
  ["CCPA", /\b(ccpa|california\s+consumer\s+privacy\s+act)\b/i],
  ["CPRA", /\b(cpra|california\s+privacy\s+rights\s+act)\b/i],
  ["COPPA", /\b(coppa|children'?s?\s+online\s+privacy)\b/i],
  ["PIPEDA", /\bpipeda\b/i],
  ["LGPD", /\blgpd\b/i],
  ["HIPAA", /\bhipaa\b/i],
  ["VCDPA", /\b(vcdpa|virginia\s+consumer\s+data\s+protection\s+act)\b/i],
];

const DARK_PATTERN_RULES: Array<{ pattern: string; severity: "warn" | "blocker"; re: RegExp }> = [
  { pattern: "forced-consent-by-continuing", severity: "blocker", re: /\bby\s+continuing(\s+to\s+use)?\s+(?:this\s+)?(?:site|service|app)[\s,]+you\s+(?:agree|consent)/i },
  { pattern: "preselected-opt-in", severity: "warn", re: /\bauto[- ]?selected\s+for\s+your\s+convenience\b/i },
  { pattern: "bundled-consent", severity: "warn", re: /\bagree\s+to\s+all\b|\baccept\s+all\b/i },
  { pattern: "opt-out-requires-contact", severity: "blocker", re: /\bto\s+opt[- ]?out[,\s]+(?:please\s+)?(?:contact|email|call)\b/i },
  { pattern: "indefinite-retention", severity: "warn", re: /\bretain(?:ed|s|ing)?\b[\w\s]{0,30}?(?:for|until)\s+(?:as\s+long\s+as\s+necessary|an?\s+indefinite|the\s+foreseeable\s+future)\b/i },
  { pattern: "non-specific-sharing", severity: "warn", re: /\bshare\s+(?:your\s+)?(?:data|information)\s+with\s+(?:our\s+)?trusted\s+partners\b/i },
];

function extractRetention(text: string): PrivacyAudit["retention"] {
  // Accept bare "retain" plus its conjugations; also "keep data" / "storage period".
  const declared = /\bretain(?:ed|s|ing|tion)?\b|\bkeep\s+(?:your\s+)?data\b|\bstorage\s+period\b/i.test(text);
  if (!declared) return { declared: false, period: null };

  // Allow optional words (e.g. "your data") between the verb and the
  // "for"/"until" preposition.
  const period = text.match(
    /\bretain(?:ed|s|ing)?\b[\w\s]{0,30}?(?:for|until)\s+([^.,;]{5,80})/i,
  )?.[1]?.trim() ?? null;
  return { declared: true, period };
}

function extractDeletion(text: string): PrivacyAudit["deletion"] {
  const available =
    /\bright\s+to\s+(?:delete|deletion|erasure)\b/i.test(text) ||
    /\brequest\s+(?:the\s+)?deletion\b/i.test(text) ||
    /\bdelete\s+(?:your\s+)?(?:account|data|personal\s+information)\b/i.test(text);
  if (!available) return { available: false, mechanism: null };
  let mechanism: string | null = null;
  if (/\bin[- ]?app\s+setting\b|\baccount\s+settings\b|\bprivacy\s+dashboard\b/i.test(text)) {
    mechanism = "in-app-setting";
  } else if (/\bcontact\s+(?:support|us|our)|email\s+us\s+at|submit\s+a\s+request/i.test(text)) {
    mechanism = "contact-support";
  } else if (/\bweb\s+form\b|\bprivacy\s+request\s+form\b/i.test(text)) {
    mechanism = "web-form";
  }
  return { available: true, mechanism };
}

export function runHeuristicAudit(text: string): PrivacyAudit {
  const dataCollected: DataCollectedEntry[] = [];
  const seenType = new Set<string>();
  for (const rule of DATA_TYPE_RULES) {
    if (!rule.re.test(text)) continue;
    const key = `${rule.category}:${rule.type}`;
    if (seenType.has(key)) continue;
    seenType.add(key);
    const existing = dataCollected.find((d) => d.category === rule.category);
    if (existing) {
      if (!existing.types.includes(rule.type)) existing.types.push(rule.type);
    } else {
      dataCollected.push({
        category: rule.category,
        types: [rule.type],
        purpose: "(purpose not stated in heuristic scan)",
      });
    }
  }

  const sharedWithThirdParties: SharedWithEntry[] = [];
  const seenParty = new Set<string>();
  for (const rule of SHARED_WITH_PATTERNS) {
    if (!rule.re.test(text)) continue;
    if (seenParty.has(rule.partyCategory)) continue;
    seenParty.add(rule.partyCategory);
    sharedWithThirdParties.push({
      partyCategory: rule.partyCategory,
      purpose: "(purpose not stated in heuristic scan)",
    });
  }

  const regulatoryFrameworks: string[] = [];
  for (const [label, re] of REGULATORY_FRAMEWORKS) {
    if (re.test(text)) regulatoryFrameworks.push(label);
  }

  const consentDarkPatterns: DarkPatternEntry[] = [];
  for (const rule of DARK_PATTERN_RULES) {
    const m = text.match(rule.re);
    if (!m) continue;
    const idx = m.index ?? 0;
    const before = Math.max(0, idx - 20);
    const after = Math.min(text.length, idx + m[0].length + 20);
    consentDarkPatterns.push({
      pattern: rule.pattern,
      severity: rule.severity,
      evidence: text.slice(before, after).replace(/\s+/g, " ").trim().slice(0, 120),
    });
  }

  return {
    dataCollected,
    sharedWithThirdParties,
    retention: extractRetention(text),
    deletion: extractDeletion(text),
    consentDarkPatterns,
    regulatoryFrameworks,
  };
}
