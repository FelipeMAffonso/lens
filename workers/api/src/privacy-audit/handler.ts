// S4-W25 — /privacy-audit handler.
// Fetch privacy-policy URL → htmlToText → Opus (if ANTHROPIC_API_KEY) →
// heuristic fallback → score + band → response.

import type { Context } from "hono";
import { opusExtendedThinking } from "../anthropic.js";
import { htmlToText } from "../provenance/claim.js";
import { runHeuristicAudit } from "./heuristic.js";
import { buildSystemPrompt, buildUserMessage } from "./prompt.js";
import { bandFor, computeTransparencyScore } from "./score.js";
import {
  PrivacyAuditRequestSchema,
  type PrivacyAudit,
  type PrivacyAuditResponse,
} from "./types.js";
import { EMPTY, parseAuditJson } from "./verify.js";

interface EnvBindings {
  ANTHROPIC_API_KEY?: string;
}

const MAX_BODY_BYTES = 400_000;

function ulid(): string {
  const t = Date.now()
    .toString(32)
    .toUpperCase()
    .replace(/[ILOU]/g, "X")
    .padStart(10, "0")
    .slice(-10);
  const rand = Array.from({ length: 16 }, () =>
    "0123456789ABCDEFGHJKMNPQRSTVWXYZ".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return t + rand;
}

export async function handlePrivacyAudit(
  c: Context<{ Bindings: EnvBindings }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = PrivacyAuditRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { privacyPolicyUrl, productName, vendor } = parsed.data;

  const start = Date.now();
  const runId = ulid();

  let canonicalUrl = privacyPolicyUrl;
  let host = "";
  try {
    const u = new URL(privacyPolicyUrl);
    host = u.hostname.toLowerCase();
    canonicalUrl = `${u.protocol}//${host}${u.pathname}`;
  } catch {
    // keep defaults
  }

  let fetched = false;
  let http: number | undefined;
  let html = "";
  try {
    const res = await fetch(privacyPolicyUrl, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 Lens/1.0" },
    });
    http = res.status;
    if (res.ok) {
      fetched = true;
      const buf = await res.arrayBuffer();
      const bytes = buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf;
      html = new TextDecoder("utf-8").decode(bytes);
    }
  } catch (err) {
    console.error("[privacy-audit] fetch:", (err as Error).message);
  }

  const policyText = fetched ? htmlToText(html) : "";

  let audit: PrivacyAudit;
  let source: "opus" | "heuristic-only" = "heuristic-only";

  if (fetched && c.env.ANTHROPIC_API_KEY && policyText.length > 200) {
    try {
      const { text } = await opusExtendedThinking(
        { ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY } as never,
        {
          system: buildSystemPrompt(),
          user: buildUserMessage({
            url: canonicalUrl,
            policyText,
            ...(productName ? { productName } : {}),
            ...(vendor ? { vendor } : {}),
          }),
          maxOutputTokens: 3072,
          effort: "medium",
        },
      );
      audit = parseAuditJson(text);
      source = "opus";
    } catch (err) {
      console.error("[privacy-audit] opus:", (err as Error).message);
      audit = runHeuristicAudit(policyText);
    }
  } else if (fetched) {
    audit = runHeuristicAudit(policyText);
  } else {
    audit = EMPTY;
  }

  const transparencyScore = computeTransparencyScore(audit);
  const band = bandFor(transparencyScore);

  const response: PrivacyAuditResponse = {
    url: privacyPolicyUrl,
    canonicalUrl,
    host,
    fetched,
    audit,
    transparencyScore,
    band,
    source,
    runId,
    latencyMs: Date.now() - start,
    generatedAt: new Date().toISOString(),
  };
  if (http !== undefined) response.http = http;
  return c.json(response);
}
