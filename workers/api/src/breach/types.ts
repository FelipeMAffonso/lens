// S4-W26 — breach-history contract types + Zod.

import { z } from "zod";

export const BreachHistoryQuerySchema = z
  .object({
    host: z.string().min(1).max(256).regex(/^[a-z0-9.-]+$/i),
  })
  .strict();
export type BreachHistoryQuery = z.infer<typeof BreachHistoryQuerySchema>;

export type BreachSeverity = "low" | "moderate" | "high" | "critical";
export type BreachBand = "none" | "low" | "moderate" | "high" | "critical";

export interface BreachRecord {
  id: string;                // stable identifier ("target-2013", "equifax-2017")
  host: string;              // domain or canonical identifier
  date: string;              // YYYY-MM-DD
  recordsExposed: number;    // 0 if unknown
  dataTypes: string[];       // "email", "password", "ssn", "card", "address", ...
  severity: BreachSeverity;
  source: string;            // "fixture" | "HIBP" | "state-AG:CA" | "press:..."
  summary: string;           // 1-2 sentences
}

export interface BreachAggregate {
  count5yr: number;
  count10yr: number;
  totalRecordsExposed: number;
  mostRecentDate: string | null;
  yearsSinceMostRecent: number | null;
  hasSsnExposure: boolean;
  hasCardExposure: boolean;
  hasPasswordExposure: boolean;
}

export interface BreachHistoryResponse {
  host: string;
  breaches: BreachRecord[];
  aggregate: BreachAggregate;
  score: number;
  band: BreachBand;
  source: "fixture" | "hibp" | "mixed";
  generatedAt: string;
}
