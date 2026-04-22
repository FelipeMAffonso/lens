import { Hono } from "hono";
import { cors } from "hono/cors";
import { AuditInputSchema } from "@lens/shared";
import { runAuditPipeline } from "./pipeline.js";
import { ReviewScanRequestSchema, scanReviews } from "./review-scan.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  CROSS_MODEL_AGENT_URL?: string;
  /**
   * "real" (default) = live Opus 4.7 web search; "fixture" = short-circuit to a hardcoded
   * catalog for the category. Fixture mode exists to unblock demo latency and for CI-style
   * regression tests against known inputs.
   */
  LENS_SEARCH_MODE?: "real" | "fixture";
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/health", (c) =>
  c.json({ ok: true, service: "lens-api", ts: new Date().toISOString() }),
);

app.get("/packs/stats", async (c) => {
  const { packStats } = await import("./packs/registry.js");
  return c.json(packStats());
});

app.get("/packs/:slug", async (c) => {
  const { registry } = await import("./packs/registry.js");
  const slug = decodeURIComponent(c.req.param("slug"));
  const pack = registry.bySlug.get(slug);
  if (!pack) return c.json({ error: "not_found", slug }, 404);
  return c.json(pack);
});

app.post("/audit", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = AuditInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  try {
    const result = await runAuditPipeline(parsed.data, c.env);
    return c.json(result);
  } catch (err) {
    const e = err as Error & { stage?: string; cause?: unknown };
    console.error("audit pipeline failed:", e.stage ?? "unknown_stage", e.message, e.stack);
    return c.json(
      {
        error: "pipeline_failed",
        stage: e.stage ?? "unknown_stage",
        message: e.message,
        cause: String(e.cause ?? ""),
      },
      500,
    );
  }
});

app.post("/audit/stream", async (c) => {
  // Server-sent-events variant for the live streaming sub-agent panel.
  // Emits events: "extract", "search", "verify", "rank", "crossModel:<provider>", "done", "error".
  const body = await c.req.json().catch(() => null);
  const parsed = AuditInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await runAuditPipeline(parsed.data, c.env, { onEvent: send });
        send("done", { ok: true });
      } catch (err) {
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

/**
 * Workflow W17 — review-authenticity scan.
 * POST /review-scan with { reviews: [{text, date?, rating?, reviewer?}], productName? }
 * Returns { authenticityScore, signalsFound, flaggedReviewIndices, summary, heuristics }.
 * Deterministic heuristics derived from dark-pattern/fake-social-proof pack (FTC 2024
 * Fake Reviews Rule + Fakespot-pattern detection). Fast: no LLM call.
 */
app.post("/review-scan", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ReviewScanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const result = scanReviews(parsed.data);
  return c.json(result);
});

export default app;
