// @lens/sdk — thin, typed wrapper for the Lens welfare-audit API.
// Ships the public surface only (what's in /openapi.json). Internal
// admin routes are not covered. Zero runtime deps (uses global fetch).
//
// Usage:
//   import { LensClient } from "@lens/sdk";
//   const lens = new LensClient({ baseUrl: "https://lens-api.webmarinelli.workers.dev" });
//   const audit = await lens.audit({ kind: "text", raw: "..." });
//   const skus = await lens.sku.search("Breville Bambino");

export interface LensClientOptions {
  /** Base URL of the Lens API worker. Defaults to the canonical deploy. */
  baseUrl?: string;
  /** Optional fetch override (for tests or custom transports). */
  fetch?: typeof fetch;
  /** Optional cookie for authenticated routes (digest prefs, etc.). */
  sessionCookie?: string;
  /** Optional custom headers merged into every request. */
  headers?: Record<string, string>;
}

const DEFAULT_BASE = "https://lens-api.webmarinelli.workers.dev";

export interface AuditInput {
  kind: "text" | "query" | "url" | "image" | "photo";
  source?: "chatgpt" | "claude" | "gemini" | "rufus" | "unknown";
  raw?: string;
  userPrompt?: string;
  url?: string;
  imageBase64?: string;
  category?: string;
}

export interface SkuSearchParams {
  q: string;
  limit?: number;
  brand?: string;
  category?: string;
}

export interface ArchitectureStats {
  skus_active?: number;
  skus_total?: number;
  sources_healthy?: number;
  sources_configured?: number;
  recalls_total?: number;
  advisories_total?: number;
  regulations_in_force?: number;
  brands_known?: number;
  last_successful_run?: string;
  packs?: Record<string, number>;
  computed_at?: string;
}

export class LensError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = "LensError";
  }
}

export class LensClient {
  private readonly base: string;
  private readonly fetcher: typeof fetch;
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: LensClientOptions = {}) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.fetcher = opts.fetch ?? globalThis.fetch;
    this.extraHeaders = { ...(opts.headers ?? {}) };
    if (opts.sessionCookie) this.extraHeaders["cookie"] = opts.sessionCookie;
  }

  private async send<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetcher(`${this.base}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body && !(init.headers as Record<string, string> | undefined)?.["content-type"]
          ? { "content-type": "application/json" }
          : {}),
        ...this.extraHeaders,
        ...((init.headers as Record<string, string>) ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = text;
    if (text) {
      try { body = JSON.parse(text); } catch { /* leave as text */ }
    }
    if (!res.ok) {
      const msg = typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
      throw new LensError(msg, res.status, body);
    }
    return body as T;
  }

  /** GET /health — liveness + binding presence. */
  health(): Promise<{ ok: boolean; service: string; ts: string }> {
    return this.send("/health");
  }

  /** GET /architecture/stats — live data-spine counters. */
  architectureStats(): Promise<ArchitectureStats> {
    return this.send("/architecture/stats");
  }

  /** GET /architecture/sources — full source registry. */
  architectureSources(): Promise<{ sources: Array<Record<string, unknown>>; computed_at: string }> {
    return this.send("/architecture/sources");
  }

  /** POST /audit — run a welfare audit on text / url / query / image. */
  audit(input: AuditInput): Promise<Record<string, unknown>> {
    return this.send("/audit", { method: "POST", body: JSON.stringify(input) });
  }

  /** /sku/* namespace — fuzzy search, detail, compare. */
  sku = {
    search: (params: SkuSearchParams | string): Promise<{ skus: Array<Record<string, unknown>>; q: string; count: number }> => {
      const p = typeof params === "string" ? { q: params } : params;
      const qs = new URLSearchParams({ q: p.q });
      if (p.limit) qs.set("limit", String(p.limit));
      if (p.brand) qs.set("brand", p.brand);
      if (p.category) qs.set("category", p.category);
      return this.send(`/sku/search?${qs.toString()}`);
    },
    get: (id: string): Promise<Record<string, unknown>> => {
      return this.send(`/sku/${encodeURIComponent(id)}`);
    },
    compare: (ids: string[]): Promise<Record<string, unknown>> => {
      const qs = new URLSearchParams({ skus: ids.join(",") });
      return this.send(`/compare?${qs.toString()}`);
    },
  };

  /** /triggers/* — privacy-preserving passive monitoring. */
  triggers = {
    definitions: (): Promise<{ definitions: Array<Record<string, unknown>> }> => this.send("/triggers/definitions"),
    report: (body: { definition_id: string; hmac: string; observed_slot?: string }): Promise<Record<string, unknown>> =>
      this.send("/triggers/report", { method: "POST", body: JSON.stringify(body) }),
    aggregate: (): Promise<Record<string, unknown>> => this.send("/triggers/aggregate"),
  };

  /** /shopping-session/* — multi-page dark-pattern capture. */
  shoppingSession = {
    start: (body?: Record<string, unknown>): Promise<{ id: string } & Record<string, unknown>> =>
      this.send("/shopping-session/start", { method: "POST", body: JSON.stringify(body ?? {}) }),
    capture: (body: { sessionId: string; page: Record<string, unknown> }): Promise<Record<string, unknown>> =>
      this.send("/shopping-session/capture", { method: "POST", body: JSON.stringify(body) }),
    summary: (id: string): Promise<Record<string, unknown>> =>
      this.send(`/shopping-session/${encodeURIComponent(id)}/summary`),
  };

  /** /visual-audit — Chrome extension screenshot extraction via Opus 4.7 vision. */
  visualAudit(body: { url: string; screenshot: string; hint?: string }): Promise<Record<string, unknown>> {
    return this.send("/visual-audit", { method: "POST", body: JSON.stringify(body) });
  }

  /** /push/* — Web Push (VAPID). */
  push = {
    vapidPublicKey: (): Promise<{ publicKey: string }> => this.send("/push/vapid-public-key"),
    subscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Record<string, unknown>> =>
      this.send("/push/subscribe", { method: "POST", body: JSON.stringify(body) }),
    unsubscribe: (body: { endpoint: string }): Promise<Record<string, unknown>> =>
      this.send("/push/unsubscribe", { method: "POST", body: JSON.stringify(body) }),
  };

  /** /ticker — k-anonymous disagreement aggregates. */
  ticker(): Promise<{ kAnonymityMin: number; generatedAt: string; bucketCount: number; buckets: unknown[] }> {
    return this.send("/ticker");
  }

  /** /embed/score?url=... — Lens Score for a retailer URL (widget data). */
  embedScore(url: string): Promise<Record<string, unknown>> {
    return this.send(`/embed/score?url=${encodeURIComponent(url)}`);
  }

  /** POST /email/receipt — inbound receipt forwarder (VISION #21). */
  emailReceipt(body: {
    subject: string;
    from?: string;
    date?: string;
    product?: string;
    priceCents?: number;
    retailer?: string;
    rawBody?: string;
  }): Promise<Record<string, unknown>> {
    return this.send("/email/receipt", { method: "POST", body: JSON.stringify(body) });
  }

  /** POST /intervention/send — dispatch a drafted letter via Resend (VISION #23). */
  interventionSend(body: {
    to: string;
    subject: string;
    body: string;
    packSlug?: string;
    meta?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return this.send("/intervention/send", { method: "POST", body: JSON.stringify(body) });
  }

  /** GET /architecture/next-due — dispatcher queue preview. */
  architectureNextDue(): Promise<Record<string, unknown>> {
    return this.send("/architecture/next-due");
  }

  /** POST /architecture/trigger/:id — manually run an ingester. */
  architectureTrigger(id: string): Promise<Record<string, unknown>> {
    return this.send(`/architecture/trigger/${encodeURIComponent(id)}`, { method: "POST", body: "{}" });
  }

  /** /digest/preferences — user's weekly-digest settings (requires session cookie). */
  digest = {
    getPreferences: (): Promise<Record<string, unknown>> => this.send("/digest/preferences"),
    setPreferences: (prefs: Record<string, unknown>): Promise<Record<string, unknown>> =>
      this.send("/digest/preferences", { method: "PUT", body: JSON.stringify(prefs) }),
  };
}

export default LensClient;
