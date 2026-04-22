import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../db/memory-d1.js";
import { createMember, archiveMember } from "../db/repos/household.js";
import { upsertPreference } from "../db/repos/preferences.js";
import { resolveEffectivePreference } from "./resolver.js";

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("preferences", "id");
  db._setPrimaryKey("household_members", "id");
  return db;
}

/**
 * Build the 3-person household fixture from the block file's acceptance
 * criteria and return the db + profile ids.
 */
async function seedHousehold(db: ReturnType<typeof d1>) {
  const adultA = await createMember(db, { userId: "acc-1", name: "Felipe", role: "adult" });
  const adultB = await createMember(db, { userId: "acc-1", name: "Marta", role: "adult" });
  const teen = await createMember(db, { userId: "acc-1", name: "Ana", role: "teen" });

  // Household default: espresso-machines
  await upsertPreference(db, {
    userId: "acc-1",
    anonUserId: null,
    category: "espresso-machines",
    criteria: { pressure: 0.3, price: 0.4, build: 0.2, noise: 0.1 },
  });
  // Adult A override: espresso snob
  await upsertPreference(db, {
    userId: "acc-1",
    anonUserId: null,
    category: "espresso-machines",
    profileId: adultA.id,
    criteria: { pressure: 0.6, price: 0.2, build: 0.2, noise: 0.0 },
  });
  // Household default: laptops (no overrides anywhere)
  await upsertPreference(db, {
    userId: "acc-1",
    anonUserId: null,
    category: "laptops",
    criteria: { price: 0.4, performance: 0.3, portability: 0.2, battery: 0.1 },
  });
  return { adultA, adultB, teen };
}

describe("resolveEffectivePreference (3-person household fixture)", () => {
  it("profile-override row wins over household default when it exists", async () => {
    const db = d1();
    const { adultA } = await seedHousehold(db);
    const r = await resolveEffectivePreference(
      db,
      { userId: "acc-1" },
      "espresso-machines",
      adultA.id,
    );
    expect(r.source).toBe("profile");
    const criteria = JSON.parse(r.resolved!.criteria_json) as Record<string, number>;
    expect(criteria["pressure"]).toBe(0.6);
  });

  it("profile with no override falls back to household default", async () => {
    const db = d1();
    const { teen } = await seedHousehold(db);
    const r = await resolveEffectivePreference(
      db,
      { userId: "acc-1" },
      "espresso-machines",
      teen.id,
    );
    expect(r.source).toBe("household");
    expect(r.fellBackFrom).toBe("profile");
    const criteria = JSON.parse(r.resolved!.criteria_json) as Record<string, number>;
    expect(criteria["pressure"]).toBe(0.3);
  });

  it("category with NO per-profile overrides returns household for any profile", async () => {
    const db = d1();
    const { adultA, teen } = await seedHousehold(db);
    for (const pid of [adultA.id, teen.id]) {
      const r = await resolveEffectivePreference(
        db,
        { userId: "acc-1" },
        "laptops",
        pid,
      );
      expect(r.source).toBe("household");
    }
  });

  it("no profileId means household default", async () => {
    const db = d1();
    await seedHousehold(db);
    const r = await resolveEffectivePreference(db, { userId: "acc-1" }, "espresso-machines");
    expect(r.source).toBe("household");
    expect(r.fellBackFrom).toBeUndefined();
  });

  it("unknown category returns none", async () => {
    const db = d1();
    const { adultA } = await seedHousehold(db);
    const r = await resolveEffectivePreference(
      db,
      { userId: "acc-1" },
      "toothbrushes",
      adultA.id,
    );
    expect(r.source).toBe("none");
    expect(r.resolved).toBeNull();
  });

  it("profile from another user is ignored (falls back to household)", async () => {
    const db = d1();
    await seedHousehold(db);
    const foreign = await createMember(db, { userId: "other-acc", name: "Stranger" });
    const r = await resolveEffectivePreference(
      db,
      { userId: "acc-1" },
      "espresso-machines",
      foreign.id,
    );
    expect(r.source).toBe("household");
    expect(r.fellBackFrom).toBe("profile");
  });

  it("archived profile is ignored (falls back to household)", async () => {
    const db = d1();
    const { adultA } = await seedHousehold(db);
    await archiveMember(db, adultA.id);
    const r = await resolveEffectivePreference(
      db,
      { userId: "acc-1" },
      "espresso-machines",
      adultA.id,
    );
    expect(r.source).toBe("household");
    expect(r.fellBackFrom).toBe("profile");
  });

  it("anon principal with anon preference returns source=anon", async () => {
    const db = d1();
    await upsertPreference(db, {
      userId: null,
      anonUserId: "anon-99",
      category: "headphones",
      criteria: { anc: 0.5, price: 0.5 },
    });
    const r = await resolveEffectivePreference(db, { anonUserId: "anon-99" }, "headphones");
    expect(r.source).toBe("anon");
  });

  it("principal with no userId or anonUserId returns none", async () => {
    const db = d1();
    const r = await resolveEffectivePreference(db, {}, "anything");
    expect(r.source).toBe("none");
  });

  it("signed-in user without any stored pref + profileId returns none with fellBackFrom", async () => {
    const db = d1();
    const member = await createMember(db, { userId: "acc-x", name: "Solo" });
    const r = await resolveEffectivePreference(
      db,
      { userId: "acc-x" },
      "coffee-makers",
      member.id,
    );
    expect(r.source).toBe("none");
    expect(r.fellBackFrom).toBe("profile");
  });

  it("empty string profileId is treated as no profileId (household)", async () => {
    const db = d1();
    await seedHousehold(db);
    const r = await resolveEffectivePreference(
      db,
      { userId: "acc-1" },
      "espresso-machines",
      "",
    );
    expect(r.source).toBe("household");
    expect(r.fellBackFrom).toBeUndefined();
  });
});

describe("upsertPreference with profileId", () => {
  it("round-trips profile_id via INSERT path", async () => {
    const db = d1();
    const member = await createMember(db, { userId: "acc-1", name: "Felipe" });
    const pref = await upsertPreference(db, {
      userId: "acc-1",
      anonUserId: null,
      category: "espresso-machines",
      profileId: member.id,
      criteria: { pressure: 0.6 },
    });
    expect(pref.profile_id).toBe(member.id);
  });

  it("updates in place on second upsert with same (user, category, profileId)", async () => {
    const db = d1();
    const member = await createMember(db, { userId: "acc-1", name: "Felipe" });
    const first = await upsertPreference(db, {
      userId: "acc-1",
      anonUserId: null,
      category: "espresso-machines",
      profileId: member.id,
      criteria: { pressure: 0.6 },
    });
    const second = await upsertPreference(db, {
      userId: "acc-1",
      anonUserId: null,
      category: "espresso-machines",
      profileId: member.id,
      criteria: { pressure: 0.7 },
    });
    expect(second.id).toBe(first.id);
    const parsed = JSON.parse(second.criteria_json) as Record<string, number>;
    expect(parsed["pressure"]).toBe(0.7);
  });

  it("household default + profile override coexist as two distinct rows", async () => {
    const db = d1();
    const member = await createMember(db, { userId: "acc-1", name: "Felipe" });
    const h = await upsertPreference(db, {
      userId: "acc-1",
      anonUserId: null,
      category: "espresso-machines",
      criteria: { pressure: 0.3 },
    });
    const p = await upsertPreference(db, {
      userId: "acc-1",
      anonUserId: null,
      category: "espresso-machines",
      profileId: member.id,
      criteria: { pressure: 0.6 },
    });
    expect(h.id).not.toBe(p.id);
    expect(h.profile_id ?? null).toBeNull();
    expect(p.profile_id).toBe(member.id);
  });
});
