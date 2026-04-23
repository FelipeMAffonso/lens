// IMPROVEMENT_PLAN_V2 Phase B — shopping-session multi-page capture.
//
// When the user opts in (extension setting), each page they visit on
// retailer hosts during their shopping session is captured via the same
// Opus 4.7 vision path (/visual-audit) AND linked by a session_id in KV.
//
// At the end (or on user request), /shopping-session/summary reads every
// captured page and produces a journey-level report:
//   - price drift across cart → shipping → fee → tax → tip
//   - hidden costs that only appeared on later pages
//   - forced-continuity checkboxes
//   - product switching between "what you viewed" and "what you added"
//
// Sessions are KV-backed, 30-minute TTL. Per-page excerpts pass the
// existing per-host consent gate before upload. No PII persisted.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";
import { OPUS_4_7, client } from "../anthropic.js";

const SESSION_TTL_SECS = 30 * 60;

export const SessionStartSchema = z.object({
  userId: z.string().max(200).optional(),
  consent: z.object({
    multiPage: z.literal(true),
    hostAllowlist: z.array(z.string().max(200)).min(1).max(50),
    minutes: z.number().int().min(5).max(120).default(30),
  }),
});

export const SessionCaptureSchema = z.object({
  sessionId: z.string().min(1).max(64),
  url: z.string().url().max(4000),
  pageKind: z.enum(["product", "search", "cart", "checkout", "confirmation", "other"]),
  visualAuditJson: z.string().min(10).max(500_000), // JSON blob returned by /visual-audit
});

export async function handleSessionStart(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = SessionStartSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  if (!c.env.LENS_KV) return c.json({ error: "KV not bound" }, 503);

  const sessionId = crypto.randomUUID();
  const ttl = Math.min(parsed.data.consent.minutes, 120) * 60;
  const record = {
    sessionId,
    userId: parsed.data.userId ?? null,
    startedAt: new Date().toISOString(),
    consent: parsed.data.consent,
    captures: [] as string[],
  };
  await (c.env.LENS_KV as unknown as KVNamespace).put(
    `session:${sessionId}`,
    JSON.stringify(record),
    { expirationTtl: ttl },
  );
  return c.json({ sessionId, expiresInSeconds: ttl });
}

export async function handleSessionCapture(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = SessionCaptureSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  if (!c.env.LENS_KV) return c.json({ error: "KV not bound" }, 503);

  const kv = c.env.LENS_KV as unknown as KVNamespace;
  const raw = await kv.get(`session:${parsed.data.sessionId}`);
  if (!raw) return c.json({ error: "session_not_found" }, 404);
  const session = JSON.parse(raw) as {
    sessionId: string;
    consent: { hostAllowlist: string[] };
    captures: string[];
  };

  // Verify the capture URL is on the allowlist the user consented to.
  const host = new URL(parsed.data.url).hostname.replace(/^www\./, "");
  const allowed = session.consent.hostAllowlist.some(
    (h) => host === h || host.endsWith("." + h),
  );
  if (!allowed) return c.json({ error: "host_not_in_consent_scope", host }, 403);

  const captureKey = `session:${parsed.data.sessionId}:capture:${Date.now()}`;
  await kv.put(
    captureKey,
    JSON.stringify({
      url: parsed.data.url,
      pageKind: parsed.data.pageKind,
      visualAudit: JSON.parse(parsed.data.visualAuditJson),
      capturedAt: new Date().toISOString(),
    }),
    { expirationTtl: SESSION_TTL_SECS },
  );
  session.captures.push(captureKey);
  await kv.put(
    `session:${parsed.data.sessionId}`,
    JSON.stringify(session),
    { expirationTtl: SESSION_TTL_SECS },
  );
  return c.json({ ok: true, totalCaptures: session.captures.length });
}

export async function handleSessionSummary(c: Context<{ Bindings: Env }>): Promise<Response> {
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "missing_id" }, 400);
  if (!c.env.LENS_KV) return c.json({ error: "KV not bound" }, 503);
  const kv = c.env.LENS_KV as unknown as KVNamespace;

  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) return c.json({ error: "session_not_found" }, 404);
  const session = JSON.parse(raw) as {
    sessionId: string;
    startedAt: string;
    captures: string[];
  };

  const captures = await Promise.all(
    session.captures.map(async (key) => {
      const cap = await kv.get(key);
      return cap ? JSON.parse(cap) : null;
    }),
  );
  const valid = captures.filter((c): c is Record<string, unknown> => c !== null);

  if (valid.length === 0) {
    return c.json({ sessionId, startedAt: session.startedAt, captures: [], summary: null });
  }

  // Summarize with Opus 4.7 if we have a key; otherwise return the raw captures.
  if (!c.env.ANTHROPIC_API_KEY) {
    return c.json({ sessionId, startedAt: session.startedAt, captures: valid, summary: null });
  }

  const anthropic = client(c.env);
  const SYSTEM = `You are the Lens session-analyst. Given the user's visited pages on a
shopping journey, surface the journey-level dark patterns that no single page reveals:
  - price drift (cart subtotal ≠ checkout total by >5%)
  - hidden costs that appear only on later pages
  - forced continuity (free-trial auto-upgrades)
  - dripped-on fees (shipping, service, convenience, tip)
  - bait-and-switch (item viewed ≠ item in cart)
Return JSON: {priceDrift:{from,to,delta_pct}, hiddenCosts:[{name,amount}], forcedContinuity:[{product,terms}], draggedFees:[{label,amount}], switches:[{viewed,inCart}], summary:"one paragraph"}.
If none of these apply, return the schema with empty arrays.`;

  const user = `Session started ${session.startedAt}. ${valid.length} pages captured:\n\n${valid
    .map((c, i) => `[${i}] ${c.pageKind} — ${c.url}\n${JSON.stringify(c.visualAudit).slice(0, 1500)}`)
    .join("\n\n")}`;

  let text = "";
  try {
    const res = (await anthropic.messages.create(
      {
        model: OPUS_4_7,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      } as never,
    )) as unknown as { content: Array<{ type: string; text?: string }> };
    for (const b of res.content) if (b.type === "text" && b.text) text += b.text;
  } catch (err) {
    return c.json({
      sessionId,
      startedAt: session.startedAt,
      captures: valid,
      summary: null,
      error: (err as Error).message,
    });
  }

  text = text.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
  let parsedSummary: unknown = null;
  try {
    parsedSummary = JSON.parse(text);
  } catch {
    parsedSummary = { raw: text.slice(0, 500) };
  }

  return c.json({
    sessionId,
    startedAt: session.startedAt,
    captures: valid,
    summary: parsedSummary,
  });
}

// Cloudflare Worker KV type (inline to avoid cross-package import churn)
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}