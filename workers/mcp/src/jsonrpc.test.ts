import { describe, expect, it } from "vitest";
import { ErrorCodes, failure, parseRequest, success } from "./jsonrpc.js";

describe("parseRequest", () => {
  it("accepts a valid request", () => {
    const r = parseRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(r).not.toBeNull();
    expect(r!.method).toBe("tools/list");
    expect(r!.id).toBe(1);
  });

  it("accepts notification (no id)", () => {
    const r = parseRequest({ jsonrpc: "2.0", method: "ping" });
    expect(r).not.toBeNull();
    expect(r!.id).toBeUndefined();
  });

  it("rejects wrong version", () => {
    expect(parseRequest({ jsonrpc: "1.0", id: 1, method: "x" })).toBeNull();
  });

  it("rejects missing method", () => {
    expect(parseRequest({ jsonrpc: "2.0", id: 1 })).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parseRequest("oops")).toBeNull();
    expect(parseRequest(null)).toBeNull();
    expect(parseRequest(42)).toBeNull();
  });
});

describe("success", () => {
  it("builds a valid success envelope", () => {
    const r = success(7, { ok: true });
    expect(r).toEqual({ jsonrpc: "2.0", id: 7, result: { ok: true } });
  });
});

describe("failure", () => {
  it("builds a valid error envelope", () => {
    const r = failure(5, ErrorCodes.MethodNotFound, "nope");
    expect(r.jsonrpc).toBe("2.0");
    expect(r.id).toBe(5);
    expect(r.error.code).toBe(-32601);
    expect(r.error.message).toBe("nope");
  });

  it("attaches data when provided", () => {
    const r = failure(null, ErrorCodes.InternalError, "boom", { detail: "x" });
    expect(r.error.data).toEqual({ detail: "x" });
  });
});

describe("ErrorCodes", () => {
  it("matches JSON-RPC 2.0 spec codes", () => {
    expect(ErrorCodes.ParseError).toBe(-32700);
    expect(ErrorCodes.InvalidRequest).toBe(-32600);
    expect(ErrorCodes.MethodNotFound).toBe(-32601);
    expect(ErrorCodes.InvalidParams).toBe(-32602);
    expect(ErrorCodes.InternalError).toBe(-32603);
  });
});
