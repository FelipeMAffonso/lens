import { describe, expect, it } from "vitest";
import { buildDepGraph, topoBatches } from "./dag.js";
import type { NodeSpec } from "./spec.js";

const N = (id: string, deps: string[] = []): NodeSpec => ({
  id,
  inputsFrom: deps,
  handler: async () => id,
});

describe("buildDepGraph", () => {
  it("computes indegrees", () => {
    const g = buildDepGraph([N("a"), N("b", ["a"]), N("c", ["a", "b"])]);
    expect(g.indegree.get("a")).toBe(0);
    expect(g.indegree.get("b")).toBe(1);
    expect(g.indegree.get("c")).toBe(2);
  });

  it("detects duplicate ids", () => {
    expect(() => buildDepGraph([N("a"), N("a")])).toThrow(/duplicate/);
  });

  it("detects unknown deps", () => {
    expect(() => buildDepGraph([N("a", ["ghost"])])).toThrow(/ghost/);
  });
});

describe("topoBatches", () => {
  it("produces parallel batches per depth level", () => {
    const g = buildDepGraph([N("a"), N("b", ["a"]), N("c", ["a"]), N("d", ["b", "c"])]);
    const batches = topoBatches(g);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual(["a"]);
    expect(new Set(batches[1])).toEqual(new Set(["b", "c"]));
    expect(batches[2]).toEqual(["d"]);
  });

  it("handles a diamond audit-shape DAG", () => {
    const g = buildDepGraph([
      N("extract"),
      N("search", ["extract"]),
      N("crossModel", ["extract"]),
      N("verify", ["extract", "search"]),
      N("rank", ["extract", "search"]),
      N("assemble", ["extract", "search", "crossModel", "verify", "rank"]),
    ]);
    const batches = topoBatches(g);
    expect(batches[0]).toEqual(["extract"]);
    expect(new Set(batches[1])).toEqual(new Set(["search", "crossModel"]));
    expect(new Set(batches[2])).toEqual(new Set(["verify", "rank"]));
    expect(batches[3]).toEqual(["assemble"]);
  });

  it("detects a cycle", () => {
    const g = buildDepGraph([N("a", ["b"]), N("b", ["a"])]);
    expect(() => topoBatches(g)).toThrow(/cycle/);
  });

  it("handles a single-node DAG", () => {
    const g = buildDepGraph([N("only")]);
    expect(topoBatches(g)).toEqual([["only"]]);
  });

  it("handles a fully parallel DAG (no dependencies)", () => {
    const g = buildDepGraph([N("a"), N("b"), N("c")]);
    const batches = topoBatches(g);
    expect(batches).toHaveLength(1);
    expect(new Set(batches[0])).toEqual(new Set(["a", "b", "c"]));
  });
});
