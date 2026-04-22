// S1-W8 — HTTP handlers for /clarify + /clarify/apply.
//
// Public endpoints (no auth). Used by the audit UI when extract.ts returns
// criteria with confidence < threshold.

import type { Context } from "hono";
import type { Env } from "../index.js";
import type { ClarifyResponse } from "./types.js";
import { ClarifyRequestSchema, ClarifyApplyRequestSchema, CONFIDENCE_THRESHOLD } from "./types.js";
import { applyClarificationAnswers, ClarifyClipZeroedError, lowConfidenceCriteria } from "./apply.js";
import { generateQuestions } from "./generate.js";

export async function handleClarify(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = ClarifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { intent, userPrompt } = parsed.data;
  const lowCriteria = lowConfidenceCriteria(
    { ...intent, rawCriteriaText: intent.rawCriteriaText },
    CONFIDENCE_THRESHOLD,
  );

  if (lowCriteria.length === 0) {
    const out: ClarifyResponse = {
      needsClarification: false,
      questions: [],
      intent,
      source: "skipped",
      generatedAt: new Date().toISOString(),
    };
    return c.json(out);
  }

  const { questions, source } = await generateQuestions(
    { ...intent, rawCriteriaText: intent.rawCriteriaText },
    userPrompt,
    lowCriteria,
    c.env,
  );
  const out: ClarifyResponse = {
    needsClarification: questions.length > 0,
    questions,
    intent,
    source,
    generatedAt: new Date().toISOString(),
  };
  return c.json(out);
}

export async function handleClarifyApply(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = ClarifyApplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { intent, answers } = parsed.data;
  try {
    const updated = applyClarificationAnswers(
      { ...intent, rawCriteriaText: intent.rawCriteriaText },
      answers,
    );
    return c.json({ ok: true, intent: updated, updatedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof ClarifyClipZeroedError) {
      // Judge P1-6: clip zeroed all weights → refuse rather than silently flatten.
      return c.json(
        {
          error: "clip_zeroed_weights",
          message: "The applied answers would zero every weight. Please re-prompt or widen your criteria.",
        },
        422,
      );
    }
    throw err;
  }
}
