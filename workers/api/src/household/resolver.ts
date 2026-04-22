// CJ-W47 — resolve the *effective* preference row given a principal,
// category, and optional profile id. Row-level precedence:
//
//   1. profile-scoped row under user_id  (source: "profile")
//   2. household-default row under user_id  (source: "household")
//   3. anon row under anon_user_id  (source: "anon")
//   4. null  (source: "none")

import type { D1Like } from "../db/client.js";
import { findPreference } from "../db/repos/preferences.js";
import { getMember } from "../db/repos/household.js";
import type { PreferenceRow } from "../db/schemas.js";

export interface Principal {
  userId?: string;
  anonUserId?: string;
}

export type PreferenceSource = "profile" | "household" | "anon" | "none";

export interface ResolvedPreference {
  resolved: PreferenceRow | null;
  source: PreferenceSource;
  fellBackFrom?: "profile"; // present when a profileId was requested but no profile row existed
}

export async function resolveEffectivePreference(
  d1: D1Like,
  principal: Principal,
  category: string,
  profileId?: string | null,
): Promise<ResolvedPreference> {
  // If profileId was provided, verify it belongs to the signed-in user and
  // isn't archived; an archived/wrong-user profile falls back like no-op.
  let profileValid = false;
  if (profileId && principal.userId) {
    const member = await getMember(d1, profileId);
    if (member && member.user_id === principal.userId && member.archived_at === null) {
      profileValid = true;
    }
  }

  if (profileId && profileValid && principal.userId) {
    const row = await findPreference(d1, {
      userId: principal.userId,
      category,
      profileId,
    });
    if (row) return { resolved: row, source: "profile" };
  }

  if (principal.userId) {
    const row = await findPreference(d1, {
      userId: principal.userId,
      category,
      profileId: null,
    });
    if (row) {
      const result: ResolvedPreference = { resolved: row, source: "household" };
      if (profileId) result.fellBackFrom = "profile";
      return result;
    }
  }

  if (principal.anonUserId) {
    const row = await findPreference(d1, {
      anonUserId: principal.anonUserId,
      category,
      profileId: null,
    });
    if (row) {
      const result: ResolvedPreference = { resolved: row, source: "anon" };
      if (profileId) result.fellBackFrom = "profile";
      return result;
    }
  }

  const nothing: ResolvedPreference = { resolved: null, source: "none" };
  if (profileId) nothing.fellBackFrom = "profile";
  return nothing;
}
