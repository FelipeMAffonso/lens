import { beforeEach, describe, expect, it } from "vitest";
import { ConversationStore } from "./ConversationStore.js";

beforeEach(() => {
  localStorage.clear();
});

describe("ConversationStore", () => {
  it("appends turns and returns them in order", () => {
    const s = new ConversationStore("test-1");
    s.append("user", "hi");
    s.append("assistant", "hello");
    s.append("user", "espresso");
    const all = s.all();
    expect(all).toHaveLength(3);
    expect(all[0]?.role).toBe("user");
    expect(all[0]?.text).toBe("hi");
    expect(all[2]?.text).toBe("espresso");
  });

  it("persists across new store instances with the same sessionId", () => {
    const a = new ConversationStore("persist-1");
    a.append("user", "saved?");
    const b = new ConversationStore("persist-1");
    expect(b.all()).toHaveLength(1);
    expect(b.all()[0]?.text).toBe("saved?");
  });

  it("lastUserText returns the most recent user turn", () => {
    const s = new ConversationStore("last-1");
    s.append("user", "first");
    s.append("assistant", "ack");
    s.append("user", "second");
    expect(s.lastUserText()).toBe("second");
  });

  it("returns undefined for lastUserText when empty", () => {
    const s = new ConversationStore("empty-1");
    expect(s.lastUserText()).toBeUndefined();
  });

  it("clear resets turns + storage", () => {
    const s = new ConversationStore("clear-1");
    s.append("user", "thing");
    s.clear();
    expect(s.all()).toHaveLength(0);
    const b = new ConversationStore("clear-1");
    expect(b.all()).toHaveLength(0);
  });

  it("auto-generates a sessionId when none provided", () => {
    const s = new ConversationStore();
    expect(typeof s.sessionId).toBe("string");
    expect(s.sessionId.length).toBeGreaterThan(0);
  });

  it("every appended turn has a unique id", () => {
    const s = new ConversationStore("id-1");
    const a = s.append("user", "a");
    const b = s.append("user", "b");
    expect(a.id).not.toBe(b.id);
  });
});
