// F3 — workflow runtime context.
//
// Every node handler receives a WorkflowContext. It provides:
//  - `env`: the Worker's environment bindings (ANTHROPIC_API_KEY, LENS_D1, ...)
//  - `runId` / `nodeId`: identifiers for the current run + node
//  - `emit`: fire a typed event onto the bus
//  - `signal`: AbortSignal that aborts when the run is cancelled or times out
//  - `log`: structured logger (tagged with runId + nodeId)
//  - `readState` / `writeState`: per-run scratchpad for side data (KV-backed later)

import type { LensEventMap } from "./events.js";
import { bus } from "./events.js";

export interface ContextInit<Env> {
  env: Env;
  runId: string;
  nodeId?: string;
  signal?: AbortSignal;
  emitHook?: (name: string, payload: unknown) => void;
}

export class WorkflowContext<Env = Record<string, unknown>> {
  readonly env: Env;
  readonly runId: string;
  nodeId: string | undefined;
  readonly signal: AbortSignal | undefined;
  private emitHook: ((name: string, payload: unknown) => void) | undefined;
  private stateMap: Map<string, unknown> = new Map();

  constructor(init: ContextInit<Env>) {
    this.env = init.env;
    this.runId = init.runId;
    this.nodeId = init.nodeId;
    this.signal = init.signal;
    this.emitHook = init.emitHook;
  }

  emit<K extends keyof LensEventMap>(name: K, payload: LensEventMap[K]): void {
    bus.emit(name, payload);
    this.emitHook?.(name as string, payload);
  }

  log(level: "debug" | "info" | "warn" | "error", msg: string, attrs: Record<string, unknown> = {}): void {
    // Structured log line; F17 observability promotes this to traces + logpush.
    const line = {
      level,
      runId: this.runId,
      ...(this.nodeId ? { nodeId: this.nodeId } : {}),
      msg,
      ts: new Date().toISOString(),
      ...attrs,
    };
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(JSON.stringify(line));
  }

  async readState<T>(key: string): Promise<T | null> {
    return (this.stateMap.get(key) as T | undefined) ?? null;
  }

  async writeState<T>(key: string, value: T): Promise<void> {
    this.stateMap.set(key, value);
  }

  /** Narrow this context to a specific node (used by the engine when dispatching to a handler). */
  forNode(nodeId: string): WorkflowContext<Env> {
    const child = new WorkflowContext<Env>({
      env: this.env,
      runId: this.runId,
      nodeId,
      ...(this.signal ? { signal: this.signal } : {}),
      ...(this.emitHook ? { emitHook: this.emitHook } : {}),
    });
    // Share the state map so every node in the same run can read/write to it.
    child.stateMap = this.stateMap;
    return child;
  }
}
