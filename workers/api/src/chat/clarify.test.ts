import { describe, expect, it } from "vitest";
import { ChatClarifyRequestSchema } from "./clarify.js";
import { handleChatClarify } from "./clarify.js";
import type { Env } from "../index.js";

function mkContext(body: unknown, env: Partial<Env> = {}) {
  return {
    req: { json: async () => body } as unknown as { json: () => Promise<unknown> },
    env: env as Env,
    json: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  } as unknown as Parameters<typeof handleChatClarify>[0];
}

describe("ChatClarifyRequestSchema", () => {
  it("accepts a minimal turn list", () => {
    const r = ChatClarifyRequestSchema.safeParse({
      turns: [{ role: "user", text: "espresso machine" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty turns", () => {
    const r = ChatClarifyRequestSchema.safeParse({ turns: [] });
    expect(r.success).toBe(false);
  });

  it("rejects invalid roles", () => {
    const r = ChatClarifyRequestSchema.safeParse({
      turns: [{ role: "system", text: "nope" }],
    });
    expect(r.success).toBe(false);
  });

  it("caps text length at 4000", () => {
    const r = ChatClarifyRequestSchema.safeParse({
      turns: [{ role: "user", text: "x".repeat(4001) }],
    });
    expect(r.success).toBe(false);
  });
});

describe("handleChatClarify — stop-logic fast path", () => {
  it("returns {kind:'ready'} when userTurns >= 4", async () => {
    const ctx = mkContext({
      turns: [
        { role: "user", text: "laptop" },
        { role: "assistant", text: "Budget?" },
        { role: "user", text: "under $1000" },
        { role: "assistant", text: "What matters?" },
        { role: "user", text: "battery life" },
        { role: "assistant", text: "Anything else?" },
        { role: "user", text: "and keyboard feel" },
      ],
    });
    const res = await handleChatClarify(ctx);
    const body = (await res.json()) as { kind: string; source?: string };
    expect(body.kind).toBe("ready");
    expect(body.source).toBe("stop-logic");
  });

  it("returns {kind:'ready'} when userTurns >= 3 and bot didn't ask a Q", async () => {
    const ctx = mkContext({
      turns: [
        { role: "user", text: "running earbuds" },
        { role: "assistant", text: "What's your budget?" },
        { role: "user", text: "under $80" },
        { role: "assistant", text: "Great — got it." }, // no ?
        { role: "user", text: "also must be waterproof" },
      ],
    });
    const res = await handleChatClarify(ctx);
    const body = (await res.json()) as { kind: string };
    expect(body.kind).toBe("ready");
  });

  it("returns {kind:'ready'} on the userGaveEverything shortcut", async () => {
    const ctx = mkContext({
      turns: [
        {
          role: "user",
          text: "I want an espresso machine under $200, fully automatic, for home",
        },
      ],
    });
    const res = await handleChatClarify(ctx);
    const body = (await res.json()) as { kind: string };
    expect(body.kind).toBe("ready");
  });
});

describe("handleChatClarify — no ANTHROPIC_API_KEY falls back to canonical Q", () => {
  it("returns a fallback clarifier keyed by category", async () => {
    const ctx = mkContext(
      {
        turns: [{ role: "user", text: "espresso machine" }],
        category: "espresso-machine",
      },
      { ANTHROPIC_API_KEY: "" },
    );
    const res = await handleChatClarify(ctx);
    const body = (await res.json()) as {
      kind: string;
      question: string;
      expectsOneOf?: string[];
      source: string;
    };
    expect(body.kind).toBe("clarify");
    expect(body.source).toBe("fallback");
    expect(body.question).toMatch(/budget/i);
    expect(body.expectsOneOf).toEqual(["fully automatic", "semi-automatic"]);
  });

  it("falls back to generic bank when category is unknown", async () => {
    const ctx = mkContext(
      {
        turns: [{ role: "user", text: "something for my kitchen" }],
        category: "unknown-category-slug",
      },
      { ANTHROPIC_API_KEY: "" },
    );
    const res = await handleChatClarify(ctx);
    const body = (await res.json()) as { kind: string; question: string };
    expect(body.kind).toBe("clarify");
    expect(body.question).toMatch(/budget/i);
  });

  it("rejects invalid input with 400", async () => {
    const ctx = mkContext({ turns: [] });
    const res = await handleChatClarify(ctx);
    expect(res.status).toBe(400);
  });

  it("strips affiliate patterns from fallback text", async () => {
    // Sanity: the canonical bank has no affiliates. This test locks it.
    const ctx = mkContext(
      { turns: [{ role: "user", text: "laptop" }], category: "laptop" },
      { ANTHROPIC_API_KEY: "" },
    );
    const res = await handleChatClarify(ctx);
    const body = (await res.json()) as { question: string };
    expect(body.question).not.toMatch(/ref=|tag=|utm_|gclid|linkCode/i);
  });
});
