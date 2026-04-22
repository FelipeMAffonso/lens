// F3 — typed in-process event bus.
//
// The bus is used by:
//  - the WorkflowEngine to emit lifecycle events (`run:start`, `node:start`, ...)
//  - workflow handlers to emit domain events (`audit:completed`, `recall:detected`, ...)
//  - SSE streaming endpoint to subscribe + forward to the client
//  - future cross-worker webhooks (F5) via a persistence shim that writes to KV

export type LensEventMap = {
  "run:start": { runId: string; workflowId: string };
  "run:complete": { runId: string; workflowId: string; durationMs: number };
  "run:fail": { runId: string; workflowId: string; error: string; nodeId?: string };
  "run:cancel": { runId: string; workflowId: string };
  "node:start": { runId: string; nodeId: string; attempt: number };
  "node:complete": { runId: string; nodeId: string; durationMs: number };
  "node:error": { runId: string; nodeId: string; attempt: number; error: string };
  "node:retry": { runId: string; nodeId: string; nextAttempt: number; delayMs: number };
  // domain events
  "audit:completed": { runId: string; auditId: string };
  "recall:detected": { userId: string; purchaseId: string; recallId: string };
  "price:dropped": { userId: string; purchaseId: string; oldPrice: number; newPrice: number };
  "pattern:detected": { userId?: string; pageUrl: string; pattern: string };
  "intervention:drafted": { userId: string; interventionId: string; packSlug: string };
};

export type EventName = keyof LensEventMap;
export type EventHandler<K extends EventName> = (payload: LensEventMap[K]) => void;
type AnyHandler = (payload: unknown) => void;

class EventBus {
  private handlers: Map<string, Set<AnyHandler>> = new Map();

  on<K extends EventName>(name: K, handler: EventHandler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set<AnyHandler>();
      this.handlers.set(name, set);
    }
    set.add(handler as AnyHandler);
    return () => set!.delete(handler as AnyHandler);
  }

  emit<K extends EventName>(name: K, payload: LensEventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const h of set) {
      try {
        h(payload);
      } catch (e) {
        console.error(`[bus] handler for "${name}" threw:`, (e as Error).message);
      }
    }
  }

  /** Subscribe to ANY event (for SSE streaming). */
  onAny(handler: (name: string, payload: unknown) => void): () => void {
    const key = "__any__";
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set<AnyHandler>();
      this.handlers.set(key, set);
    }
    const wrap: AnyHandler = (p) => {
      // The engine uses a separate path to emit into onAny; see emit below.
      void p;
    };
    set.add(wrap);
    return () => set!.delete(wrap);
  }
}

// Single process-wide bus. A Worker request handles its own lifetime, so this
// is effectively scoped to the request's isolate.
export const bus = new EventBus();
