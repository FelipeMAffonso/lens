import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../memory-d1.js";
import {
  createWatcher,
  deleteWatcher,
  getWatcher,
  listActiveWatchers,
  listWatchersByUser,
  markWatcherFired,
  setWatcherActive,
} from "./watchers.js";

describe("watchers repo", () => {
  it("creates a watcher defaulting to active", async () => {
    const d1 = createMemoryD1();
    const row = await createWatcher(d1, {
      userId: "u1",
      kind: "recall",
      config: { brands: ["Roborock"] },
    });
    expect(row.active).toBe(1);
    expect(row.fired_count).toBe(0);
    expect(JSON.parse(row.config_json).brands).toContain("Roborock");
  });

  it("respects active=false on creation", async () => {
    const d1 = createMemoryD1();
    const row = await createWatcher(d1, {
      userId: "u",
      kind: "price_drop",
      config: {},
      active: false,
    });
    expect(row.active).toBe(0);
  });

  it("listWatchersByUser filters by kind when given", async () => {
    const d1 = createMemoryD1();
    await createWatcher(d1, { userId: "u", kind: "recall", config: {} });
    await createWatcher(d1, { userId: "u", kind: "price_drop", config: {} });
    const all = await listWatchersByUser(d1, "u");
    const only = await listWatchersByUser(d1, "u", "recall");
    expect(all).toHaveLength(2);
    expect(only).toHaveLength(1);
    expect(only[0]!.kind).toBe("recall");
  });

  it("listActiveWatchers returns only active rows of the kind", async () => {
    const d1 = createMemoryD1();
    await createWatcher(d1, { userId: "u", kind: "recall", config: {}, active: true });
    await createWatcher(d1, { userId: "u", kind: "recall", config: {}, active: false });
    await createWatcher(d1, { userId: "u", kind: "price_drop", config: {}, active: true });
    const rows = await listActiveWatchers(d1, "recall");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.active).toBe(1);
    expect(rows[0]!.kind).toBe("recall");
  });

  it("markWatcherFired bumps the counter + stores the result", async () => {
    const d1 = createMemoryD1();
    const row = await createWatcher(d1, { userId: "u", kind: "firmware", config: {} });
    await markWatcherFired(d1, row.id, { matched: 3, alerts: 1 });
    const after = await getWatcher(d1, row.id);
    expect(after!.fired_count).toBe(1);
    expect(after!.last_fired_at).not.toBeNull();
    expect(JSON.parse(after!.last_fired_result_json!).matched).toBe(3);
  });

  it("setWatcherActive flips the active flag", async () => {
    const d1 = createMemoryD1();
    const row = await createWatcher(d1, { userId: "u", kind: "subscription", config: {} });
    await setWatcherActive(d1, row.id, false);
    expect((await getWatcher(d1, row.id))!.active).toBe(0);
  });

  it("deletes a watcher", async () => {
    const d1 = createMemoryD1();
    const row = await createWatcher(d1, { userId: "u", kind: "alert_criteria", config: {} });
    await deleteWatcher(d1, row.id);
    expect(await getWatcher(d1, row.id)).toBeNull();
  });
});
