import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "./memory-d1.js";

describe("memory-d1 shim", () => {
  it("inserts + selects by equality", async () => {
    const d1 = createMemoryD1();
    await d1
      .prepare(`INSERT INTO t (id, name) VALUES (?, ?)`)
      .bind("1", "alice")
      .run();
    const r = await d1.prepare(`SELECT * FROM t WHERE id = ?`).bind("1").first<{ name: string }>();
    expect(r?.name).toBe("alice");
  });

  it("supports ORDER BY DESC + LIMIT", async () => {
    const d1 = createMemoryD1();
    await d1.prepare(`INSERT INTO t (id, name, ts) VALUES (?, ?, ?)`).bind("1", "a", 1).run();
    await d1.prepare(`INSERT INTO t (id, name, ts) VALUES (?, ?, ?)`).bind("2", "b", 2).run();
    await d1.prepare(`INSERT INTO t (id, name, ts) VALUES (?, ?, ?)`).bind("3", "c", 3).run();
    const r = await d1.prepare(`SELECT * FROM t ORDER BY ts DESC LIMIT ?`).bind(2).all<{ name: string }>();
    expect(r.results.map((x) => x.name)).toEqual(["c", "b"]);
  });

  it("supports UPDATE ... WHERE ...", async () => {
    const d1 = createMemoryD1();
    await d1.prepare(`INSERT INTO t (id, value) VALUES (?, ?)`).bind("x", 1).run();
    await d1.prepare(`UPDATE t SET value = ? WHERE id = ?`).bind(42, "x").run();
    const r = await d1.prepare(`SELECT * FROM t WHERE id = ?`).bind("x").first<{ value: number }>();
    expect(r?.value).toBe(42);
  });

  it("supports UPDATE col = col + 1 (increment)", async () => {
    const d1 = createMemoryD1();
    await d1.prepare(`INSERT INTO t (id, n) VALUES (?, ?)`).bind("x", 5).run();
    await d1.prepare(`UPDATE t SET n = n + 1 WHERE id = ?`).bind("x").run();
    const r = await d1.prepare(`SELECT * FROM t WHERE id = ?`).bind("x").first<{ n: number }>();
    expect(r?.n).toBe(6);
  });

  it("supports DELETE ... WHERE ...", async () => {
    const d1 = createMemoryD1();
    await d1.prepare(`INSERT INTO t (id) VALUES (?)`).bind("x").run();
    await d1.prepare(`DELETE FROM t WHERE id = ?`).bind("x").run();
    const r = await d1.prepare(`SELECT * FROM t WHERE id = ?`).bind("x").first();
    expect(r).toBeNull();
  });

  it("COUNT(*) works via the projection alias", async () => {
    const d1 = createMemoryD1();
    await d1.prepare(`INSERT INTO t (id) VALUES (?)`).bind("x").run();
    await d1.prepare(`INSERT INTO t (id) VALUES (?)`).bind("y").run();
    const r = await d1.prepare(`SELECT COUNT(*) AS n FROM t WHERE id = ?`).bind("x").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });

  it("INSERT OR REPLACE replaces on primary-key collision", async () => {
    const d1 = createMemoryD1();
    d1._setPrimaryKey("t", "id");
    await d1.prepare(`INSERT INTO t (id, v) VALUES (?, ?)`).bind("x", 1).run();
    await d1.prepare(`INSERT OR REPLACE INTO t (id, v) VALUES (?, ?)`).bind("x", 2).run();
    const r = await d1.prepare(`SELECT * FROM t WHERE id = ?`).bind("x").first<{ v: number }>();
    expect(r?.v).toBe(2);
    expect(d1._dump("t")).toHaveLength(1);
  });
});
