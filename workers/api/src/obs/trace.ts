// F17 — span factory. Minimal OTEL-compatible shape without a full OTEL dependency.
//
// Each trace corresponds 1:1 with a workflow run. Spans represent a node's attempt.
// Persistence is the existing workflow_runs.nodes_json; spans are a thin view over
// that row + the live run state. Future block: add an exporter to OTEL collector.

import { ulid } from "../workflow/ulid.js";
import { logger, type LogAttrs } from "./log.js";

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "unset" | "ok" | "error";
  attributes: Record<string, unknown>;
  events: Array<{ ts: string; name: string; attributes?: Record<string, unknown> }>;
}

export function newTraceId(): string {
  return "trace_" + ulid();
}

export function newSpanId(): string {
  return "span_" + ulid();
}

export function startSpan(opts: {
  traceId: string;
  name: string;
  parentSpanId?: string;
  attributes?: Record<string, unknown>;
}): Span {
  const span: Span = {
    traceId: opts.traceId,
    spanId: newSpanId(),
    name: opts.name,
    startedAt: new Date().toISOString(),
    status: "unset",
    attributes: opts.attributes ?? {},
    events: [],
  };
  if (opts.parentSpanId !== undefined) span.parentSpanId = opts.parentSpanId;
  logger.debug("span.start", {
    traceId: span.traceId,
    spanId: span.spanId,
    ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
    name: span.name,
  });
  return span;
}

export function endSpan(span: Span, err?: Error): Span {
  span.endedAt = new Date().toISOString();
  span.durationMs = Date.parse(span.endedAt) - Date.parse(span.startedAt);
  span.status = err ? "error" : "ok";
  if (err) {
    span.events.push({
      ts: span.endedAt,
      name: "exception",
      attributes: { message: err.message, name: err.name },
    });
  }
  const attrs: LogAttrs = {
    traceId: span.traceId,
    spanId: span.spanId,
    durationMs: span.durationMs,
  };
  if (err) attrs.err = { message: err.message, name: err.name };
  logger.info(`span.end ${span.name}`, attrs);
  return span;
}

export function addSpanEvent(
  span: Span,
  name: string,
  attributes?: Record<string, unknown>,
): void {
  const event: { ts: string; name: string; attributes?: Record<string, unknown> } = {
    ts: new Date().toISOString(),
    name,
  };
  if (attributes !== undefined) event.attributes = attributes;
  span.events.push(event);
}
