import { Hono } from "hono";
import { cors } from "hono/cors";
import { AuditInputSchema } from "@lens/shared";
import { runAuditPipeline } from "./pipeline.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  CROSS_MODEL_AGENT_URL?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/health", (c) =>
  c.json({ ok: true, service: "lens-api", ts: new Date().toISOString() }),
);

app.post("/audit", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = AuditInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const result = await runAuditPipeline(parsed.data, c.env);
  return c.json(result);
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

export default app;
