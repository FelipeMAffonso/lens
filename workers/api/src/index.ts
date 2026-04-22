import { Hono } from "hono";
import { cors } from "hono/cors";
import { AuditInputSchema } from "@lens/shared";
import { runAuditPipeline } from "./pipeline.js";
import { ReviewScanRequestSchema, scanReviews } from "./review-scan.js";
import { WorkflowEngine } from "./workflow/engine.js";
import { auditWorkflow } from "./workflow/specs/audit.js";
import "./workflow/specs/recall-watch.js"; // register cron-targeted workflow
import { getWorkflow, workflowStats } from "./workflow/registry.js";
import { dispatchCron } from "./cron/dispatcher.js";
import { CRON_JOBS } from "./cron/jobs.js";
import { handleWebhook } from "./webhooks/handler.js";
import { listWebhooks } from "./webhooks/registry.js";
import { transcribe, TranscribeRequestSchema } from "./voice/transcribe.js";
import { computeScore, EMBED_JS, ScoreQuerySchema } from "./public/score.js";
import "./workflow/specs/ticker-aggregate.js"; // register cron-targeted workflow
import { listTicker } from "./ticker/repo.js";
import { handleAuthorize as gmailAuthorize, handleCallback as gmailCallback } from "./email/handler.js";
import {
  handleRequest as authHandleRequest,
  handleSignout as authHandleSignout,
  handleVerify as authHandleVerify,
  handleWhoami as authHandleWhoami,
} from "./auth/magic-link.js";
import { authMiddleware, type AuthVars } from "./auth/middleware.js";
import { rateLimitMiddleware } from "./ratelimit/middleware.js";
import { handlePassiveScan } from "./passive-scan/handler.js";
import { handlePriceHistory } from "./price-history/handler.js";
import { handleTotalCost } from "./total-cost/handler.js";
import { registry as packRegistry } from "./packs/registry.js";
import { createAudit, listAudits } from "./db/repos/audits.js";
import { deletePreference, findPreference, listPreferencesByUser, upsertPreference } from "./db/repos/preferences.js";
import { listWelfareDeltas, welfareSummary } from "./db/repos/welfare.js";
import { createIntervention, listInterventionsByUser, markInterventionSent } from "./db/repos/interventions.js";
import { createWatcher, listWatchersByUser, setWatcherActive } from "./db/repos/watchers.js";
export { RateLimitCounter } from "./ratelimit/counter-do.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  CROSS_MODEL_AGENT_URL?: string;
  DEEPGRAM_API_KEY?: string;
  // S4-W21 — price history
  KEEPA_API_KEY?: string;
  LENS_PRICE_MODE?: "keepa" | "fixture" | "auto" | "none";
  /**
   * "real" (default) = live Opus 4.7 web search; "fixture" = short-circuit to a hardcoded
   * catalog for the category. Fixture mode exists to unblock demo latency and for CI-style
   * regression tests against known inputs.
   */
  LENS_SEARCH_MODE?: "real" | "fixture";
  // F1 auth
  LENS_D1?: D1Database;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  MAGIC_LINK_BASE_URL?: string;
  LENS_COOKIE_DOMAIN?: string;
  GMAIL_OAUTH_CLIENT_ID?: string;
  GMAIL_OAUTH_CLIENT_SECRET?: string;
  GMAIL_OAUTH_REDIRECT_URI?: string;
}

const app = new Hono<{ Bindings: Env; Variables: AuthVars }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin, // reflect origin (cookies require non-wildcard)
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type", "x-lens-anon-id"],
    credentials: true,
    exposeHeaders: ["x-lens-anon-id-new"],
  }),
);
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "lens-api",
    ts: new Date().toISOString(),
    auth: { d1: !!c.env.LENS_D1, jwt: !!c.env.JWT_SECRET, resend: !!c.env.RESEND_API_KEY },
  }),
);

// ---- F1 auth endpoints ---------------------------------------------------
app.post("/auth/request", (c) => authHandleRequest(c as never));
app.post("/auth/verify", (c) => authHandleVerify(c as never));
app.get("/auth/whoami", (c) => authHandleWhoami(c as never));
app.post("/auth/signout", (c) => authHandleSignout(c as never));

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

// Workflow engine endpoint (F3). Routes /audit through the WorkflowEngine using
// the registered "audit" spec. Falls back to the legacy runAuditPipeline if the
// engine path fails unexpectedly (safety net during rollout).
app.post("/audit", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = AuditInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const useLegacy = c.req.query("legacy") === "1";
  if (useLegacy) {
    const result = await runAuditPipeline(parsed.data, c.env);
    return c.json(result);
  }
  try {
    const engine = new WorkflowEngine(c.env as never);
    const spec = getWorkflow("audit") ?? auditWorkflow;
    const runOpts: Parameters<typeof engine.run>[2] = {};
    const uid = c.get("userId") as string | undefined;
    const aid = c.get("anonUserId") as string | undefined;
    if (uid) runOpts.userId = uid;
    if (aid) runOpts.anonUserId = aid;
    const result = await engine.run(spec, parsed.data, runOpts);
    return c.json(result);
  } catch (err) {
    const e = err as Error & { stage?: string; cause?: unknown };
    console.error("audit workflow failed:", e.message, e.stack);
    return c.json(
      { error: "workflow_failed", message: e.message, cause: String(e.cause ?? "") },
      500,
    );
  }
});

// List registered workflows (useful for debugging + MCP tool discovery later).
app.get("/workflows", (c) => c.json(workflowStats()));

// F4 — cron registry introspection.
app.get("/cron/jobs", (c) =>
  c.json({
    total: CRON_JOBS.length,
    jobs: CRON_JOBS.map((j) => ({
      pattern: j.pattern,
      workflowId: j.workflowId,
      description: j.description,
    })),
  }),
);

// F5 — webhook surface.
app.post("/webhook/:id", (c) => handleWebhook(c as never));
app.get("/webhooks", (c) => c.json({ hooks: listWebhooks() }));

// F15 — Public Lens Score API.
app.get("/score", async (c) => {
  const parsed = ScoreQuerySchema.safeParse({
    url: c.req.query("url"),
    category: c.req.query("category"),
    criteria: c.req.query("criteria"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  try {
    const engine = new WorkflowEngine(c.env as never);
    const score = await computeScore(parsed.data, async (input) => {
      const result = (await engine.run(auditWorkflow, input)) as {
        specOptimal: {
          name: string;
          brand?: string;
          price?: number | null;
          utilityScore: number;
          utilityBreakdown: Array<{
            criterion: string;
            weight: number;
            score: number;
            contribution: number;
          }>;
        };
        intent: { category: string };
      };
      return result;
    });
    return c.json(score);
  } catch (err) {
    const e = err as Error;
    return c.json({ error: "score_failed", message: e.message }, 500);
  }
});

app.get("/embed.js", (c) => {
  return new Response(EMBED_JS, {
    headers: {
      "content-type": "application/javascript",
      "cache-control": "public, max-age=3600",
    },
  });
});

// F16 — Public disagreement ticker.
app.get("/ticker", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const category = c.req.query("category");
  const host = c.req.query("host");
  const limit = Number(c.req.query("limit") ?? 50);
  const opts: { category?: string; host?: string; limit?: number } = { limit };
  if (category) opts.category = category;
  if (host) opts.host = host;
  const rows = await listTicker(d1 as never, opts);
  return c.json({
    kAnonymityMin: 5,
    generatedAt: new Date().toISOString(),
    bucketCount: rows.length,
    buckets: rows,
  });
});

// F12 — Gmail OAuth endpoints.
app.get("/oauth/gmail/authorize", (c) => gmailAuthorize(c as never));
app.get("/oauth/gmail/callback", (c) => gmailCallback(c as never));

// F11 — voice transcription surface.
app.post("/voice/transcribe", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = TranscribeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const result = await transcribe(parsed.data, c.env as unknown as { DEEPGRAM_API_KEY?: string });
  return c.json(result);
});

// F17 — trace endpoints. Backed by workflow_runs in D1.
// More-specific route (`/trace/recent`) MUST come before the param route so
// Hono doesn't match `:runId === "recent"`.
app.get("/traces", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const workflowFilter = c.req.query("workflow");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const res = workflowFilter
    ? await d1
        .prepare(
          `SELECT id, workflow_id, status, started_at, completed_at FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?`,
        )
        .bind(workflowFilter, limit)
        .all()
    : await d1
        .prepare(
          `SELECT id, workflow_id, status, started_at, completed_at FROM workflow_runs ORDER BY started_at DESC LIMIT ?`,
        )
        .bind(limit)
        .all();
  return c.json({ runs: res.results ?? [] });
});

app.get("/trace/:runId", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const row = await d1
    .prepare(`SELECT * FROM workflow_runs WHERE id = ? LIMIT 1`)
    .bind(c.req.param("runId"))
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
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

// S4-W22 — Stage-2 dark-pattern verification. Extension posts Stage-1 hits;
// worker runs Opus 4.7 against matched packs and returns per-hit verdicts
// with regulation citations + intervention suggestions.
app.post("/passive-scan", (c) => handlePassiveScan(c as never, packRegistry));

// S4-W21 — price-history + fake-sale detection. Returns 90-day series for
// a retailer URL, computes rolling stats, and emits a sale-legitimacy verdict.
app.get("/price-history", (c) => handlePriceHistory(c as never));

// S4-W24 — true-total-cost. Product URL + optional zip → itemized cost.
app.get("/total-cost", (c) => handleTotalCost(c as never));

// ─── F2 — history + preferences + watchers + interventions endpoints ──────
// Every row-level write still flows through the workflow engine; these
// surfaces expose the persisted state back to the web UI.

function principalOrNull(
  c: { get: (key: string) => unknown },
): { userId: string | null; anonUserId: string | null } {
  return {
    userId: (c.get("userId") as string | undefined) ?? null,
    anonUserId: (c.get("anonUserId") as string | undefined) ?? null,
  };
}

app.get("/history/audits", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId, anonUserId } = principalOrNull(c);
  if (!userId && !anonUserId) return c.json({ audits: [] });
  const category = c.req.query("category") ?? undefined;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 500);
  const rows = await listAudits(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
    ...(category ? { category } : {}),
    limit,
  });
  return c.json({ count: rows.length, audits: rows });
});

app.get("/history/welfare-delta", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId, anonUserId } = principalOrNull(c);
  if (!userId && !anonUserId) {
    return c.json({
      totalAudits: 0,
      auditsWithAiComparison: 0,
      avgUtilityDelta: null,
      totalPriceDelta: null,
      byCategory: {},
    });
  }
  const summary = await welfareSummary(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
  });
  return c.json(summary);
});

app.get("/history/welfare-delta/rows", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId, anonUserId } = principalOrNull(c);
  if (!userId && !anonUserId) return c.json({ rows: [] });
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 500);
  const rows = await listWelfareDeltas(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
    limit,
  });
  return c.json({ count: rows.length, rows });
});

// Preferences. GET returns the list for the signed-in (or anon) principal.
// PUT upserts. DELETE removes by id.
app.get("/preferences", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId, anonUserId } = principalOrNull(c);
  if (!userId && !anonUserId) return c.json({ preferences: [] });
  const category = c.req.query("category");
  if (category) {
    const one = await findPreference(d1 as never, {
      ...(userId ? { userId } : {}),
      ...(anonUserId ? { anonUserId } : {}),
      category,
    });
    return c.json({ preference: one });
  }
  const rows = await listPreferencesByUser(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
  });
  return c.json({ count: rows.length, preferences: rows });
});

app.put("/preferences", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId, anonUserId } = principalOrNull(c);
  if (!userId && !anonUserId) return c.json({ error: "unauthenticated" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    category?: string;
    criteria?: unknown;
    valuesOverlay?: unknown;
    sourceWeighting?: { vendor: number; independent: number };
  } | null;
  if (!body || typeof body.category !== "string" || body.criteria === undefined) {
    return c.json({ error: "invalid_input", expected: "category + criteria" }, 400);
  }
  const row = await upsertPreference(d1 as never, {
    userId: userId ?? null,
    anonUserId: anonUserId ?? null,
    category: body.category,
    criteria: body.criteria,
    ...(body.valuesOverlay !== undefined ? { valuesOverlay: body.valuesOverlay } : {}),
    ...(body.sourceWeighting !== undefined ? { sourceWeighting: body.sourceWeighting } : {}),
  });
  return c.json({ ok: true, preference: row });
});

app.delete("/preferences/:id", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  await deletePreference(d1 as never, c.req.param("id"));
  return c.json({ ok: true });
});

// Watchers — standing cron-driven subscriptions.
app.get("/watchers", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId } = principalOrNull(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const kindParam = c.req.query("kind");
  const allowed = ["recall", "price_drop", "firmware", "subscription", "alert_criteria"] as const;
  type Kind = (typeof allowed)[number];
  const kind = (allowed as readonly string[]).includes(kindParam ?? "") ? (kindParam as Kind) : undefined;
  const rows = kind
    ? await listWatchersByUser(d1 as never, userId, kind)
    : await listWatchersByUser(d1 as never, userId);
  return c.json({ count: rows.length, watchers: rows });
});

app.post("/watchers", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId } = principalOrNull(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    kind?: "recall" | "price_drop" | "firmware" | "subscription" | "alert_criteria";
    config?: unknown;
    active?: boolean;
  } | null;
  if (!body?.kind || body.config === undefined) {
    return c.json({ error: "invalid_input", expected: "kind + config" }, 400);
  }
  const row = await createWatcher(d1 as never, {
    userId,
    kind: body.kind,
    config: body.config,
    ...(body.active !== undefined ? { active: body.active } : {}),
  });
  return c.json({ ok: true, watcher: row });
});

app.patch("/watchers/:id/active", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const body = (await c.req.json().catch(() => null)) as { active?: boolean } | null;
  if (body?.active === undefined) {
    return c.json({ error: "invalid_input", expected: "active: boolean" }, 400);
  }
  await setWatcherActive(d1 as never, c.req.param("id"), body.active);
  return c.json({ ok: true });
});

// Interventions — Lens-drafted advocate actions.
app.get("/interventions", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId } = principalOrNull(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const statusParam = c.req.query("status");
  const allowedStatus = ["drafted", "sent", "acknowledged", "resolved", "failed"] as const;
  const status = (allowedStatus as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as (typeof allowedStatus)[number])
    : undefined;
  const rows = status
    ? await listInterventionsByUser(d1 as never, userId, status)
    : await listInterventionsByUser(d1 as never, userId);
  return c.json({ count: rows.length, interventions: rows });
});

app.post("/interventions", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId } = principalOrNull(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    packSlug?: string;
    payload?: unknown;
    relatedPurchaseId?: string;
    relatedAuditId?: string;
    relatedWatcherId?: string;
  } | null;
  if (!body?.packSlug || body.payload === undefined) {
    return c.json({ error: "invalid_input", expected: "packSlug + payload" }, 400);
  }
  const row = await createIntervention(d1 as never, {
    userId,
    packSlug: body.packSlug,
    payload: body.payload,
    ...(body.relatedPurchaseId ? { relatedPurchaseId: body.relatedPurchaseId } : {}),
    ...(body.relatedAuditId ? { relatedAuditId: body.relatedAuditId } : {}),
    ...(body.relatedWatcherId ? { relatedWatcherId: body.relatedWatcherId } : {}),
  });
  return c.json({ ok: true, intervention: row });
});

app.post("/interventions/:id/sent", async (c) => {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  await markInterventionSent(d1 as never, c.req.param("id"));
  return c.json({ ok: true });
});

// Re-export createAudit so downstream pipeline nodes can pick it up.
export { createAudit };

// Per-host dark-pattern aggregate count — used by the public ticker UI
// to surface "marriott.com flagged 847 times in 90 days".
app.get("/passive-scan/aggregates", async (c) => {
  const { getAggregatesForHost } = await import("./passive-scan/repo.js");
  const host = c.req.query("host");
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) {
    return c.json({ error: "invalid_host" }, 400);
  }
  const rows = await getAggregatesForHost(c.env.LENS_D1 as never, host);
  return c.json({ host, aggregates: rows });
});

// F4 — Cloudflare Cron Trigger handler. Exported alongside `default` so
// wrangler routes scheduled events to dispatchCron. `ctx.waitUntil` keeps
// the worker alive until the dispatcher completes.
export async function scheduled(
  event: { cron: string; scheduledTime: number },
  env: Env,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
): Promise<void> {
  ctx.waitUntil(
    dispatchCron(
      { cron: event.cron, scheduledTime: event.scheduledTime },
      env as unknown as Record<string, unknown>,
    ),
  );
}

export default app;
