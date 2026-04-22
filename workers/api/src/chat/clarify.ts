// CJ-W53 — /chat/clarify handler.
// Study-3 ecological-bot shape: Opus reads the conversation, either drafts
// the next clarifier question or returns READY. If Opus is unreachable /
// returns malformed, falls back to a canonical per-category clarifier.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";
import { OPUS_4_7, client } from "../anthropic.js";
import { STAGE1_ELICIT_SYSTEM, pickFallback } from "./prompts.js";
import {
  type ChatTurn,
  isReadyToGenerate,
  userGaveEverything,
  userTurnCount,
} from "./stops.js";

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(4000),
  at: z.string().optional(),
});

export const ChatClarifyRequestSchema = z.object({
  turns: z.array(ChatTurnSchema).min(1).max(60),
  category: z.string().optional(),
  userPrompt: z.string().max(4000).optional(),
});

export type ChatClarifyRequest = z.infer<typeof ChatClarifyRequestSchema>;

export type ChatClarifyResponse =
  | { kind: "clarify"; question: string; expectsOneOf?: string[]; source: "opus" | "fallback" }
  | { kind: "ready"; source: "stop-logic" | "opus" }
  | { kind: "error"; message: string };

// CJ-W53 judge-hardening: strip tracking/affiliate params from any URL Opus
// might embed in a clarifier. Low risk (Stage 1 doesn't recommend products)
// but keeps the affiliate-zero invariant load-bearing across all surfaces.
const AFFIL_PATTERN = /\b(?:ref|tag|utm_[a-z]+|gclid|fbclid|msclkid|ascsubtag|pd_rd_[a-z]+|linkCode)=[^\s&]+/gi;
function scrubClarifierText(s: string): string {
  return s.replace(AFFIL_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

export async function handleChatClarify(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = ChatClarifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ kind: "error", message: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { turns, category, userPrompt } = parsed.data;

  // Hard local gate first — if the stop logic says we're ready, skip Opus.
  if (isReadyToGenerate(turns) || userGaveEverything(turns)) {
    const out: ChatClarifyResponse = { kind: "ready", source: "stop-logic" };
    return c.json(out);
  }

  const hasKey = typeof c.env.ANTHROPIC_API_KEY === "string" && c.env.ANTHROPIC_API_KEY.length > 0;
  if (!hasKey) {
    const fb = pickFallback(category);
    const out: ChatClarifyResponse = {
      kind: "clarify",
      question: scrubClarifierText(fb.question),
      ...(fb.expectsOneOf ? { expectsOneOf: fb.expectsOneOf } : {}),
      source: "fallback",
    };
    return c.json(out);
  }

  // Shape the Opus input as the Study 3 Stage-1 pattern.
  const headerLines = [
    category ? `CATEGORY: ${category}` : null,
    userPrompt ? `USER'S INITIAL ASK: ${userPrompt}` : null,
    `USER TURNS SO FAR: ${userTurnCount(turns)}`,
  ].filter(Boolean);

  const transcript = turns
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
    .join("\n");

  try {
    const anthropic = client(c.env);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 12_000);
    let res: { content: Array<{ type: string; text?: string }> };
    try {
      res = (await anthropic.messages.create(
        {
          model: OPUS_4_7,
          max_tokens: 500,
          temperature: 1.0,
          system: STAGE1_ELICIT_SYSTEM,
          messages: [
            {
              role: "user",
              content: `${headerLines.join("\n")}\n\nCONVERSATION:\n${transcript}\n\nYour next turn (a question OR the literal token READY):`,
            },
          ],
        } as never,
        { signal: controller.signal } as never,
      )) as unknown as { content: Array<{ type: string; text?: string }> };
    } finally {
      clearTimeout(timeoutHandle);
    }

    let text = "";
    for (const block of res.content) {
      if (block.type === "text" && block.text) text += block.text;
    }
    text = text.trim();

    if (/^READY\b/i.test(text)) {
      const out: ChatClarifyResponse = { kind: "ready", source: "opus" };
      return c.json(out);
    }

    const cleaned = scrubClarifierText(text);
    if (cleaned.length === 0 || cleaned.length > 400) {
      throw new Error(`opus returned unusable clarifier (len=${cleaned.length})`);
    }
    const out: ChatClarifyResponse = { kind: "clarify", question: cleaned, source: "opus" };
    return c.json(out);
  } catch (err) {
    console.warn("[chat/clarify] Opus failed:", (err as Error).message);
    const fb = pickFallback(category);
    const out: ChatClarifyResponse = {
      kind: "clarify",
      question: scrubClarifierText(fb.question),
      ...(fb.expectsOneOf ? { expectsOneOf: fb.expectsOneOf } : {}),
      source: "fallback",
    };
    return c.json(out);
  }
}
