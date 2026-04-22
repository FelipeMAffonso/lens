import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../memory-d1.js";
import {
  deletePreference,
  findPreference,
  listPreferencesByUser,
  upsertPreference,
} from "./preferences.js";

describe("preferences repo", () => {
  it("rejects upsert without user + anon", async () => {
    const d1 = createMemoryD1();
    await expect(
      upsertPreference(d1, { userId: null, anonUserId: null, category: "x", criteria: [] }),
    ).rejects.toThrow(/required/);
  });

  it("creates a preference row", async () => {
    const d1 = createMemoryD1();
    const row = await upsertPreference(d1, {
      userId: "u1",
      anonUserId: null,
      category: "laptops",
      criteria: [{ name: "battery life", weight: 0.4 }],
      valuesOverlay: { countryOfOrigin: true },
      sourceWeighting: { vendor: 30, independent: 70 },
    });
    expect(row.user_id).toBe("u1");
    expect(row.category).toBe("laptops");
    expect(JSON.parse(row.criteria_json)[0].weight).toBe(0.4);
    expect(JSON.parse(row.source_weighting_json!).independent).toBe(70);
  });

  it("upsert updates when (userId, category) already exists", async () => {
    const d1 = createMemoryD1();
    const first = await upsertPreference(d1, {
      userId: "u",
      anonUserId: null,
      category: "c",
      criteria: [{ name: "a", weight: 0.1 }],
    });
    const second = await upsertPreference(d1, {
      userId: "u",
      anonUserId: null,
      category: "c",
      criteria: [{ name: "a", weight: 0.9 }],
    });
    expect(second.id).toBe(first.id);
    const found = await findPreference(d1, { userId: "u", category: "c" });
    expect(JSON.parse(found!.criteria_json)[0].weight).toBe(0.9);
  });

  it("finds preference by anonUserId when no user is signed in", async () => {
    const d1 = createMemoryD1();
    await upsertPreference(d1, {
      userId: null,
      anonUserId: "anon-1",
      category: "espresso",
      criteria: [],
    });
    const found = await findPreference(d1, { anonUserId: "anon-1", category: "espresso" });
    expect(found?.anon_user_id).toBe("anon-1");
    expect(found?.user_id).toBeNull();
  });

  it("lists every preference for a user (multi-category)", async () => {
    const d1 = createMemoryD1();
    await upsertPreference(d1, { userId: "u", anonUserId: null, category: "laptops", criteria: [] });
    await upsertPreference(d1, { userId: "u", anonUserId: null, category: "espresso", criteria: [] });
    await upsertPreference(d1, { userId: "u2", anonUserId: null, category: "laptops", criteria: [] });
    const rows = await listPreferencesByUser(d1, { userId: "u" });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(["laptops", "espresso"]));
  });

  it("deletes a preference", async () => {
    const d1 = createMemoryD1();
    const row = await upsertPreference(d1, {
      userId: "u",
      anonUserId: null,
      category: "x",
      criteria: [],
    });
    await deletePreference(d1, row.id);
    const found = await findPreference(d1, { userId: "u", category: "x" });
    expect(found).toBeNull();
  });
});
