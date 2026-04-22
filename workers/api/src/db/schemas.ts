// F2 — Zod schemas mirroring each row shape in migrations 0005_core_tables.sql.
// D1 returns `unknown`; repos validate every read + write through these schemas.

import { z } from "zod";

// ─── audits ───────────────────────────────────────────────────────────────
export const AuditRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().nullable(),
  anon_user_id: z.string().nullable(),
  kind: z.enum(["query", "text", "image", "url", "photo"]),
  host: z.string().nullable(),
  category: z.string().nullable(),
  intent_json: z.string(),
  ai_recommendation_json: z.string().nullable(),
  spec_optimal_json: z.string(),
  candidates_json: z.string().nullable(),
  claims_json: z.string().nullable(),
  cross_model_json: z.string().nullable(),
  warnings_json: z.string().nullable(),
  elapsed_ms_total: z.number().int().nonnegative(),
  pack_version_map_json: z.string().nullable(),
  created_at: z.string(),
  client_version: z.string().nullable(),
  client_origin: z.enum(["web", "extension", "mcp", "api"]).nullable(),
});
export type AuditRow = z.infer<typeof AuditRowSchema>;

// ─── preferences ──────────────────────────────────────────────────────────
export const PreferenceRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().nullable(),
  anon_user_id: z.string().nullable(),
  category: z.string().min(1),
  criteria_json: z.string(),
  values_overlay_json: z.string().nullable(),
  source_weighting_json: z.string().nullable(),
  profile_id: z.string().nullable().optional(), // CJ-W47 — nullable for household-default
  updated_at: z.string(),
  created_at: z.string(),
});
export type PreferenceRow = z.infer<typeof PreferenceRowSchema>;

// ─── household_members ────────────────────────────────────────────────────
export const HouseholdRoleEnum = z
  .enum(["owner", "adult", "teen", "child", "guest"])
  .nullable();
export const HouseholdMemberRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  name: z.string().min(1),
  role: z.union([HouseholdRoleEnum, z.null()]),
  relationship: z.string().nullable(),
  birth_year: z.number().int().nullable(),
  created_at: z.string(),
  archived_at: z.string().nullable(),
});
export type HouseholdMemberRow = z.infer<typeof HouseholdMemberRowSchema>;
export type HouseholdRole = z.infer<typeof HouseholdRoleEnum>;

// ─── watchers ─────────────────────────────────────────────────────────────
export const WatcherKindEnum = z.enum([
  "recall",
  "price_drop",
  "firmware",
  "subscription",
  "alert_criteria",
]);
export const WatcherRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  kind: WatcherKindEnum,
  config_json: z.string(),
  active: z.number().int().min(0).max(1),
  created_at: z.string(),
  last_fired_at: z.string().nullable(),
  last_fired_result_json: z.string().nullable(),
  fired_count: z.number().int().nonnegative(),
});
export type WatcherRow = z.infer<typeof WatcherRowSchema>;
export type WatcherKind = z.infer<typeof WatcherKindEnum>;

// ─── interventions ────────────────────────────────────────────────────────
export const InterventionStatusEnum = z.enum([
  "drafted",
  "sent",
  "acknowledged",
  "resolved",
  "failed",
]);
export const InterventionRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  pack_slug: z.string().min(1),
  status: InterventionStatusEnum,
  payload_json: z.string(),
  related_purchase_id: z.string().nullable(),
  related_audit_id: z.string().nullable(),
  related_watcher_id: z.string().nullable(),
  created_at: z.string(),
  sent_at: z.string().nullable(),
  response_received_at: z.string().nullable(),
  response_payload_json: z.string().nullable(),
  next_intervention_id: z.string().nullable(),
});
export type InterventionRow = z.infer<typeof InterventionRowSchema>;
export type InterventionStatus = z.infer<typeof InterventionStatusEnum>;

// ─── performance_ratings ─────────────────────────────────────────────────
export const PerformanceRatingRowSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  purchase_id: z.string().min(1),
  overall_rating: z.number().int().min(1).max(5),
  would_buy_again: z.number().int().min(0).max(1),
  criterion_feedback_json: z.string().nullable(),
  notes: z.string().nullable(),
  preference_snapshot_json: z.string().nullable(),
  category: z.string().nullable(),
  created_at: z.string(),
});
export type PerformanceRatingRow = z.infer<typeof PerformanceRatingRowSchema>;

// ─── welfare_deltas ───────────────────────────────────────────────────────
export const WelfareDeltaRowSchema = z.object({
  audit_id: z.string().min(1),
  user_id: z.string().nullable(),
  anon_user_id: z.string().nullable(),
  category: z.string().min(1),
  lens_pick_name: z.string().min(1),
  lens_pick_brand: z.string().nullable(),
  lens_pick_price: z.number().nullable(),
  lens_utility: z.number(),
  ai_pick_name: z.string().nullable(),
  ai_pick_brand: z.string().nullable(),
  ai_pick_price: z.number().nullable(),
  ai_utility: z.number().nullable(),
  utility_delta: z.number().nullable(),
  price_delta: z.number().nullable(),
  created_at: z.string(),
});
export type WelfareDeltaRow = z.infer<typeof WelfareDeltaRowSchema>;
