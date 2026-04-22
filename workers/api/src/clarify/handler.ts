// S1-W8 — HTTP handlers for /clarify + /clarify/apply.
//
// Public endpoints (no auth). Used by the audit UI when extract.ts returns
// criteria with confidence < threshold.

import type { Context } from "hono";
import type { Env } from "../index.js";
import type { ClarifyResponse } from "./types.js";
import { ClarifyRequestSchema, ClarifyApplyRequestSchema, CONFIDENCE_THRESHOLD } from "./types.js";
import { applyClarificationAnswers, lowConfidenceCriteria } from "./apply.js";
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
  const updated = applyClarificationAnswers(
    { ...intent, rawCriteriaText: intent.rawCriteriaText },
    answers,
  );
  return c.json({ ok: true, intent: updated, updatedAt: new Date().toISOString() });
}
