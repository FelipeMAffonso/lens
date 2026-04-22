// F3 — DAG utilities. Kahn's topological sort producing parallel batches.

import type { NodeSpec } from "./spec.js";

export interface DepGraph {
  indegree: Map<string, number>;
  outgoing: Map<string, Set<string>>;
  nodeById: Map<string, NodeSpec>;
}

export function buildDepGraph(nodes: Array<NodeSpec>): DepGraph {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, Set<string>>();
  const nodeById = new Map<string, NodeSpec>();
  for (const n of nodes) {
    if (nodeById.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
    nodeById.set(n.id, n);
    indegree.set(n.id, 0);
  }
  for (const n of nodes) {
    for (const dep of n.inputsFrom ?? []) {
      if (!nodeById.has(dep)) throw new Error(`node "${n.id}" depends on unknown node "${dep}"`);
      indegree.set(n.id, (indegree.get(n.id) ?? 0) + 1);
      const out = outgoing.get(dep) ?? new Set<string>();
      out.add(n.id);
      outgoing.set(dep, out);
    }
  }
  return { indegree, outgoing, nodeById };
}

/**
 * Kahn's algorithm producing BATCHES of nodes — each batch is an array of
 * node IDs that can run in parallel because they share a depth level.
 */
export function topoBatches(g: DepGraph): string[][] {
  const indegree = new Map(g.indegree);
  const batches: string[][] = [];
  const remaining = new Set(indegree.keys());
  while (remaining.size > 0) {
    const frontier = [...remaining].filter((id) => (indegree.get(id) ?? 0) === 0);
    if (frontier.length === 0) {
      // cycle
      throw new Error(
        `workflow DAG has a cycle among nodes: ${[...remaining].sort().join(", ")}`,
      );
    }
    batches.push(frontier);
    for (const id of frontier) {
      remaining.delete(id);
      for (const down of g.outgoing.get(id) ?? new Set<string>()) {
        indegree.set(down, (indegree.get(down) ?? 0) - 1);
      }
    }
  }
  return batches;
}
