// S1-W9 — HTTP glue for POST /compare/framings.
// Precedence: fixture → opus → none.

import type { Context } from "hono";
import { opusExtendedThinking } from "../anthropic.js";
import { findFixture, framingFromFixture, resolvePersona } from "./matcher.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import {
  ComparisonRequestSchema,
  type Framing,
  type FramingResponse,
  type FramingSource,
} from "./types.js";
import { parseFramingJson } from "./verify.js";

interface EnvBindings {
  ANTHROPIC_API_KEY?: string;
}

export async function handleCompare(
  c: Context<{ Bindings: EnvBindings }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = ComparisonRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const req = parsed.data;
  const generatedAt = new Date().toISOString();

  // 1. Fixture match.
  const match = findFixture(req.optionA, req.optionB);
  if (match) {
    const framing = framingFromFixture(match, req.optionA, req.optionB, req.persona);
    const response: FramingResponse = {
      ok: true,
      source: "fixture",
      framing,
      generatedAt,
    };
    return c.json(response);
  }

  // 2. Opus 4.7 fallback when API key is available.
  if (c.env.ANTHROPIC_API_KEY) {
    try {
      const { text } = await opusExtendedThinking(
        { ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY } as never,
        {
          system: buildSystemPrompt(),
          user: buildUserPrompt(
            req.optionA,
            req.optionB,
            req.persona ?? "general",
            req.context,
          ),
          maxOutputTokens: 2048,
          effort: "medium",
        },
      );
      const parsed2 = parseFramingJson(text);
      const framing: Framing = {
        optionA: req.optionA,
        optionB: req.optionB,
        persona: req.persona ?? "general",
        axes: parsed2.axes,
        verdict: parsed2.verdict,
      };
      const response: FramingResponse = {
        ok: true,
        source: "opus" as FramingSource,
        framing,
        generatedAt,
      };
      return c.json(response);
    } catch (err) {
      console.error("[compare] opus:", (err as Error).message);
      // Fall through to the "none" path.
    }
  }

  // 3. None — no fixture, no LLM.
  const response: FramingResponse = {
    ok: true,
    source: "none",
    framing: null,
    reason: c.env.ANTHROPIC_API_KEY
      ? "no fixture match and Opus produced no usable framing"
      : "no fixture match for this comparison, and no LLM configured",
    generatedAt,
  };
  return c.json(response);
}

// re-exported helper for tests that want the matcher-resolved persona
export { resolvePersona };
