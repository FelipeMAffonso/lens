// S0-W5 — subscription-discovery types + Zod boundary schemas.

import { z } from "zod";

export const GmailMessageSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    from: z.string().min(1).max(256),
    subject: z.string().min(1).max(512),
    snippet: z.string().max(2_000).optional(),
    bodyText: z.string().max(32_000).optional(),
    receivedAt: z.string().optional(), // ISO
  })
  .strict();
export type GmailMessage = z.infer<typeof GmailMessageSchema>;

export const CadenceEnum = z.enum(["weekly", "monthly", "quarterly", "yearly"]);
export type Cadence = z.infer<typeof CadenceEnum>;

export const IntentEnum = z.enum(["confirmation", "renewal", "cancellation", "trial-ending"]);
export type Intent = z.infer<typeof IntentEnum>;

export interface ClassifiedSubscription {
  matched: true;
  service: string;
  amount?: number;
  currency: string;
  cadence?: Cadence;
  nextRenewalAt?: string;           // ISO date
  intent: Intent;
  confidence: number;               // 0..1
  sourceMessageId?: string | undefined;
}

export interface Unmatched {
  matched: false;
  reason: string;
  sourceMessageId?: string | undefined;
}

export type ClassifierResult = ClassifiedSubscription | Unmatched;

export const SubsScanRequestSchema = z
  .object({
    messages: z.array(GmailMessageSchema).min(1).max(500),
  })
  .strict();
export type SubsScanRequest = z.infer<typeof SubsScanRequestSchema>;

export interface SubscriptionRow {
  id: string;
  user_id: string;
  service: string;
  amount: number | null;
  currency: string;
  cadence: Cadence | null;
  next_renewal_at: string | null;
  source: "gmail" | "manual" | "extension";
  source_ref: string | null;
  active: 0 | 1;
  detected_intent: Intent | null;
  first_seen: string;
  last_seen: string;
  raw_payload_json: string | null;
}
