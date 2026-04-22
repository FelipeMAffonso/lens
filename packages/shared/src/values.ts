// CJ-W46 — Values overlay type surface for shared-across-worker+web+extension.

import { z } from "zod";

export const VALUE_KEYS = [
  "country-of-origin",
  "union-made",
  "carbon-footprint",
  "animal-welfare",
  "b-corp",
  "small-business",
  "repairability",
] as const;
export type ValueKey = (typeof VALUE_KEYS)[number];

export const ValueKeyEnum = z.enum(VALUE_KEYS);

export const ValuesOverlayEntrySchema = z
  .object({
    key: ValueKeyEnum,
    weight: z.number().min(0).max(1),
    // country-of-origin preference (ISO 3166-1 alpha-2 or region code "EU" | "US" | ...)
    preference: z.string().min(2).max(8).optional(),
  })
  .strict();
export type ValuesOverlayEntry = z.infer<typeof ValuesOverlayEntrySchema>;

export const ValuesOverlaySchema = z.array(ValuesOverlayEntrySchema);
export type ValuesOverlay = z.infer<typeof ValuesOverlaySchema>;

export const RerankCandidateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    brand: z.string().optional(),
    countryOfOrigin: z.string().optional(),
    baseUtility: z.number(),
    // Pack-supplied or extension-supplied signals — optional. If present,
    // rerank uses them directly instead of running heuristics.
    valuesSignals: z.record(ValueKeyEnum, z.number().min(-1).max(1)).optional(),
  })
  .strict();
export type RerankCandidate = z.infer<typeof RerankCandidateSchema>;

export const RerankRequestSchema = z
  .object({
    candidates: z.array(RerankCandidateSchema).min(1).max(50),
    overlay: ValuesOverlaySchema,
  })
  .strict();
export type RerankRequest = z.infer<typeof RerankRequestSchema>;

export interface RerankContribution {
  key: ValueKey;
  weight: number;
  signal: number;
  contribution: number; // weight * signal
}

export interface RerankResultEntry {
  id: string;
  name: string;
  brand?: string;
  baseUtility: number;
  finalUtility: number;
  contributions: RerankContribution[];
}

export interface RerankResponse {
  ranked: RerankResultEntry[];
  overlayActive: boolean;
  keysUsed: ValueKey[];
}
