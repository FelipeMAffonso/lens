// F3 — workflow engine spec types.
//
// A WorkflowSpec is a pure DAG description. The engine takes a spec + an
// input, executes the nodes in topological order (running same-depth nodes
// in parallel), and returns the final node's output.

import type { WorkflowContext } from "./context.js";

export type BackoffFn = (attempt: number) => number;

export interface RetryPolicy {
  maxAttempts: number;               // total attempts including first
  backoffMs: number | BackoffFn;     // delay between attempts
  retryOn?: Array<string>;           // optional: only retry for these error codes/messages
}

export interface NodeSpec<In = unknown, Out = unknown> {
  id: string;
  label?: string;
  handler: (input: In, ctx: WorkflowContext) => Promise<Out>;
  /**
   * Node IDs whose outputs compose this node's input.
   *  - undefined / [] → node receives the workflow's top-level input
   *  - length 1        → node receives the single predecessor's output
   *  - length > 1      → node receives an object keyed by predecessor node id
   */
  inputsFrom?: Array<string>;
  timeoutMs?: number;                // default 60_000
  retry?: RetryPolicy;
}

export interface WorkflowSpec<RunInput = unknown, RunOutput = unknown> {
  id: string;
  version: string;
  description: string;
  nodes: Array<NodeSpec>;
  entryNodeId?: string;              // defaults to first node without inputsFrom
  finalNodeId: string;
  /**
   * If true, short-circuit: short runs (< 30s predicted) execute inline in the
   * request Worker; long runs get promoted to a Durable Object. Default: false
   * (inline only).
   */
  runtime?: "inline" | "durable";
  onComplete?: (
    run: Run,
    output: RunOutput,
    ctx: WorkflowContext,
  ) => Promise<void> | void;
  onError?: (run: Run, err: Error, ctx: WorkflowContext) => Promise<void> | void;
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type NodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface NodeRunState {
  status: NodeStatus;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: { message: string; attempt: number; stack?: string };
}

export interface Run {
  id: string;
  workflowId: string;
  workflowVersion: string;
  userId?: string | null;
  anonUserId?: string | null;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  error?: { message: string; nodeId?: string; stack?: string };
  nodes: Record<string, NodeRunState>;
  startedAt: string;
  completedAt?: string;
}
