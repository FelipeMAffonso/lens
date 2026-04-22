// S4-W22 — HTTP glue for POST /passive-scan.
// Validates input, dispatches to verifyHits, persists, responds.

import type { Context } from "hono";
import type { PackRegistry } from "@lens/shared";
import { opusExtendedThinking } from "../anthropic.js";
import type { Env } from "../index.js";
import { persistScan } from "./repo.js";
import {
  PassiveScanRequestSchema,
  type PassiveScanResponse,
} from "./types.js";
import { verifyHits, type OpusClient } from "./verify.js";

// Crockford base32 ULID, inlined here to avoid pulling in yet another dep.
// Runtime-only: not cryptographically critical since runId is observability-facing.
function ulid(): string {
  const t = Date.now();
  const timePart = t
    .toString(32)
    .toUpperCase()
    .replace(/[ILOU]/g, "X")
    .padStart(10, "0")
    .slice(-10);
  const rand = Array.from({ length: 16 }, () =>
    "0123456789ABCDEFGHJKMNPQRSTVWXYZ".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return timePart + rand;
}

function opusClient(env: Env): OpusClient | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return {
    async call({ system, user, maxOutputTokens }) {
      const opts: Parameters<typeof opusExtendedThinking>[1] = {
        system,
        user,
        effort: "medium",
      };
      if (maxOutputTokens !== undefined) opts.maxOutputTokens = maxOutputTokens;
      const { text } = await opusExtendedThinking(env, opts);
      return text;
    },
  };
}

/**
 * Top-level request handler. Accepts a Hono Context; returns a JSON Response.
 */
export async function handlePassiveScan(
  c: Context<{ Bindings: Env; Variables: { userId?: string; anonUserId?: string } }>,
  registry: PackRegistry,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = PassiveScanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }

  const req = parsed.data;
  const start = Date.now();
  const runId = ulid();
  const opus = opusClient(c.env);

  const { confirmed, dismissed, ran } = await verifyHits(req, registry, opus);
  const latencyMs = Date.now() - start;

  const response: PassiveScanResponse = {
    confirmed,
    dismissed,
    latencyMs,
    ran,
    runId,
  };

  // Persist — fire-and-forget; awaited so errors surface in worker logs but
  // caller still gets the response if persist happens to hang (pushed with
  // waitUntil in a future iteration once the Worker ctx is plumbed through).
  await persistScan(c.env.LENS_D1 as never, {
    runId,
    host: req.host,
    pageType: req.pageType,
    ...(req.url ? { url: req.url } : {}),
    hitCount: req.hits.length,
    confirmedCount: confirmed.filter((h) => h.verdict === "confirmed").length,
    latencyMs,
    ran,
    userId: c.get("userId") ?? null,
    anonUserId: c.get("anonUserId") ?? null,
    confirmed,
    dismissed,
  });

  return c.json(response);
}
