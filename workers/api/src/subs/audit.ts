// S6-W36 — pure subscription auditor.
// Turns a list of persisted SubscriptionRow rows into a dashboard-shaped
// audit: cadence-normalized totals, per-row flags with evidence, overall
// recommendation band. No network, no D1, no LLM.

import type { SubscriptionRow } from "./types.js";

export interface AuditOptions {
  /** Flagging horizon for "auto-renew-within-window". Default 30 days. */
  windowDays?: number;
  /** ISO timestamp treated as "now" — injectable for deterministic tests. */
  now?: string;
}

export type FlagSeverity = "info" | "warn" | "blocker";

export interface Flag {
  kind:
    | "auto-renew-within-7d"
    | "auto-renew-within-window"
    | "trial-ending"
    | "above-category-median"
    | "unknown-cadence"
    | "stale-no-renewal-info"
    | "recent-cancellation-detected";
  severity: FlagSeverity;
  evidence: string;
}

export interface Finding {
  subscriptionId: string;
  service: string;
  amount: number | null;
  currency: string;
  cadence: SubscriptionRow["cadence"];
  nextRenewalAt: string | null;
  active: boolean;
  detectedIntent: SubscriptionRow["detected_intent"];
  flags: Flag[];
  monthlyEquivalent: number | null;
  annualEquivalent: number | null;
  cancelDraftable: boolean;
}

export interface AuditSummary {
  totalActive: number;
  totalMonthlyCost: number;
  totalAnnualCost: number;
  upcomingRenewals: number;
  flaggedCount: number;
}

export interface Recommendation {
  band: "all-good" | "review" | "urgent";
  oneLiner: string;
}

export interface SubscriptionAudit {
  ok: true;
  generatedAt: string;
  summary: AuditSummary;
  findings: Finding[];
  recommendation: Recommendation;
}

/**
 * Category-median monthly prices (USD). Small, curated, cross-referenced
 * against the S0-W5 allowlist. Values are intentionally a bit conservative
 * so we only flag obvious outliers (1.5× the median).
 */
const CATEGORY_MEDIAN: Record<string, number> = {
  streaming: 10.99,
  music: 10.99,
  productivity: 15,
  news: 17,
  creative: 54.99,
  fitness: 12.99,
  food: 9.99,
  prime: 14.99,
};

/**
 * Service → category mapping. Keys are lowercase; match is substring on the
 * classified service name so "Spotify Premium" maps to "music" via "spotify".
 */
const SERVICE_CATEGORY: Array<[RegExp, keyof typeof CATEGORY_MEDIAN]> = [
  [/\b(netflix|hulu|prime\s+video|max\b|disney\+?|paramount\+?|apple\s+tv)\b/i, "streaming"],
  [/\b(spotify|apple\s+music|youtube\s+music|tidal|pandora)\b/i, "music"],
  [/\b(icloud|dropbox|1password|google\s+one|microsoft\s+365|onedrive)\b/i, "productivity"],
  [/\b(nyt|new\s+york\s+times|wsj|wall\s+street\s+journal|bloomberg|washington\s+post)\b/i, "news"],
  [/\b(adobe|creative\s+cloud)\b/i, "creative"],
  [/\b(peloton|apple\s+fitness|strava|fitbod)\b/i, "fitness"],
  [/\b(dashpass|uber\s+one|grubhub\+)\b/i, "food"],
  [/\b(amazon\s+prime|prime\b|walmart\+?|costco)\b/i, "prime"],
];

function categoryFor(service: string): keyof typeof CATEGORY_MEDIAN | null {
  for (const [re, cat] of SERVICE_CATEGORY) {
    if (re.test(service)) return cat;
  }
  return null;
}

/**
 * Normalize a subscription's amount + cadence to a monthly equivalent.
 * Null cadence is treated as monthly (weakest assumption; also flagged).
 */
export function monthlyEquivalent(amount: number | null, cadence: SubscriptionRow["cadence"]): number | null {
  if (amount === null) return null;
  switch (cadence) {
    case "weekly":
      return round2(amount * 4.345);
    case "monthly":
      return round2(amount);
    case "quarterly":
      return round2(amount / 3);
    case "yearly":
      return round2(amount / 12);
    default:
      return round2(amount);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return (a - b) / 86_400_000;
}

function computeFlags(row: SubscriptionRow, nowIso: string, windowDays: number): Flag[] {
  const flags: Flag[] = [];
  const isActive = row.active === 1;
  const renewalIso = row.next_renewal_at;

  if (isActive && renewalIso) {
    const days = daysBetween(`${renewalIso}T00:00:00Z`, nowIso);
    if (days <= 7 && days >= -1) {
      flags.push({
        kind: "auto-renew-within-7d",
        severity: "warn",
        evidence: `Renews ${renewalIso} (${Math.max(0, Math.round(days))} days)`,
      });
    } else if (days <= windowDays && days > 7) {
      flags.push({
        kind: "auto-renew-within-window",
        severity: "info",
        evidence: `Renews ${renewalIso} (${Math.round(days)} days)`,
      });
    }
  }

  if (row.detected_intent === "trial-ending" && renewalIso) {
    const days = daysBetween(`${renewalIso}T00:00:00Z`, nowIso);
    if (days <= 14) {
      flags.push({
        kind: "trial-ending",
        severity: "warn",
        evidence: `Free trial ends ${renewalIso} — charge begins`,
      });
    }
  }

  const cat = categoryFor(row.service);
  if (cat && row.amount !== null) {
    const monthly = monthlyEquivalent(row.amount, row.cadence);
    const median = CATEGORY_MEDIAN[cat]!;
    if (monthly !== null && monthly > median * 1.5) {
      flags.push({
        kind: "above-category-median",
        severity: "info",
        evidence: `$${monthly.toFixed(2)}/mo vs ${cat} median ~$${median.toFixed(2)}/mo`,
      });
    }
  }

  if (isActive && row.cadence === null) {
    flags.push({
      kind: "unknown-cadence",
      severity: "info",
      evidence: "No cadence detected — cost normalization assumed monthly",
    });
  }

  if (isActive && renewalIso === null && row.last_seen) {
    const daysSinceSeen = daysBetween(nowIso, row.last_seen);
    if (daysSinceSeen > 60) {
      flags.push({
        kind: "stale-no-renewal-info",
        severity: "info",
        evidence: `No renewal date + last email ${Math.round(daysSinceSeen)} days ago`,
      });
    }
  }

  if (row.detected_intent === "cancellation" && row.active === 0) {
    flags.push({
      kind: "recent-cancellation-detected",
      severity: "info",
      evidence: "Lens saw a cancellation confirmation — no longer billing",
    });
  }

  return flags;
}

function resolveRecommendation(findings: Finding[]): Recommendation {
  const trialEnding = findings.filter((f) => f.flags.some((x) => x.kind === "trial-ending")).length;
  const renewSoon = findings.filter((f) => f.flags.some((x) => x.kind === "auto-renew-within-7d")).length;
  const aboveMedian = findings.filter((f) => f.flags.some((x) => x.kind === "above-category-median")).length;

  if (trialEnding > 0 || renewSoon >= 2) {
    const pieces: string[] = [];
    if (renewSoon > 0) pieces.push(`${renewSoon} subscription${renewSoon === 1 ? "" : "s"} renew in the next 7 days`);
    if (trialEnding > 0) pieces.push(`${trialEnding} free trial${trialEnding === 1 ? " is" : "s are"} about to charge`);
    return {
      band: "urgent",
      oneLiner: pieces.join(" and ") + ". Review and cancel any you no longer use.",
    };
  }
  if (renewSoon === 1 || aboveMedian > 0) {
    const pieces: string[] = [];
    if (renewSoon === 1) pieces.push("1 subscription renews this week");
    if (aboveMedian > 0) pieces.push(`${aboveMedian} look${aboveMedian === 1 ? "s" : ""} above typical category pricing`);
    return {
      band: "review",
      oneLiner: pieces.join(" and ") + " — consider whether each is still worth it.",
    };
  }
  if (findings.length === 0) {
    return {
      band: "all-good",
      oneLiner: "No subscriptions on file. Scan your inbox to discover them.",
    };
  }
  return {
    band: "all-good",
    oneLiner: "No urgent actions — every active subscription is within its typical range.",
  };
}

export function auditSubscriptions(
  rows: SubscriptionRow[],
  options: AuditOptions = {},
): SubscriptionAudit {
  const nowIso = options.now ?? new Date().toISOString();
  const windowDays = options.windowDays ?? 30;

  const findings: Finding[] = rows.map((row) => {
    const monthly = monthlyEquivalent(row.amount, row.cadence);
    const annual = monthly === null ? null : round2(monthly * 12);
    const flags = computeFlags(row, nowIso, windowDays);
    return {
      subscriptionId: row.id,
      service: row.service,
      amount: row.amount,
      currency: row.currency,
      cadence: row.cadence,
      nextRenewalAt: row.next_renewal_at,
      active: row.active === 1,
      detectedIntent: row.detected_intent,
      flags,
      monthlyEquivalent: monthly,
      annualEquivalent: annual,
      cancelDraftable: row.active === 1,
    };
  });

  const activeFindings = findings.filter((f) => f.active);
  const totalMonthlyCost = round2(
    activeFindings.reduce((s, f) => s + (f.monthlyEquivalent ?? 0), 0),
  );
  const totalAnnualCost = round2(totalMonthlyCost * 12);
  const upcomingRenewals = findings.filter((f) =>
    f.flags.some((x) => x.kind === "auto-renew-within-7d" || x.kind === "auto-renew-within-window"),
  ).length;
  const flaggedCount = findings.filter((f) => f.flags.some((x) => x.severity !== "info")).length;

  return {
    ok: true,
    generatedAt: nowIso,
    summary: {
      totalActive: activeFindings.length,
      totalMonthlyCost,
      totalAnnualCost,
      upcomingRenewals,
      flaggedCount,
    },
    findings,
    recommendation: resolveRecommendation(findings),
  };
}
