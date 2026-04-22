import { describe, expect, it } from "vitest";
import { addSpanEvent, endSpan, newSpanId, newTraceId, startSpan } from "./trace.js";

describe("trace primitives", () => {
  it("generates trace/span ids with prefixes", () => {
    const t = newTraceId();
    const s = newSpanId();
    expect(t.startsWith("trace_")).toBe(true);
    expect(s.startsWith("span_")).toBe(true);
    expect(t).not.toBe(newTraceId());
  });

  it("startSpan populates expected fields", () => {
    const span = startSpan({
      traceId: "trace_test",
      name: "extract",
      attributes: { kind: "text" },
    });
    expect(span.traceId).toBe("trace_test");
    expect(span.name).toBe("extract");
    expect(span.status).toBe("unset");
    expect(span.events).toEqual([]);
    expect(span.attributes.kind).toBe("text");
    expect(typeof span.startedAt).toBe("string");
  });

  it("endSpan computes duration and status=ok", async () => {
    const span = startSpan({ traceId: "trace_test", name: "x" });
    await new Promise((r) => setTimeout(r, 5));
    endSpan(span);
    expect(span.status).toBe("ok");
    expect(typeof span.durationMs).toBe("number");
    expect(span.durationMs).toBeGreaterThanOrEqual(0);
    expect(span.endedAt).toBeDefined();
  });

  it("endSpan with error → status=error + exception event", () => {
    const span = startSpan({ traceId: "trace_test", name: "x" });
    const err = new Error("boom");
    endSpan(span, err);
    expect(span.status).toBe("error");
    const ex = span.events.find((e) => e.name === "exception");
    expect(ex).toBeDefined();
    expect(ex!.attributes?.message).toBe("boom");
  });

  it("addSpanEvent appends a timestamped event", () => {
    const span = startSpan({ traceId: "trace_test", name: "x" });
    addSpanEvent(span, "checkpoint", { step: 2 });
    expect(span.events).toHaveLength(1);
    expect(span.events[0]!.name).toBe("checkpoint");
    expect(span.events[0]!.attributes?.step).toBe(2);
  });

  it("parentSpanId is carried through when provided", () => {
    const span = startSpan({ traceId: "t", name: "child", parentSpanId: "span_parent" });
    expect(span.parentSpanId).toBe("span_parent");
  });
});
