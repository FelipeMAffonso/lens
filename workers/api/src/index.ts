import { Hono } from "hono";
import { cors } from "hono/cors";
import { AuditInputSchema } from "@lens/shared";
import { runAuditPipeline } from "./pipeline.js";
import { ReviewScanRequestSchema, scanReviews } from "./review-scan.js";
import { WorkflowEngine } from "./workflow/engine.js";
import { auditWorkflow } from "./workflow/specs/audit.js";
import "./workflow/specs/recall-watch.js"; // register cron-targeted workflow
import "./workflow/specs/firmware-watch.js"; // S7-W38 firmware weekly cron
import { getWorkflow, workflowStats } from "./workflow/registry.js";
import { dispatchCron } from "./cron/dispatcher.js";
import { CRON_JOBS } from "./cron/jobs.js";
import { handleWebhook } from "./webhooks/handler.js";
import { listWebhooks } from "./webhooks/registry.js";
import { transcribe, TranscribeRequestSchema } from "./voice/transcribe.js";
import { computeScore, EMBED_JS, ScoreQuerySchema } from "./public/score.js";
import "./workflow/specs/ticker-aggregate.js"; // register cron-targeted workflow
import "./workflow/specs/ingest-dispatch.js"; // improve-A2 — data-spine ingester cron
import "./workflow/specs/triangulate-price.js"; // improve-A12 — hourly consensus price + discrepancy log
import "./workflow/specs/triangulate-specs.js"; // improve-A12b — hourly spec consensus + disagreement log
import "./workflow/specs/digest-send.js";       // VISION #22 — weekly digest email via Resend
import "./workflow/specs/gmail-poll.js";        // VISION #20 — Gmail receipt poller (every 2h)
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
import { handlePassiveScanProbe } from "./passive-scan/probe.js";
import { handlePriceHistory } from "./price-history/handler.js";
import { handleTotalCost } from "./total-cost/handler.js";
import {
  handleRerank as handleValuesRerank,
  handlePut as handleValuesPut,
  handleGet as handleValuesGet,
} from "./values/handler.js";
import {
  handleScan as handleSubsScan,
  handleList as handleSubsList,
  handleUpcoming as handleSubsUpcoming,
  handlePatch as handleSubsPatch,
  handleDelete as handleSubsDelete,
  handleCancelDraft as handleSubsCancelDraft,
  handleAudit as handleSubsAudit,
} from "./subs/handler.js";
import "./subs/workflow.js"; // register subs.discover workflow
import {
  handleScan as handlePriceRefundScan,
  handleFile as handlePriceRefundFile,
  handleWindows as handlePriceRefundWindows,
} from "./price-refund/handler.js";
import "./price-refund/workflow.js"; // register price.poll workflow
import { handleVerify as handleProvenanceVerify } from "./provenance/handler.js";
import { handleCompatCheck, handleCompatInfo } from "./compat/handler.js";
import {
  handleGet as handleSourceWeightingGet,
  handlePut as handleSourceWeightingPut,
} from "./source-weighting/handler.js";
import { handleBreachHistory } from "./breach/handler.js";
import { handleCheckoutSummary } from "./checkout-summary/handler.js";
import { handleScamAssess } from "./scam/handler.js";
import { handlePrivacyAudit } from "./privacy-audit/handler.js";
import { handleCounterfeitCheck } from "./counterfeit/handler.js";
import { handleSponsorshipScan } from "./sponsorship/handler.js";
import { handleReturnDraft } from "./returns/handler.js";
import {
  handleRecord as handlePerformanceRecord,
  handleRead as handlePerformanceRead,
  handleHistory as handlePerformanceHistory,
} from "./performance/handler.js";
import {
  handleList as handleHouseholdList,
  handleCreate as handleHouseholdCreate,
  handlePatch as handleHouseholdPatch,
  handleDelete as handleHouseholdDelete,
  handleEffective as handlePreferencesEffective,
} from "./household/handler.js";
import { handleScan as handleFirmwareScan } from "./firmware/handler.js";
import {
  handleCreate as handleGiftCreate,
  handleList as handleGiftList,
  handleAudit as handleGiftAudit,
  handleRevoke as handleGiftRevoke,
  handleRecipientGet as handleGiftRecipientGet,
  handleRecipientPost as handleGiftRecipientPost,
} from "./gift/handler.js";
import { handleCompare } from "./compare/handler.js";
import { handleDiscover as handleAccessoryDiscover } from "./accessories/handler.js";
import { handleClarify, handleClarifyApply } from "./clarify/handler.js";
import { handleChatClarify } from "./chat/clarify.js";
import { handleChatFollowup } from "./chat/followup.js";
import { handleRepairabilityLookup } from "./repairability/handler.js";
import { handleLockinCompute } from "./lockin/handler.js";
import { handleRankAdjust } from "./rank-adjust/handler.js";
import { handleCustomerJourneyMap } from "./journey/handler.js";
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
  // S4-W26 — breach history (HIBP paid domain endpoint)
  HIBP_API_KEY?: string;
  // S7-W41 — optional live iFixit API client
  IFIXIT_API_KEY?: string;
  /**
   * "real" (default) = live Opus 4.7 web search; "fixture" = short-circuit to a hardcoded
   * catalog for the category. Fixture mode exists to unblock demo latency and for CI-style
   * regression tests against known inputs.
   */
  LENS_SEARCH_MODE?: "real" | "fixture";
  // User directive 2026-04-22: use Opus only.
  LENS_DISABLE_CROSS_MODEL?: string;
  // F1 auth
  LENS_D1?: D1Database;
  LENS_KV?: KVNamespace;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  MAGIC_LINK_BASE_URL?: string;
  LENS_COOKIE_DOMAIN?: string;
  GMAIL_OAUTH_CLIENT_ID?: string;
  GMAIL_OAUTH_CLIENT_SECRET?: string;
  GMAIL_OAUTH_REDIRECT_URI?: string;
  // improve-A2 — admin key for manual ingester trigger (POST /admin/ingest/:id)
  LENS_ADMIN_KEY?: string;
  LENS_ALLOWED_ORIGINS?: string;
}

const app = new Hono<{ Bindings: Env; Variables: AuthVars }>();

function allowedCorsOrigin(origin: string, env: Env): string | undefined {
  if (!origin) return undefined;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1") return origin;
  } catch {
    return undefined;
  }
  const configured = (env.LENS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = ["https://lens-b1h.pages.dev", "https://lens-api.webmarinelli.workers.dev"];
  return [...defaults, ...configured].includes(origin) ? origin : undefined;
}

function hasAdminAccess(c: { req: { header: (name: string) => string | undefined }; env: Env }): boolean {
  const configured = c.env.LENS_ADMIN_KEY;
  if (!configured) return false;
  const auth = c.req.header("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const header = c.req.header("x-lens-admin-key") ?? "";
  return bearer === configured || header === configured;
}

app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.header("Cross-Origin-Resource-Policy", "cross-origin");
  c.header("X-Frame-Options", "DENY");
  await next();
});

app.use(
  "*",
  cors({
    origin: (origin, c) => allowedCorsOrigin(origin, c.env),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["authorization", "content-type", "x-lens-anon-id", "x-lens-admin-key"],
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

// VISION #31 — OpenAPI 3.1 spec + interactive docs page. Public surface only
// (auth, audit, sku, triggers, shopping-session, visual, embed, push, digest,
// ticker, architecture). Internal cron/webhook/admin routes are omitted.
app.get("/openapi.json", async (c) => {
  const { buildOpenAPISpec } = await import("./openapi/spec.js");
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return c.json(buildOpenAPISpec(baseUrl), 200, { "cache-control": "public, max-age=300" });
});
app.get("/docs", async (c) => {
  const { renderDocsHtml } = await import("./openapi/docs.js");
  const url = new URL(c.req.url);
  const openApiUrl = `${url.protocol}//${url.host}/openapi.json`;
  return c.html(renderDocsHtml(openApiUrl));
});

// ---- F1 auth endpoints ---------------------------------------------------
app.post("/auth/request", (c) => authHandleRequest(c as never));
app.post("/auth/verify", (c) => authHandleVerify(c as never));
app.get("/auth/whoami", (c) => authHandleWhoami(c as never));
app.post("/auth/signout", (c) => authHandleSignout(c as never));

app.get("/packs/stats", async (c) => {
  const { packStats } = await import("./packs/registry.js");
  return c.json(packStats());
});

// improve-E1 — /architecture/stats — live numbers for the landing page.
// Reads the `architecture_stats` view (migration 0010) directly. Zero LLM
// calls. Cached 15s via CF cache-control so landing hydration stays cheap.
app.get("/architecture/stats", async (c) => {
  const d1 = c.env.LENS_D1;
  try {
    if (!d1) throw new Error("d1_unavailable");
    const row = await d1.prepare("SELECT * FROM architecture_stats").first<
      Record<string, string | number | null>
    >();
    const packs = await import("./packs/registry.js").then((m) => m.packStats());
    const payload = {
      ...(row ?? {}),
      packs, // overlay pack counts from the bundled pack registry (not a DB row)
      computed_at: new Date().toISOString(),
    };
    return c.json(payload, 200, {
      "cache-control": "public, max-age=15",
    });
  } catch (err) {
    // Before migration 0010 lands, the view doesn't exist. Serve a
    // best-effort response so the landing page doesn't blank out — pack
    // counts + "data spine bootstrapping" status.
    const packs = await import("./packs/registry.js").then((m) => m.packStats());
    return c.json(
      {
        status: "bootstrapping",
        message: (err as Error).message,
        packs,
        computed_at: new Date().toISOString(),
      },
      200,
      { "cache-control": "public, max-age=15" },
    );
  }
});

// improve-E2 — /architecture/sources — full source registry with live status.
app.get("/architecture/sources", async (c) => {
  const d1 = c.env.LENS_D1;
  try {
    if (!d1) throw new Error("d1_unavailable");
    const { results } = await d1.prepare(
      `SELECT id, name, type, base_url, docs_url, cadence_minutes,
              last_run_at, last_success_at, last_error, rows_total, status,
              description
         FROM data_source
        ORDER BY type, id`,
    ).all();
    return c.json(
      { sources: results ?? [], computed_at: new Date().toISOString() },
      200,
      { "cache-control": "public, max-age=30" },
    );
  } catch (err) {
    return c.json(
      {
        status: "bootstrapping",
        message: (err as Error).message,
        sources: [],
        computed_at: new Date().toISOString(),
      },
      200,
      { "cache-control": "public, max-age=15" },
    );
  }
});

// improve-E3 — /architecture/sources/:id — per-source detail incl. recent runs.
app.get("/architecture/sources/:id", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const d1 = c.env.LENS_D1;
  try {
    if (!d1) throw new Error("d1_unavailable");
    const source = await d1.prepare(
      "SELECT * FROM data_source WHERE id = ?",
    )
      .bind(id)
      .first();
    if (!source) return c.json({ error: "not_found", id }, 404);
    const { results: runs } = await d1.prepare(
      `SELECT id, started_at, finished_at, status, rows_seen, rows_upserted,
              rows_skipped, error_count, duration_ms
         FROM ingestion_run WHERE source_id = ?
        ORDER BY started_at DESC LIMIT 20`,
    )
      .bind(id)
      .all();
    return c.json({ source, recent_runs: runs ?? [] });
  } catch (err) {
    return c.json(
      { status: "bootstrapping", message: (err as Error).message, id },
      200,
    );
  }
});

// Public journey map: the whole consumer-defense surface, with endpoints,
// consent tiers, edge cases, and recovery states. This is intentionally wired
// as an API so the homepage, SDK, and docs stay anchored to the actual app.
app.get("/architecture/journey", (c) => handleCustomerJourneyMap(c as never));

// VISION #17 — Web Push subscribe + VAPID key + unsubscribe.
app.get("/push/vapid-public-key", async (c) => {
  const { handleVapidPublicKey } = await import("./push/handler.js");
  return handleVapidPublicKey(c as never);
});
app.post("/push/subscribe", async (c) => {
  const { handleSubscribe } = await import("./push/handler.js");
  return handleSubscribe(c as never);
});
app.post("/push/unsubscribe", async (c) => {
  const { handleUnsubscribe } = await import("./push/handler.js");
  return handleUnsubscribe(c as never);
});

// VISION #22 — digest preferences (user-facing; cron separately fires delivery).
app.get("/digest/preferences", async (c) => {
  if (!c.env.LENS_D1) return c.json({ bootstrapping: true });
  const userId = c.get("userId" as never) as string | undefined;
  if (!userId) return c.json({ error: "auth_required" }, 401);
  const row = await c.env.LENS_D1.prepare(
    "SELECT email, cadence, send_day, send_hour_utc, timezone, last_sent_at FROM digest_preference WHERE user_id = ?",
  ).bind(userId).first();
  return c.json(row ?? { cadence: "weekly", send_day: 5, send_hour_utc: 14 });
});

app.put("/digest/preferences", async (c) => {
  if (!c.env.LENS_D1) return c.json({ bootstrapping: true }, 503);
  const userId = c.get("userId" as never) as string | undefined;
  if (!userId) return c.json({ error: "auth_required" }, 401);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: "invalid_body" }, 400);
  await c.env.LENS_D1.prepare(
    `INSERT INTO digest_preference (user_id, email, cadence, send_day, send_hour_utc, timezone)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       cadence = excluded.cadence,
       send_day = excluded.send_day,
       send_hour_utc = excluded.send_hour_utc,
       timezone = excluded.timezone`,
  ).bind(
    userId,
    body.email ?? null,
    (body.cadence as string) ?? "weekly",
    (body.send_day as number) ?? 5,
    (body.send_hour_utc as number) ?? 14,
    (body.timezone as string) ?? "America/New_York",
  ).run();
  return c.json({ ok: true });
});

// VISION #32 / CJ-W52 — Lens Score embed widget for third-party publishers.
app.get("/embed/lens-score.js", async (c) => {
  const { handleEmbedJs } = await import("./embed/score.js");
  return handleEmbedJs(c as never);
});
app.get("/embed/score", async (c) => {
  const { handleEmbedScore } = await import("./embed/score.js");
  return handleEmbedScore(c as never);
});

// improve-B-triggers — Lens Triggers, privacy-preserving passive monitoring.
// docs/TRIGGERS.md for the full threat model + privacy contract. Server
// stores only hashes. Zero content ever touches the wire.
app.post("/triggers/report", async (c) => {
  const { handleTriggerReport } = await import("./triggers/handler.js");
  return handleTriggerReport(c as never);
});
app.get("/triggers/definitions", async (c) => {
  const { handleTriggerDefinitions } = await import("./triggers/handler.js");
  return handleTriggerDefinitions(c as never);
});
app.get("/triggers/aggregate", async (c) => {
  const { handleTriggerAggregate } = await import("./triggers/handler.js");
  return handleTriggerAggregate(c as never);
});

// improve-B-session — /shopping-session/* — multi-page shopping journey capture.
app.post("/shopping-session/start", async (c) => {
  const { handleSessionStart } = await import("./shopping-session/handler.js");
  return handleSessionStart(c as never);
});
app.post("/shopping-session/capture", async (c) => {
  const { handleSessionCapture } = await import("./shopping-session/handler.js");
  return handleSessionCapture(c as never);
});
app.get("/shopping-session/:id/summary", async (c) => {
  const { handleSessionSummary } = await import("./shopping-session/handler.js");
  return handleSessionSummary(c as never);
});

// improve-V-VISUAL — /visual-audit — Chrome extension screenshots full page,
// Opus 4.7 3.75MP vision extracts structured product data, we persist it
// into sku_catalog + sku_source_link so robots.txt-blocked pages and
// zero-SKU sites still flow into the triangulated oracle.
app.post("/visual-audit", async (c) => {
  const { handleVisualAudit } = await import("./visual/audit.js");
  return handleVisualAudit(c as never);
});

// improve-A2-debug — /architecture/next-due — show what the dispatcher picks
// on its next tick, plus the REGISTERED filter. Diagnoses stuck null-last-run
// sources and doubles as a transparency touchpoint for judges/users.
app.get("/architecture/next-due", async (c) => {
  if (!c.env.LENS_D1) return c.json({ bootstrapping: true });
  try {
    const { pickDueIngesterIds } = await import("./ingest/framework.js");
    const { REGISTERED } = await import("./ingest/dispatcher.js");
    const due = await pickDueIngesterIds(c.env);
    const available = due.filter((id) => id in REGISTERED);
    const unregistered = due.filter((id) => !(id in REGISTERED));
    return c.json({
      due_total: due.length,
      available: available.slice(0, 20),
      would_attempt: available.slice(0, 2),
      unregistered_due: unregistered,
      registered_total: Object.keys(REGISTERED).length,
      computed_at: new Date().toISOString(),
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// improve-A2-trigger — /architecture/trigger/:id — manually kick an ingester
// (POST, no auth, but rate-limited by the global rateLimitMiddleware). Safe
// because each ingester is idempotent; worst case is extra D1 writes and a
// burned subrequest budget. Judge-friendly: "click to ingest CISA KEV now".
app.post("/architecture/trigger/:id", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  if (!c.env.LENS_ADMIN_KEY) return c.json({ error: "admin_not_configured", id }, 503);
  if (!hasAdminAccess(c)) return c.json({ error: "unauthorized", id }, 401);
  try {
    const { REGISTERED } = await import("./ingest/dispatcher.js");
    const { runIngester } = await import("./ingest/framework.js");
    const ingester = REGISTERED[id];
    if (!ingester) {
      return c.json({ error: "unknown_source", id, registered: Object.keys(REGISTERED) }, 404);
    }
    const result = await runIngester(ingester, c.env);
    return c.json({ ok: true, id, ...result });
  } catch (err) {
    return c.json({ error: (err as Error).message, id }, 500);
  }
});

// improve-E4 — /architecture/schema — sanitized D1 schema for landing diagram.
app.get("/architecture/schema", async (c) => {
  if (!c.env.LENS_D1) return c.json({ bootstrapping: true, tables: [] });
  try {
    const { results } = await c.env.LENS_D1.prepare(
      `SELECT name, sql FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
        ORDER BY name`,
    ).all<{ name: string; sql: string }>();
    const tables = (results ?? []).map((t) => {
      // Strip inline CHECK (json_valid(...)) and keep just column names + types for the diagram.
      const colMatches = Array.from(t.sql.matchAll(/^\s{2,}([a-zA-Z_][\w]*)\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC)/gm));
      const cols = colMatches.map((m) => ({ name: m[1], type: m[2] }));
      return { name: t.name, columnCount: cols.length, columns: cols.slice(0, 20) };
    });
    return c.json({ tables, tableCount: tables.length }, 200, { "cache-control": "public, max-age=300" });
  } catch (err) {
    return c.json({ error: (err as Error).message, tables: [] });
  }
});

// improve-A13 + B1 — /sku/search — FTS5 fuzzy over indexed catalog.
app.get("/sku/search", async (c) => {
  const { handleSkuSearch } = await import("./sku/search.js");
  return handleSkuSearch(c as never);
});

// improve-A13c — /compare — side-by-side comparison of 2-6 SKUs.
app.get("/compare", async (c) => {
  const { handleCompare } = await import("./sku/compare.js");
  return handleCompare(c as never);
});

// improve-A13d — POST /resolve-url — link recognition.
// Takes any retailer URL, extracts { retailer, id, brand, model } and
// tries to look it up in the data spine. Lets the chat + extension
// short-circuit "user pasted an Amazon URL" → matched SKU.
app.post("/resolve-url", async (c) => {
  const { handleResolveUrl } = await import("./sku/resolve-url.js");
  return handleResolveUrl(c as never);
});

// improve-A13b — /sku/:id — single SKU detail.
app.get("/sku/:id", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  if (!c.env.LENS_D1) return c.json({ error: "bootstrapping" }, 503);
  try {
    const sku = await c.env.LENS_D1.prepare(
      `SELECT sc.*, tp.median_cents, tp.p25_cents, tp.p75_cents, tp.n_sources
         FROM sku_catalog sc
         LEFT JOIN triangulated_price tp ON tp.sku_id = sc.id
        WHERE sc.id = ?`,
    ).bind(id).first();
    if (!sku) return c.json({ error: "not_found", id }, 404);
    const { results: sources } = await c.env.LENS_D1.prepare(
      `SELECT source_id, external_url, price_cents, confidence, observed_at
         FROM sku_source_link
        WHERE sku_id = ? AND active = 1
        ORDER BY observed_at DESC`,
    ).bind(id).all();
    const { results: recalls } = await c.env.LENS_D1.prepare(
      `SELECT r.id, r.title, r.severity, r.hazard, r.url, r.published_at
         FROM recall_affects_sku ras JOIN recall r ON r.id = ras.recall_id
        WHERE ras.sku_id = ?
        ORDER BY r.published_at DESC LIMIT 20`,
    ).bind(id).all();
    return c.json({ sku, sources: sources ?? [], recalls: recalls ?? [] });
  } catch (err) {
    return c.json({ error: "server", message: (err as Error).message }, 500);
  }
});

// improve-A2 — manual ingester trigger. Requires admin key.
// Useful for seeding initial data without waiting for the 15-min cron.
app.post("/admin/ingest/:source_id", async (c) => {
  if (!c.env.LENS_ADMIN_KEY) return c.json({ error: "admin_not_configured" }, 503);
  if (!hasAdminAccess(c)) return c.json({ error: "unauthorized" }, 401);
  const sourceId = c.req.param("source_id");
  const { REGISTERED } = await import("./ingest/dispatcher.js");
  const { runIngester } = await import("./ingest/framework.js");
  const ingester = REGISTERED[sourceId];
  if (!ingester) {
    return c.json({ error: "unknown_source", source_id: sourceId, registered: Object.keys(REGISTERED) }, 404);
  }
  const result = await runIngester(ingester, c.env);
  return c.json(result);
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
        } | null;
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

// VISION #23 — drafted-letter outbound via Resend.
// Auth: requires session cookie. Body: { to, subject, body, packSlug?, meta? }.
// Renders a Source-Serif HTML wrapper, posts to Resend, logs to interventions.
app.post("/intervention/send", async (c) => {
  const { handleInterventionSend } = await import("./intervention/send.js");
  return handleInterventionSend(c as never);
});

// VISION #21 — inbound receipt forwarder (HTTP parallel to Email Routing).
// Accepts a parsed receipt from Zapier / Make.com / manual curl / Gmail
// filter webhook → persists to purchases. Auth: session cookie or shared
// bearer token (`x-lens-receipt-token`).
app.post("/email/receipt", async (c) => {
  const { handleReceiptInbound } = await import("./email/receipt-inbound.js");
  return handleReceiptInbound(c as never);
});

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
  // Emits events: "extract", "search", "verify", "rank", "crossModel:<provider>", "result", "done", "error".
  // Judge P1-5 (2026-04-24): adds a final "result" event carrying the full
  // AuditResult so clients can skip a separate /audit POST (was double-firing
  // the pipeline). Backward compat: "done" still fires after "result".
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
        const result = await runAuditPipeline(parsed.data, c.env, { onEvent: send });
        send("result", result);
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
app.post("/passive-scan/probe", (c) => handlePassiveScanProbe(c as never, packRegistry));

// S4-W21 — price-history + fake-sale detection. Returns 90-day series for
// a retailer URL, computes rolling stats, and emits a sale-legitimacy verdict.
app.get("/price-history", (c) => handlePriceHistory(c as never));

// S4-W24 — true-total-cost. Product URL + optional zip → itemized cost.
app.get("/total-cost", (c) => handleTotalCost(c as never));

// CJ-W46 — values overlay reranker + persistence.
app.post("/values-overlay/rerank", (c) => handleValuesRerank(c as never));
app.get("/values-overlay", (c) => handleValuesGet(c as never));
app.put("/values-overlay", (c) => handleValuesPut(c as never));

// S0-W5 — subscription discovery.
app.post("/subs/scan", (c) => handleSubsScan(c as never));
app.post("/subs/audit", (c) => handleSubsAudit(c as never));
app.get("/subs", (c) => handleSubsList(c as never));
app.get("/subs/upcoming", (c) => handleSubsUpcoming(c as never));
app.patch("/subs/:id", (c) => handleSubsPatch(c as never));
app.delete("/subs/:id", (c) => handleSubsDelete(c as never));
app.post("/subs/:id/cancel-draft", (c) => handleSubsCancelDraft(c as never));

// S6-W34 — price-drop refund watcher.
app.get("/price-refund/windows", (c) => handlePriceRefundWindows(c as never));
app.post("/price-refund/scan", (c) => handlePriceRefundScan(c as never));
app.post("/price-refund/:purchaseId/file", (c) => handlePriceRefundFile(c as never));

// S3-W16 — source provenance verification.
app.post("/provenance/verify", (c) => handleProvenanceVerify(c as never));

// S4-W23 — compatibility check.
app.post("/compat/check", (c) => handleCompatCheck(c as never));
app.get("/compat/info", (c) => handleCompatInfo(c as never));

// S2-W13 — vendor-vs-independent source weighting.
app.get("/source-weighting", (c) => handleSourceWeightingGet(c as never));
app.put("/source-weighting", (c) => handleSourceWeightingPut(c as never));

// S4-W26 — seller breach history. Public (no auth) by design.
app.get("/breach-history", (c) => handleBreachHistory(c as never));

// S4-W28 — checkout-readiness summary (composes S4 signals into proceed/hesitate/rethink).
app.post("/checkout/summary", (c) => handleCheckoutSummary(c as never));

// S4-W27 — scam / fraud detection. Public (no auth).
app.post("/scam/assess", (c) => handleScamAssess(c as never));

// S4-W25 — data-disclosure / privacy-policy audit. Public (no auth).
app.post("/privacy-audit", (c) => handlePrivacyAudit(c as never));

// S3-W18 — counterfeit / grey-market check. Public (no auth).
app.post("/counterfeit/check", (c) => handleCounterfeitCheck(c as never));

// S3-W19 — sponsorship scanner. Public (no auth).
app.post("/sponsorship/scan", (c) => handleSponsorshipScan(c as never));

// S6-W35 — returns / warranty claim letter. Requires auth.
app.post("/returns/draft", (c) => handleReturnDraft(c as never));

// S6-W37 — post-purchase performance tracking + Layer-4 preference update.
app.post("/purchase/:id/performance", (c) => handlePerformanceRecord(c as never));
app.get("/purchase/:id/performance", (c) => handlePerformanceRead(c as never));
app.get("/performance/history", (c) => handlePerformanceHistory(c as never));

// CJ-W47 — household profiles + effective preference resolver.
app.get("/household/members", (c) => handleHouseholdList(c as never));
app.post("/household/members", (c) => handleHouseholdCreate(c as never));
app.patch("/household/members/:id", (c) => handleHouseholdPatch(c as never));
app.delete("/household/members/:id", (c) => handleHouseholdDelete(c as never));
app.get("/preferences/effective", (c) => handlePreferencesEffective(c as never));

// S7-W38 — firmware / CVE on-demand scan.
app.post("/firmware/scan", (c) => handleFirmwareScan(c as never));

// S1-W9 — comparative framing help. Public (no auth).
app.post("/compare/framings", (c) => handleCompare(c as never));

// S7-W39 — accessory discovery. Public with productContext; auth-gated when purchaseId.
app.post("/accessories/discover", (c) => handleAccessoryDiscover(c as never));

// S1-W8 — Layer-2 adaptive preference clarification. Public (no auth).
app.post("/clarify", (c) => handleClarify(c as never));
app.post("/clarify/apply", (c) => handleClarifyApply(c as never));

// Oracle phase-1 NL preference adjustment — replaces the sliders. User types
// "make it quieter" / "budget is tight at $300" / "care more about durability".
// Opus parses to per-criterion weight deltas; server renormalizes sum=1 and
// returns updated criteria. The rank.ts deterministic math then re-runs
// client-side against the updated intent. Public (no auth).
app.post("/rank/nl-adjust", (c) => handleRankAdjust(c as never));

// CJ-W53 — Study-3 style conversational elicitor. Public (no auth).
// /chat/clarify returns the next bot turn (a Q or READY); /chat/followup
// answers a post-audit user question using 1M-context + the audit result.
app.post("/chat/clarify", (c) => handleChatClarify(c as never));
app.post("/chat/followup", (c) => handleChatFollowup(c as never));

// S7-W41 — Repairability lookup. Public; iFixit-powered with fixture fallback.
app.post("/repairability/lookup", (c) => handleRepairabilityLookup(c as never));

// S7-W40 — Lock-in cost tracking. Public; ecosystem-fixture accumulator.
app.post("/lockin/compute", (c) => handleLockinCompute(c as never));

// CJ-W48 — gift-buying shared-link flow.
app.post("/gift/requests", (c) => handleGiftCreate(c as never));
app.get("/gift/requests", (c) => handleGiftList(c as never));
app.get("/gift/requests/:id/audit", (c) => handleGiftAudit(c as never));
app.delete("/gift/requests/:id", (c) => handleGiftRevoke(c as never));
app.get("/gift/recipient", (c) => handleGiftRecipientGet(c as never));
app.post("/gift/recipient", (c) => handleGiftRecipientPost(c as never));

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
    profileId?: string | null; // CJ-W47
  } | null;
  if (!body || typeof body.category !== "string" || body.criteria === undefined) {
    return c.json({ error: "invalid_input", expected: "category + criteria" }, 400);
  }
  // CJ-W47 — validate profile ownership when profileId is provided.
  if (body.profileId) {
    if (!userId) {
      return c.json({ error: "profile_requires_signed_in_user" }, 400);
    }
    const { getMember } = await import("./db/repos/household.js");
    const member = await getMember(d1 as never, body.profileId);
    if (!member || member.user_id !== userId) {
      return c.json({ error: "not_found", scope: "profile" }, 404);
    }
    if (member.archived_at !== null) {
      return c.json({ error: "profile_archived", profileId: body.profileId }, 409);
    }
  }
  const row = await upsertPreference(d1 as never, {
    userId: userId ?? null,
    anonUserId: anonUserId ?? null,
    category: body.category,
    criteria: body.criteria,
    ...(body.valuesOverlay !== undefined ? { valuesOverlay: body.valuesOverlay } : {}),
    ...(body.sourceWeighting !== undefined ? { sourceWeighting: body.sourceWeighting } : {}),
    ...(body.profileId !== undefined ? { profileId: body.profileId } : {}),
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
