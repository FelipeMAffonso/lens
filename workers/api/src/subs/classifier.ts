// S0-W5 — subscription-receipt classifier.
// Pure function: Gmail-shaped message → ClassifierResult.

import type { Cadence, ClassifierResult, GmailMessage, Intent } from "./types.js";

/**
 * Default cadence by service — used when the body is silent about cadence.
 * Most streaming / cloud services default monthly; annual plans usually
 * say "annual" explicitly and are picked up by `extractCadence`.
 */
const DEFAULT_CADENCE: Record<string, Cadence> = {
  Netflix: "monthly",
  "Spotify Premium": "monthly",
  Max: "monthly",
  Hulu: "monthly",
  "Disney+": "monthly",
  "YouTube Premium": "monthly",
  "Adobe Creative Cloud": "monthly",
  "DoorDash DashPass": "monthly",
  "Dropbox Plus": "monthly",
  "Peloton App": "monthly",
  "Apple One / iCloud+": "monthly",
  "The New York Times": "monthly",
  "Amazon Prime": "yearly",
};

/**
 * Known sender domain → canonical service name. Expandable via PR. Matching
 * is case-insensitive; the whole email address is scanned with a suffix rule.
 */
const SENDER_MAP: Array<{ domain: RegExp; service: string }> = [
  { domain: /@(no-reply|info|news)\.netflix\.com$/i, service: "Netflix" },
  { domain: /@netflix\.com$/i, service: "Netflix" },
  { domain: /@spotify\.com$/i, service: "Spotify Premium" },
  { domain: /@email\.spotify\.com$/i, service: "Spotify Premium" },
  { domain: /@(email|subscriber)\.nytimes\.com$/i, service: "The New York Times" },
  { domain: /@nytimes\.com$/i, service: "The New York Times" },
  { domain: /@mail\.wbd\.com$/i, service: "Max" }, // HBO Max / Max → WB Discovery
  { domain: /@(mail|help|billing)\.hbomax\.com$/i, service: "Max" },
  { domain: /@mail\.adobe\.com$/i, service: "Adobe Creative Cloud" },
  { domain: /@message\.doordash\.com$/i, service: "DoorDash DashPass" },
  { domain: /@(marketplace|auto-confirm)\.amazon\.com$/i, service: "Amazon Prime" },
  { domain: /@(apple|me)\.com$/i, service: "Apple One / iCloud+" },
  { domain: /@dropbox\.com$/i, service: "Dropbox Plus" },
  { domain: /@email\.onepeloton\.com$/i, service: "Peloton App" },
  { domain: /@notifications\.hulu\.com$/i, service: "Hulu" },
  { domain: /@mail\.disneyplus\.com$/i, service: "Disney+" },
  { domain: /@mail\.youtube\.com$/i, service: "YouTube Premium" },
];

const SUBSCRIPTION_KEYWORDS = [
  /\brenew(?:al|ed|s)?\b/i,
  /\bauto[- ]?renew\b/i,
  /\bsubscription\b/i,
  /\bbilling\s+date\b/i,
  /\btrial\s+(?:end|ending|ends)\b/i,
  /\byour\s+(?:plan|membership|premium)\b/i,
  /\bnext\s+(?:charge|payment|billing)\b/i,
];

const CANCELLATION_MARKERS = [
  /\b(?:cancel(?:l)?ed|cancellation confirmed|your cancellation)\b/i,
  /\bhas been cancel(?:l)?ed\b/i,
  /\bwe'?ve\s+cancel(?:l)?ed\b/i,
];

const TRIAL_ENDING_MARKERS = [
  /\btrial\s+(?:end|ending|ends?)\s+(?:on|in|soon)?/i,
  /\byour\s+(?:free\s+)?trial\s+will\s+(?:end|convert)/i,
];

const RENEWAL_MARKERS = [
  /\bhas\s+been\s+renew(?:ed)?\b/i,
  /\brenewed\s+successfully\b/i,
  /\bcharged\s+(?:your|the)\s+card\b/i,
  /\bpayment\s+(?:successful|received|processed)\b/i,
];

const MARKETING_DROP_MARKERS = [
  /\bnew\s+releases?\s+this\s+week\b/i,
  /\btop\s+picks?\s+for\s+you\b/i,
  /\b(\d+)%\s+off\b/i,
  /\blimited\s+time\s+offer\b/i,
  /\bfor\s+you\s+today\b/i,
];

/**
 * Main entry point. Returns either a ClassifiedSubscription or an Unmatched
 * reason, never throws.
 */
export function classifyMessage(msg: GmailMessage): ClassifierResult {
  const from = msg.from ?? "";
  const subject = msg.subject ?? "";
  const body = msg.bodyText ?? msg.snippet ?? "";
  const combined = `${subject}\n\n${body}`;
  const sourceMessageId = msg.id;

  // Negative filter — clearly marketing content.
  if (MARKETING_DROP_MARKERS.some((r) => r.test(combined)) && !isLikelyTrialOrRenewal(combined)) {
    return {
      matched: false,
      reason: "marketing blast, not a subscription event",
      sourceMessageId,
    };
  }

  const service = identifyService(from, combined);
  if (!service) {
    return {
      matched: false,
      reason: "no known subscription service detected",
      sourceMessageId,
    };
  }

  const hasKeyword = SUBSCRIPTION_KEYWORDS.some((r) => r.test(combined));
  if (!hasKeyword) {
    return {
      matched: false,
      reason: `no subscription keyword detected (service hint: ${service})`,
      sourceMessageId,
    };
  }

  const intent = detectIntent(combined);
  const amount = extractAmount(combined);
  const cadence = extractCadence(combined) ?? DEFAULT_CADENCE[service];
  const nextRenewalAt = extractNextRenewal(combined, msg.receivedAt);
  const confidence = computeConfidence({
    serviceFromSender: senderRecognized(from),
    hasAmount: amount !== undefined,
    hasCadence: cadence !== undefined,
    hasNextDate: !!nextRenewalAt,
  });

  const result: ClassifierResult = {
    matched: true,
    service,
    currency: "USD",
    intent,
    confidence,
    sourceMessageId,
  };
  if (amount !== undefined) result.amount = amount;
  if (cadence !== undefined) result.cadence = cadence;
  if (nextRenewalAt !== undefined) result.nextRenewalAt = nextRenewalAt;
  return result;
}

function senderRecognized(from: string): boolean {
  return SENDER_MAP.some(({ domain }) => domain.test(from));
}

function identifyService(from: string, combined: string): string | null {
  for (const { domain, service } of SENDER_MAP) {
    if (domain.test(from)) return service;
  }
  // Fallback: common service mention in subject/body.
  const nameInBody = /\b(Netflix|Spotify|The New York Times|NYTimes|HBO Max|Max|Adobe Creative Cloud|DoorDash DashPass|Amazon Prime|Apple One|iCloud\+?|Dropbox Plus|Peloton|Hulu|Disney\+|YouTube Premium|Microsoft 365|Calm|Headspace)\b/i;
  const m = combined.match(nameInBody);
  if (m?.[1]) {
    const raw = m[1]!;
    return raw === "NYTimes" ? "The New York Times" : raw;
  }
  return null;
}

function detectIntent(combined: string): Intent {
  if (CANCELLATION_MARKERS.some((r) => r.test(combined))) return "cancellation";
  if (TRIAL_ENDING_MARKERS.some((r) => r.test(combined))) return "trial-ending";
  if (RENEWAL_MARKERS.some((r) => r.test(combined))) return "renewal";
  return "confirmation";
}

function isLikelyTrialOrRenewal(combined: string): boolean {
  if (RENEWAL_MARKERS.some((r) => r.test(combined))) return true;
  if (TRIAL_ENDING_MARKERS.some((r) => r.test(combined))) return true;
  return false;
}

/** Extract the first USD-looking amount. Supports $X.XX and $X/month patterns. */
export function extractAmount(text: string): number | undefined {
  // Prefer amounts immediately next to "/month" / "per month" — they're
  // more reliable subscription prices than orphan dollar amounts.
  const withCadence = text.match(
    /\$\s?(\d{1,4}(?:\.\d{2})?)\s?(?:\/|per\s+)(?:month|mo|year|yr|week|wk)\b/i,
  );
  if (withCadence?.[1]) return parsePrice(withCadence[1]);

  // Next: explicit "will be charged $X" / "your total $X" patterns.
  const explicit = text.match(
    /(?:charged|total(?:\s+of)?|amount|billed|billing)\s*[:\s]*\s*(?:USD\s*)?\$\s?(\d{1,4}(?:\.\d{2})?)/i,
  );
  if (explicit?.[1]) return parsePrice(explicit[1]);

  // Fallback: the first standalone dollar amount in the text, minus very
  // small values (< $1.00) which are usually noise.
  const general = text.match(/\$\s?(\d{1,4}(?:\.\d{2})?)/);
  if (general?.[1]) {
    const n = parsePrice(general[1]);
    if (n !== undefined && n >= 1) return n;
  }
  return undefined;
}

function parsePrice(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Normalize "monthly" / "yearly" / "weekly" / "quarterly" patterns. */
export function extractCadence(text: string): Cadence | undefined {
  if (/\b(monthly|per\s+month|each\s+month|\/\s?mo(?:nth)?)\b/i.test(text)) return "monthly";
  if (/\b(yearly|annual(?:ly)?|per\s+year|each\s+year|\/\s?(?:yr|year))\b/i.test(text)) return "yearly";
  if (/\b(weekly|per\s+week|each\s+week|\/\s?(?:wk|week))\b/i.test(text)) return "weekly";
  if (/\b(quarterly|every\s+3\s+months?)\b/i.test(text)) return "quarterly";
  return undefined;
}

/** Try to extract an ISO next-renewal date. */
export function extractNextRenewal(text: string, receivedAt?: string): string | undefined {
  // Pattern 1: "on Apr 24, 2026" / "on April 24, 2026"
  const longDate = text.match(
    /(?:on|date\s*:?|renews?\s+on|next\s+(?:charge|billing|payment)\s+(?:date|on)?)\s*[:\s]*\s*((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,\s+\d{4})?)/i,
  );
  if (longDate?.[1]) {
    const iso = parseLongDate(longDate[1], receivedAt);
    if (iso) return iso;
  }
  // Pattern 2: "on 2026-04-24"
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Pattern 3: "on 4/24/2026" or "4/24/26"
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (us) {
    const m = pad(us[1]!);
    const d = pad(us[2]!);
    const y = us[3]!.length === 2 ? `20${us[3]}` : us[3]!;
    return `${y}-${m}-${d}`;
  }
  // Pattern 4: "in N days" / "in N weeks" / "in N months"
  const rel = text.match(/\bin\s+(\d+)\s+(days?|weeks?|months?)\b/i);
  if (rel && receivedAt) {
    const base = new Date(receivedAt);
    if (!Number.isNaN(base.getTime())) {
      const n = Number(rel[1]);
      const unit = rel[2]!.toLowerCase();
      const ms = unit.startsWith("day")
        ? n * 86_400_000
        : unit.startsWith("week")
          ? n * 7 * 86_400_000
          : n * 30 * 86_400_000;
      return new Date(base.getTime() + ms).toISOString().slice(0, 10);
    }
  }
  return undefined;
}

function parseLongDate(raw: string, receivedAt?: string): string | undefined {
  const m = raw.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,\s+(\d{4}))?/i,
  );
  if (!m) return undefined;
  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };
  const month = months[m[1]!.toLowerCase()];
  if (!month) return undefined;
  const day = pad(m[2]!);
  let year = m[3] ? Number(m[3]) : undefined;
  if (year === undefined) {
    // No year → inherit from receivedAt; if receivedAt is missing, assume
    // current year + roll forward to the next occurrence.
    const base = receivedAt ? new Date(receivedAt) : new Date();
    year = base.getFullYear();
    // If the resulting date is in the past relative to the base, bump +1 yr.
    const candidate = new Date(`${year}-${pad(String(month))}-${day}T00:00:00Z`);
    if (!Number.isNaN(candidate.getTime()) && candidate < base) year += 1;
  }
  return `${year}-${pad(String(month))}-${day}`;
}

function pad(s: string): string {
  return s.length === 1 ? `0${s}` : s;
}

interface ConfidenceInput {
  serviceFromSender: boolean;
  hasAmount: boolean;
  hasCadence: boolean;
  hasNextDate: boolean;
}

function computeConfidence(i: ConfidenceInput): number {
  let score = 0.2;
  if (i.serviceFromSender) score += 0.5;
  if (i.hasAmount) score += 0.15;
  if (i.hasCadence) score += 0.1;
  if (i.hasNextDate) score += 0.05;
  return Math.min(1, Math.round(score * 100) / 100);
}
