import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleCompare } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: { ANTHROPIC_API_KEY?: string } }>();
  app.post("/compare/framings", (c) => handleCompare(c as never));
  return app;
}

describe("POST /compare/framings", () => {
  it("400 on invalid body", async () => {
    const r = await buildApp().request(
      "/compare/framings",
      { method: "POST", headers: { "content-type": "application/json" }, body: "not-json" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("400 when optionA === optionB", async () => {
    const r = await buildApp().request(
      "/compare/framings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionA: "ipad", optionB: "ipad" }),
      },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("returns source=fixture for a known pair (mirrorless vs dslr)", async () => {
    const r = await buildApp().request(
      "/compare/framings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionA: "mirrorless", optionB: "dslr", persona: "beginner" }),
      },
      {},
    );
    const body = (await r.json()) as {
      source: string;
      framing: { axes: unknown[]; verdict: { summary: string } };
    };
    expect(r.status).toBe(200);
    expect(body.source).toBe("fixture");
    expect(body.framing.axes.length).toBeGreaterThan(3);
    expect(body.framing.verdict.summary.length).toBeGreaterThan(10);
  });

  it("preserves user-provided option names in the response", async () => {
    const r = await buildApp().request(
      "/compare/framings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionA: "DSLR camera", optionB: "mirrorless body" }),
      },
      {},
    );
    const body = (await r.json()) as { framing: { optionA: string; optionB: string } };
    expect(body.framing.optionA).toBe("DSLR camera");
    expect(body.framing.optionB).toBe("mirrorless body");
  });

  it("different personas produce different verdicts", async () => {
    const call = async (persona: string) => {
      const r = await buildApp().request(
        "/compare/framings",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ optionA: "ipad", optionB: "laptop", persona }),
        },
        {},
      );
      return (await r.json()) as { framing: { verdict: { summary: string; leaning: string } } };
    };
    const student = await call("student");
    const casual = await call("casual");
    expect(student.framing.verdict.summary).not.toBe(casual.framing.verdict.summary);
  });

  it("returns source=none when no fixture matches and no ANTHROPIC_API_KEY", async () => {
    const r = await buildApp().request(
      "/compare/framings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionA: "gas stove", optionB: "induction cooktop" }),
      },
      {},
    );
    const body = (await r.json()) as { source: string; framing: null; reason: string };
    expect(r.status).toBe(200);
    expect(body.source).toBe("none");
    expect(body.framing).toBeNull();
    expect(body.reason).toContain("no LLM configured");
  });

  it("covers all 6 canonical comparisons via fixture", async () => {
    const cases: Array<[string, string]> = [
      ["mirrorless", "dslr"],
      ["ipad", "laptop"],
      ["electric vehicle", "hybrid"],
      ["kindle", "tablet"],
      ["android", "iphone"],
      ["mechanical keyboard", "membrane keyboard"],
    ];
    for (const [a, b] of cases) {
      const r = await buildApp().request(
        "/compare/framings",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ optionA: a, optionB: b }),
        },
        {},
      );
      const body = (await r.json()) as { source: string };
      expect(body.source).toBe("fixture");
    }
  });

  it("honors a context field without breaking", async () => {
    const r = await buildApp().request(
      "/compare/framings",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionA: "mirrorless", optionB: "dslr", context: "hiking trips" }),
      },
      {},
    );
    expect(r.status).toBe(200);
  });
});
