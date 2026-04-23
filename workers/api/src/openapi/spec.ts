// VISION #31 — OpenAPI 3.1 spec for Lens's public surface.
// Only enumerates endpoints a third-party integrator would call (auth,
// audit, sku lookup/compare, triggers, shopping-session, visual-audit,
// embed, push, digest, architecture introspection). Internal control-plane
// routes (/admin/*, /webhook/:id, /passive-scan, /cron/*) are intentionally
// omitted — they exist for the extension and cron runner, not partners.

export interface OpenAPIDoc {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string; license: { name: string; url: string } };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
}

const JSON_OK = { description: "Success", content: { "application/json": { schema: { type: "object" } } } };

export function buildOpenAPISpec(baseUrl: string): OpenAPIDoc {
  return {
    openapi: "3.1.0",
    info: {
      title: "Lens API",
      version: "0.1.0",
      description:
        "Lens — AI shopping-agent welfare guardrails. Every response derives from ≥2 independent public sources with confidence and timestamp. No affiliate links, no ranking bias, MIT-licensed.\n\nAll write endpoints expect `application/json`. Cookies carry the session from `/auth/verify`. Schemas here are best-effort; the source of truth is the Zod validator at each route.",
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    },
    servers: [{ url: baseUrl, description: "current deployment" }],
    tags: [
      { name: "core", description: "Service health and architecture introspection." },
      { name: "auth", description: "Magic-link email sign-in. Cookie-based sessions." },
      { name: "audit", description: "The ACTIVE surface — paste a URL, text, or AI transcript, get a welfare verdict." },
      { name: "sku", description: "Triangulated ground-truth catalog. Fuzzy search, detail, compare." },
      { name: "triggers", description: "Privacy-preserving passive monitoring. Hash-only reports, k-anonymity ≥ 5 aggregation." },
      { name: "shopping-session", description: "Multi-page journey capture with consent + 30-min TTL." },
      { name: "visual", description: "Chrome extension screenshot + Opus 4.7 3.75MP vision extraction." },
      { name: "embed", description: "Lens Score widget for third-party publishers." },
      { name: "push", description: "Web Push (VAPID) for recall/firmware/price alerts." },
      { name: "digest", description: "Weekly welfare-delta email digest (Resend)." },
      { name: "ticker", description: "Aggregate disagreement ticker — k-anonymous audit dissent feed." },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["core"],
          summary: "Service health + bindings",
          responses: { "200": JSON_OK },
        },
      },
      "/architecture/stats": {
        get: {
          tags: ["core"],
          summary: "Live data-spine counts (skus, brands, sources, runs)",
          description: "Reads the `architecture_stats` view. Cached 15s.",
          responses: { "200": JSON_OK },
        },
      },
      "/architecture/sources": {
        get: {
          tags: ["core"],
          summary: "Full source registry with last-run status",
          responses: { "200": JSON_OK },
        },
      },
      "/architecture/sources/{id}": {
        get: {
          tags: ["core"],
          summary: "Per-source detail + recent ingestion runs",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": JSON_OK, "404": { description: "Source not registered" } },
        },
      },
      "/architecture/schema": {
        get: {
          tags: ["core"],
          summary: "Sanitized D1 schema (for landing-page diagram)",
          responses: { "200": JSON_OK },
        },
      },
      "/auth/request": {
        post: {
          tags: ["auth"],
          summary: "Request a magic-link email",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
              },
            },
          },
          responses: { "200": JSON_OK, "429": { description: "Rate-limited" } },
        },
      },
      "/auth/verify": {
        post: {
          tags: ["auth"],
          summary: "Exchange magic-link token for a session cookie",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } },
              },
            },
          },
          responses: { "200": JSON_OK, "401": { description: "Invalid or expired token" } },
        },
      },
      "/auth/whoami": {
        get: {
          tags: ["auth"],
          summary: "Return the session user or null",
          responses: { "200": JSON_OK },
        },
      },
      "/auth/signout": {
        post: {
          tags: ["auth"],
          summary: "Clear session cookie",
          responses: { "200": JSON_OK },
        },
      },
      "/audit": {
        post: {
          tags: ["audit"],
          summary: "Run a welfare audit on a URL, free text, or AI recommendation paste",
          description:
            "The main ACTIVE surface. Returns verdicts across ~15 rubrics (affiliate taint, urgency pressure, counterfeit signal, privacy footprint, repairability, recall risk, price fairness, lock-in, specification drift, etc.) each with confidence + source citations.\n\nThe `kind` query param hints routing: `url` (retailer product page), `text` (free-form), or omitted (auto-detect).",
          parameters: [{ name: "kind", in: "query", required: false, schema: { type: "string", enum: ["url", "text"] } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  oneOf: [
                    { required: ["url"], properties: { url: { type: "string", format: "uri" } } },
                    { required: ["text"], properties: { text: { type: "string", minLength: 1 } } },
                  ],
                },
              },
            },
          },
          responses: { "200": JSON_OK, "400": { description: "Invalid body" }, "429": { description: "Rate-limited" } },
        },
      },
      "/sku/search": {
        get: {
          tags: ["sku"],
          summary: "Fuzzy-search the triangulated catalog (FTS5 with LIKE fallback)",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2 } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          ],
          responses: { "200": JSON_OK },
        },
      },
      "/sku/{id}": {
        get: {
          tags: ["sku"],
          summary: "Single SKU detail with triangulated price + sources + recalls",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": JSON_OK, "404": { description: "Unknown SKU" } },
        },
      },
      "/compare": {
        get: {
          tags: ["sku"],
          summary: "Side-by-side comparison of 2-6 SKUs with shared-spec matrix",
          parameters: [
            {
              name: "skus",
              in: "query",
              required: true,
              description: "Comma-separated list of SKU ids, 2-6 entries.",
              schema: { type: "string" },
            },
          ],
          responses: { "200": JSON_OK, "400": { description: "Invalid sku list" } },
        },
      },
      "/triggers/definitions": {
        get: {
          tags: ["triggers"],
          summary: "List the 20 trigger definitions (9 page, 5 email, 2 notification, 4 journey)",
          responses: { "200": JSON_OK },
        },
      },
      "/triggers/report": {
        post: {
          tags: ["triggers"],
          summary: "Report a hashed trigger hit (zero content leaves the client)",
          description:
            "Client derives HMAC-SHA-256 over (definition_id || observed_slot) with a per-user key stored only in IndexedDB. The server sees only hashes. Aggregation only surfaces patterns when ≥ 5 distinct anon ids hash to the same bucket.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["definition_id", "hmac"],
                  properties: {
                    definition_id: { type: "string" },
                    hmac: { type: "string", minLength: 32, maxLength: 128 },
                    observed_slot: { type: "string", description: "Coarse time bucket (hour resolution)." },
                  },
                },
              },
            },
          },
          responses: { "200": JSON_OK },
        },
      },
      "/triggers/aggregate": {
        get: {
          tags: ["triggers"],
          summary: "k-anonymous aggregate counts per trigger (only buckets with k≥5)",
          responses: { "200": JSON_OK },
        },
      },
      "/shopping-session/start": {
        post: {
          tags: ["shopping-session"],
          summary: "Begin a multi-page journey with user consent + host allowlist",
          description: "Returns a session id stored in KV with 30-minute TTL. All subsequent captures key off this id.",
          responses: { "200": JSON_OK, "401": { description: "Auth required" } },
        },
      },
      "/shopping-session/capture": {
        post: {
          tags: ["shopping-session"],
          summary: "Append a visual-audit capture to the current session",
          responses: { "200": JSON_OK },
        },
      },
      "/shopping-session/{id}/summary": {
        get: {
          tags: ["shopping-session"],
          summary: "Opus 4.7 journey-level summary — dark-pattern sequence, price anchor abuse, etc.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": JSON_OK, "404": { description: "Unknown session" } },
        },
      },
      "/visual-audit": {
        post: {
          tags: ["visual"],
          summary: "Extract structured product data from a Chrome extension screenshot",
          description:
            "Opus 4.7 3.75MP vision parses the screenshot into { name, brand, gtin, priceCurrent, rating, seller, claimedOrigin, certifications, specs[], topBullets[], anyUrgencyBadges }. Persisted to `sku_catalog` keyed by `visual:<sha1(url)>` when no barcode is present.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "screenshot"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    screenshot: { type: "string", contentEncoding: "base64" },
                    hint: { type: "string", description: "Optional category hint (e.g. 'headphones')." },
                  },
                },
              },
            },
          },
          responses: { "200": JSON_OK, "413": { description: "Screenshot too large (>3.75MP budget)" } },
        },
      },
      "/embed/lens-score.js": {
        get: {
          tags: ["embed"],
          summary: "Inline JS widget — publishers <script src=…/embed/lens-score.js>",
          responses: { "200": { description: "JavaScript bundle", content: { "application/javascript": { schema: { type: "string" } } } } },
        },
      },
      "/embed/score": {
        get: {
          tags: ["embed"],
          summary: "Return a Lens Score JSON for a retailer URL",
          parameters: [{ name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } }],
          responses: { "200": JSON_OK },
        },
      },
      "/push/vapid-public-key": {
        get: { tags: ["push"], summary: "Fetch the VAPID public key (base64url)", responses: { "200": JSON_OK } },
      },
      "/push/subscribe": {
        post: {
          tags: ["push"],
          summary: "Register a Web Push subscription",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["endpoint", "keys"],
                  properties: {
                    endpoint: { type: "string", format: "uri" },
                    keys: { type: "object", required: ["p256dh", "auth"], properties: { p256dh: { type: "string" }, auth: { type: "string" } } },
                  },
                },
              },
            },
          },
          responses: { "200": JSON_OK },
        },
      },
      "/push/unsubscribe": {
        post: { tags: ["push"], summary: "Remove a Web Push subscription", responses: { "200": JSON_OK } },
      },
      "/digest/preferences": {
        get: {
          tags: ["digest"],
          summary: "Read the signed-in user's digest cadence + delivery window",
          responses: { "200": JSON_OK, "401": { description: "Auth required" } },
        },
        put: {
          tags: ["digest"],
          summary: "Upsert the signed-in user's digest preferences",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    email: { type: "string", format: "email" },
                    cadence: { type: "string", enum: ["weekly", "biweekly", "monthly"] },
                    send_day: { type: "integer", minimum: 0, maximum: 6 },
                    send_hour_utc: { type: "integer", minimum: 0, maximum: 23 },
                    timezone: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": JSON_OK, "401": { description: "Auth required" } },
        },
      },
      "/ticker": {
        get: {
          tags: ["ticker"],
          summary: "Latest k-anonymous disagreement ticker entries",
          responses: { "200": JSON_OK },
        },
      },
      "/packs/stats": {
        get: { tags: ["core"], summary: "Bundled pack counts (rubrics, overlays, stimuli)", responses: { "200": JSON_OK } },
      },
    },
    components: {
      schemas: {
        ErrorEnvelope: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" }, message: { type: "string" }, details: {} },
        },
      },
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "lens_session" },
      },
    },
  };
}
