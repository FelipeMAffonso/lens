# CJ-W47 — Family / household profiles

**Depends on:** F1 ✅ (auth), F2 ✅ (persistence + preferences repo).

**Goal:** Let a single Lens account maintain multiple *profiles* — household members with their own preference overrides that inherit sensible household defaults. A coffee-snob adult gets `pressure=0.50` on espresso machines; their minimalist teenager gets `price=0.60`. The laptop they share falls back to the household default.

Per `BLOCK_PLAN.md`:

> `profile.household`. Multiple profiles per account with per-person overrides.
> Acceptance: 3-person household test; shared + overridden categories work.

## Why the block exists

VISION_COMPLETE.md §4 touchpoint inventory + §12 user-touchable surfaces both list "family / household profiles" as a block that must ship. It also unlocks CJ-W48 gift-buying mode (recipient profile = one household member). It's structurally small but architecturally important: without it, the preferences repo is a flat table-per-account, and every multi-person buying decision is a compromise.

## Architecture

### Two pieces of persistence

1. **`household_members` table** — one row per profile. Each row belongs to one `user_id` (the account holder). Profiles are not users themselves — they cannot sign in separately. They're labels + optional demographics.

2. **`preferences.profile_id`** — a nullable column. Three meaningful states:
   - `profile_id IS NULL` → the household default
   - `profile_id = <existing profile id>` → that profile's override
   - `profile_id = <archived/deleted profile id>` → orphaned, ignored

SQLite's UNIQUE-index treatment of NULL makes this clean: `UNIQUE(user_id, category, profile_id)` allows one household-default + N per-profile rows per category. Zero hacks.

### Resolver contract — `resolveEffectivePreference`

Given `(userId | anonUserId, category, profileId?)`, returns the *effective* preference by precedence:

1. If `profileId` is provided AND a `(user, category, profile_id = P)` row exists → use it. Source: `"profile"`.
2. Else if `(user, category, profile_id IS NULL)` row exists → use it. Source: `"household"`.
3. Else if `anonUserId` is the principal and `(anon, category)` row exists → use it. Source: `"anon"`.
4. Else → null.

The resolver never silently merges at the criterion level. Overrides are row-level: a profile that wants to tweak one criterion writes a full preference row of its own. That keeps the math transparent (no invisible inheritance chain per key).

**Why row-level, not criterion-level:** If we merged at the key level ("profile overrides X, inherits Y from household"), a user who sets `price=0.30` for their teenager's laptop preference and later changes the household default would unintentionally shift every unset criterion. Row-level override means every profile preference is a complete, auditable snapshot.

### The 3-person household acceptance test

A fixture with:
- **User `acc-1`** (household owner)
- **Profiles:** `p-adult-a`, `p-adult-b`, `p-teen`
- **Categories:** `espresso-machines`, `laptops`

Preferences seeded:
- household default `espresso-machines` → `{pressure: 0.3, price: 0.4, build: 0.2, noise: 0.1}`
- profile `p-adult-a` `espresso-machines` → `{pressure: 0.6, price: 0.2, build: 0.2, noise: 0.0}` (the coffee snob)
- household default `laptops` → `{price: 0.4, performance: 0.3, portability: 0.2, battery: 0.1}`
- (no per-profile override for laptops — every household member shares it)

Resolver checks:
- `resolveEffectivePreference(acc-1, "espresso-machines", p-adult-a)` → `{source:"profile", weights:{pressure:0.6,...}}`
- `resolveEffectivePreference(acc-1, "espresso-machines", p-teen)` → `{source:"household", weights:{pressure:0.3,...}}` (no override exists for teen)
- `resolveEffectivePreference(acc-1, "laptops", p-adult-a)` → `{source:"household", weights:{price:0.4,...}}` (shared)
- `resolveEffectivePreference(acc-1, "espresso-machines", no-profile)` → `{source:"household"}`
- `resolveEffectivePreference(acc-1, "toothbrushes", p-teen)` → `null` (no preference at any level)

## HTTP contract

### Profile CRUD (requires auth)

```
GET    /household/members                          → { members: HouseholdMember[], count }
POST   /household/members { name, role?, relationship?, birthYear? }
                                                    → { member: HouseholdMember }
PATCH  /household/members/:id { name?, role?, relationship?, birthYear?, archived? }
                                                    → { member: HouseholdMember }
DELETE /household/members/:id                      → { ok: true, id }   (soft delete — sets archived_at)
```

`role` ∈ `{"owner" | "adult" | "teen" | "child" | "guest" | null}` — enum for UI styling only; not load-bearing for the resolver.

### Preferences with profile scope (requires auth)

```
PUT /preferences { category, criteria, profileId? }   → { preference: PreferenceRow }
```

If `profileId` is supplied, we verify the profile belongs to the signed-in user first (404 on cross-user). Existing PUT path behavior preserved when `profileId` is omitted → continues to write the household-default row (matching current S0-W5 + S2-W13 + CJ-W46 writers).

### Effective preference resolver (requires auth for user lookup)

```
GET /preferences/effective?category=<X>&profileId=<Y>?
  → {
      resolved: PreferenceRow | null,
      source: "profile" | "household" | "anon" | "none",
      fellBackFrom?: "profile"   // when asked-for profile had no row
    }
```

## Database changes — migration 0008

```sql
CREATE TABLE IF NOT EXISTS household_members (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT NOT NULL,               -- owning account
  name TEXT NOT NULL,
  role TEXT,                           -- "owner" | "adult" | "teen" | "child" | "guest" | NULL
  relationship TEXT,                   -- free text
  birth_year INTEGER,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_household_user ON household_members(user_id, archived_at);

-- Add profile scope to preferences.
ALTER TABLE preferences ADD COLUMN profile_id TEXT;

-- Replace legacy (user_id, category) UNIQUE with (user_id, category, profile_id).
-- SQLite treats NULL as distinct in UNIQUE indexes, which is exactly what
-- we want: one household-default + N per-profile rows per category.
DROP INDEX IF EXISTS idx_preferences_user_category;
DROP INDEX IF EXISTS idx_preferences_anon_category;
CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_user_category_profile
  ON preferences(user_id, category, profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_anon_category_profile
  ON preferences(anon_user_id, category, profile_id);
```

## Apple-product bar hooks

| § | Rule | How CJ-W47 meets it |
|---|---|---|
| 2 intelligent | resolver explains WHY it picked what it did | `source: "profile" | "household" | "anon" | "none"` + optional `fellBackFrom` |
| 10 never a placeholder | null result is meaningful | `{resolved: null, source: "none"}` with zero ambiguity |
| privacy contract | household members aren't users | they cannot sign in; owner controls every row |

## Files touched

- `workers/api/migrations/0008_household_profiles.sql` (new)
- `workers/api/src/db/schemas.ts` (modified) — HouseholdMemberRowSchema + PreferenceRowSchema gets profile_id
- `workers/api/src/db/repos/preferences.ts` (modified) — profileId propagates through upsert + find + the new resolver
- `workers/api/src/db/repos/household.ts` (new) — household CRUD
- `workers/api/src/household/handler.ts` (new) — 5 HTTP endpoints
- `workers/api/src/household/resolver.ts` (new) — pure `resolveEffectivePreference`
- `workers/api/src/household/handler.test.ts` (new)
- `workers/api/src/household/resolver.test.ts` (new)
- `workers/api/src/db/repos/preferences.test.ts` (modified — add profile_id round-trip test)
- `workers/api/src/index.ts` (modified) — wire new routes

## Implementation checklist

1. Write migration 0008.
2. Apply migration remote.
3. Extend db/schemas.ts — HouseholdMemberRowSchema + PreferenceRowSchema gets profile_id (nullable).
4. Extend `db/repos/preferences.ts` — `UpsertPreferenceInput` gets `profileId?: string | null`; `findPreference` + `listPreferencesByUser` honor profile_id; add `resolveEffectivePreference`.
5. Write `db/repos/household.ts` — createMember, listByUser (active-only / include-archived), getById, patchMember, archiveMember.
6. Write `household/resolver.ts` — `resolveEffectivePreference(d1, principal, category, profileId?)` returning `{ resolved, source, fellBackFrom }`.
7. Write `household/handler.ts` — 5 CRUD endpoints + `/preferences/effective` handler.
8. Wire routes in `src/index.ts`.
9. Upgrade the existing `PUT /preferences` handler in `index.ts` to accept + validate `profileId` (bail 404 when profile isn't owned by caller).
10. Write tests: resolver (≥ 10 scenarios including 3-person household fixture), repo (profile_id round-trip, archived member), handler (CRUD + 401/404/403 + preferences-with-profile + /effective).
11. Run targeted + full suite.
12. Typecheck.
13. Deploy.
14. Smoke (401 unauth on member endpoints → proves live).
15. Commit `lens(CJ-W47): household profiles + per-profile preference overrides`.
16. CHECKLIST ✅ + progress log + push.

## Acceptance criteria

- Migration 0008 applied remote; D1 table count increments.
- 3-person-household fixture resolves per the spec above.
- `DROP INDEX` + new UNIQUE index is in effect — attempting to insert two household-default rows for the same (user, category) fails.
- Member CRUD works with 401/403/404 on appropriate paths.
- `PUT /preferences { ..., profileId: X }` writes a profile-scoped row; same call without `profileId` writes the household-default.
- `GET /preferences/effective` picks profile → household → anon → none in that order.
- Archived members' preferences still exist but `/effective` with their profile_id returns source="household" (falls through because the profile is archived).
- Typecheck + tests green.
- Deployed; commit + CHECKLIST ✅.
