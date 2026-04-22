// S4-W25 — Opus 4.7 prompt composition for privacy-policy extraction.
// Deterministic strings so unit tests can assert the exact surface.

export function buildSystemPrompt(): string {
  return [
    "You are Lens, the consumer's independent agent. Extract a machine-readable audit from the privacy-policy text below.",
    "",
    'OUTPUT CONTRACT: respond with a single JSON object (no markdown fences, no prose outside the JSON). The shape MUST be:',
    `{
  "dataCollected": [{"category": "identity|location|device|biometric|health|financial|behavioral|other", "types": ["email", "gps-coordinates", ...], "purpose": "<one sentence>"}],
  "sharedWithThirdParties": [{"partyCategory": "advertising|analytics|affiliate|service-providers|data-brokers|law-enforcement|other", "purpose": "<one sentence>"}],
  "retention": {"declared": true|false, "period": "<e.g. '30 days' or 'until account deletion' or null>"},
  "deletion": {"available": true|false, "mechanism": "in-app-setting|contact-support|web-form|no-mechanism|null"},
  "consentDarkPatterns": [{"pattern": "<short id>", "severity": "warn|blocker", "evidence": "<≤120-char snippet>"}],
  "regulatoryFrameworks": ["GDPR", "CCPA", ...]
}`,
    "",
    "Rules:",
    "- Every field must be present (empty arrays and null are fine).",
    "- Do NOT paraphrase the policy into legal language — just enumerate the extracted structure.",
    "- Flag a consent dark pattern only when the policy explicitly shows the pattern in text (e.g. 'by continuing, you agree' for forced-consent-by-continuing).",
    "- Respect the user's choice NOT to read the policy themselves — be faithful to what's written, not what vendors usually do.",
  ].join("\n");
}

export function buildUserMessage(opts: {
  url: string;
  policyText: string;
  productName?: string;
  vendor?: string;
}): string {
  const lines: string[] = [];
  lines.push(`URL: ${opts.url}`);
  if (opts.vendor) lines.push(`VENDOR: ${opts.vendor}`);
  if (opts.productName) lines.push(`PRODUCT: ${opts.productName}`);
  lines.push("");
  lines.push("POLICY TEXT (may be truncated):");
  lines.push(opts.policyText.slice(0, 12_000));
  lines.push("");
  lines.push("Return the JSON object per the OUTPUT CONTRACT.");
  return lines.join("\n");
}
