// S3-W19 — disclosure-phrase detector.

import type { DisclosureKind, DisclosureMatch } from "./types.js";

interface Rule {
  kind: DisclosureKind;
  re: RegExp;
  label: string;
}

const RULES: Rule[] = [
  // FTC-affiliate family
  { kind: "ftc-affiliate", label: "as an Amazon Associate", re: /\bas\s+an?\s+amazon\s+associate\b/i },
  { kind: "ftc-affiliate", label: "affiliate links", re: /\b(?:this\s+page\s+contains\s+)?affiliate\s+links?\b/i },
  { kind: "ftc-affiliate", label: "we may earn a commission", re: /\bwe\s+may\s+earn\s+(?:a\s+)?commission\b/i },
  { kind: "ftc-affiliate", label: "commission from qualifying purchases", re: /\bcommission\s+from\s+qualifying\s+purchases\b/i },
  // Sponsored-post
  { kind: "sponsored-post", label: "sponsored by", re: /\bsponsored\s+by\b/i },
  { kind: "sponsored-post", label: "sponsored post/content", re: /\bsponsored\s+(?:post|content|article|video)\b/i },
  { kind: "sponsored-post", label: "#sponsored", re: /#sponsored\b/i },
  // Paid-partnership
  { kind: "paid-partnership", label: "paid partnership", re: /\bpaid\s+partnership\b/i },
  { kind: "paid-partnership", label: "#ad / #paidad", re: /#(?:ad|paidad)\b/i },
  { kind: "paid-partnership", label: "paid promotion", re: /\bpaid\s+promotion\b/i },
  // In-partnership-with
  { kind: "in-partnership-with", label: "in partnership with", re: /\bin\s+partnership\s+with\b/i },
  { kind: "in-partnership-with", label: "partnered with", re: /\bpartnered\s+with\b/i },
];

/**
 * Scan text for disclosure phrases. Returns at most one match per (kind,
 * label) pair. Each match carries a short snippet around the hit for UI
 * attribution.
 */
export function detectDisclosures(text: string): DisclosureMatch[] {
  if (!text) return [];
  const out: DisclosureMatch[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const key = `${rule.kind}:${rule.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = m.index ?? 0;
    const before = Math.max(0, idx - 30);
    const after = Math.min(text.length, idx + m[0].length + 30);
    out.push({
      kind: rule.kind,
      detail: rule.label,
      snippet: text.slice(before, after).replace(/\s+/g, " ").trim().slice(0, 120),
    });
  }
  return out;
}
