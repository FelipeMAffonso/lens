// F3 — workflow registry. Workflows register themselves at module load time.

import type { WorkflowSpec } from "./spec.js";

const specs = new Map<string, WorkflowSpec>();

export function registerWorkflow<I, O>(spec: WorkflowSpec<I, O>): void {
  if (specs.has(spec.id)) {
    // Re-registration is harmless during hot-reload; we warn but don't throw.
    console.warn(`[workflow.registry] replacing workflow "${spec.id}"`);
  }
  specs.set(spec.id, spec as WorkflowSpec);
}

export function getWorkflow(id: string): WorkflowSpec | undefined {
  return specs.get(id);
}

export function listWorkflows(): WorkflowSpec[] {
  return [...specs.values()];
}

export function workflowStats(): { total: number; ids: string[] } {
  return { total: specs.size, ids: [...specs.keys()] };
}
