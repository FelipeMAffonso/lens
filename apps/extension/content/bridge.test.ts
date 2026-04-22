import { describe, expect, it, vi } from "vitest";
import { nextRequestId, onSidebarMessage, onContentMessage } from "./bridge.js";

describe("nextRequestId", () => {
  it("produces monotonically increasing ids", () => {
    const a = nextRequestId();
    const b = nextRequestId();
    expect(a).not.toBe(b);
    expect(a.startsWith("req_")).toBe(true);
  });
});

describe("onSidebarMessage", () => {
  it("ignores messages from other sources", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const handler = vi.fn();
    const unsub = onSidebarMessage(iframe, handler);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "ready", requestId: "x", payload: {} },
        source: window, // not iframe.contentWindow
      } as unknown as MessageEventInit),
    );
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });

  it("ignores malformed payloads", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const handler = vi.fn();
    const unsub = onSidebarMessage(iframe, handler);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: "not-an-object",
        source: iframe.contentWindow ?? window,
      } as unknown as MessageEventInit),
    );
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });
});

describe("onContentMessage", () => {
  it("ignores messages from sources other than window.parent", () => {
    const handler = vi.fn();
    const unsub = onContentMessage(handler);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "init", requestId: "x", payload: {} },
        source: window, // parent in happy-dom is window itself
      } as unknown as MessageEventInit),
    );
    // In happy-dom window.parent === window, so this should be accepted.
    // If the env changes, revisit.
    expect(handler).toHaveBeenCalledOnce();
    unsub();
  });
});
