import { describe, expect, it } from "vitest";
import { ChatFollowupRequestSchema, handleChatFollowup } from "./followup.js";
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
  } as unknown as Parameters<typeof handleChatFollowup>[0];
}

describe("ChatFollowupRequestSchema", () => {
  it("accepts minimal audit + conversation + question", () => {
    const r = ChatFollowupRequestSchema.safeParse({
      auditResult: { specOptimal: { name: "X" } },
      conversation: [{ role: "user", text: "question?" }],
      question: "what about the runner-up?",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing question", () => {
    const r = ChatFollowupRequestSchema.safeParse({
      auditResult: {},
      conversation: [{ role: "user", text: "hi" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects question over 1500 chars", () => {
    const r = ChatFollowupRequestSchema.safeParse({
      auditResult: {},
      conversation: [{ role: "user", text: "hi" }],
      question: "x".repeat(1501),
    });
    expect(r.success).toBe(false);
  });

  it("caps candidates array at 40", () => {
    const cands = Array.from({ length: 50 }, (_, i) => ({ name: `cand${i}` }));
    const r = ChatFollowupRequestSchema.safeParse({
      auditResult: { candidates: cands },
      conversation: [{ role: "user", text: "hi" }],
      question: "ok",
    });
    expect(r.success).toBe(false);
  });
});

describe("handleChatFollowup — no key = graceful fallback", () => {
  it("returns 200 with fallback text when ANTHROPIC_API_KEY is absent", async () => {
    const ctx = mkContext(
      {
        auditResult: { specOptimal: { name: "Breville Bambino" } },
        conversation: [{ role: "user", text: "anything quieter?" }],
        question: "anything quieter?",
      },
      { ANTHROPIC_API_KEY: "" },
    );
    const res = await handleChatFollowup(ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; source: string; text: string };
    expect(body.kind).toBe("answer");
    expect(body.source).toBe("fallback");
    expect(body.text.length).toBeGreaterThan(10);
  });

  it("returns 400 on invalid body", async () => {
    const ctx = mkContext({ wrong: "shape" }, { ANTHROPIC_API_KEY: "" });
    const res = await handleChatFollowup(ctx);
    expect(res.status).toBe(400);
  });
});
