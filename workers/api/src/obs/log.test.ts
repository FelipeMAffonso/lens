import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, withTags, log } from "./log.js";

describe("structured logger", () => {
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  const origDbg = console.debug;
  const out: string[] = [];

  beforeEach(() => {
    out.length = 0;
    const push = (s: unknown): void => {
      out.push(typeof s === "string" ? s : JSON.stringify(s));
    };
    console.log = push as typeof console.log;
    console.warn = push as typeof console.warn;
    console.error = push as typeof console.error;
    console.debug = push as typeof console.debug;
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
    console.debug = origDbg;
  });

  it("emits valid JSON with level + ts + msg", () => {
    logger.info("hello", { runId: "r1", nodeId: "n1" });
    expect(out).toHaveLength(1);
    const parsed = JSON.parse(out[0]!);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(parsed.runId).toBe("r1");
    expect(parsed.nodeId).toBe("n1");
    expect(typeof parsed.ts).toBe("string");
    expect(new Date(parsed.ts).getTime()).toBeGreaterThan(0);
  });

  it("routes levels to correct console methods", () => {
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(out).toHaveLength(4);
    const levels = out.map((s) => JSON.parse(s).level);
    expect(levels).toEqual(["debug", "info", "warn", "error"]);
  });

  it("withTags stamps defaults on every line", () => {
    const boundLog = withTags({ runId: "run_abc", workflowId: "audit" });
    boundLog.info("start");
    boundLog.error("boom", { nodeId: "extract" });
    expect(out).toHaveLength(2);
    const a = JSON.parse(out[0]!);
    expect(a.runId).toBe("run_abc");
    expect(a.workflowId).toBe("audit");
    const b = JSON.parse(out[1]!);
    expect(b.runId).toBe("run_abc");
    expect(b.nodeId).toBe("extract");
  });

  it("preserves nested attrs like err", () => {
    logger.error("failed", {
      runId: "r1",
      err: { message: "boom", name: "Error", stack: "..." },
    });
    const parsed = JSON.parse(out[0]!);
    expect(parsed.err.message).toBe("boom");
    expect(parsed.err.name).toBe("Error");
  });

  it("log() wrapper matches logger.<level>()", () => {
    log("warn", "msg", { runId: "x" });
    const parsed = JSON.parse(out[0]!);
    expect(parsed.level).toBe("warn");
    expect(parsed.runId).toBe("x");
  });
});
