// CJ-W53 — /chat/followup handler.
// After the audit card has rendered, the user asks things like "what about
// the De'Longhi?", "any quieter options?", "is the #2 actually better for
// quiet apartments?". This handler answers in 2-4 sentences grounded in the
// already-computed candidates + claims + enrichments. No re-audit.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";
import { OPUS_4_7, client } from "../anthropic.js";
import { STAGE4_FOLLOWUP_SYSTEM } from "./prompts.js";
import { ChatTurnSchema } from "./clarify.js";

// Minimal audit-result shape we read. Looser than AuditResult — keeps the
// follow-up contract decoupled from the full shared type.
const FollowupAuditSchema = z.object({
  intent: z
    .object({
      category: z.string().optional(),
      criteria: z
        .array(z.object({ name: z.string(), weight: z.number(), direction: z.string().optional() }))
        .optional(),
    })
    .optional(),
  specOptimal: z
    .object({
      name: z.string(),
      brand: z.string().optional(),
      price: z.number().nullable().optional(),
      utilityScore: z.number().optional(),
    })
    .optional(),
  candidates: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        brand: z.string().optional(),
        price: z.number().nullable().optional(),
        utilityScore: z.number().optional(),
        specs: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(40)
    .optional(),
  claims: z
    .array(
      z.object({
        attribute: z.string().optional(),
        statedValue: z.string().optional(),
        verdict: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .max(40)
    .optional(),
});

export const ChatFollowupRequestSchema = z.object({
  auditResult: FollowupAuditSchema,
  conversation: z.array(ChatTurnSchema).min(1).max(60),
  question: z.string().min(1).max(1500),
});

export type ChatFollowupRequest = z.infer<typeof ChatFollowupRequestSchema>;

export interface ChatFollowupResponse {
  kind: "answer" | "error";
  text: string;
  source: "opus" | "fallback";
}

// Judge P0-6: expanded affiliate-param allowlist (same as clarify.ts).
const AFFIL_PATTERN = /\b(?:ref|ref_|tag|utm_[a-z_]+|gclid|fbclid|msclkid|ascsubtag|pd_rd_[a-z]+|linkCode|irclickid|clickid|affid|aff_id|aff_sub\d*|aff_trace_key|partner|campaign_id|ranMID|ranSiteID|smid|bltag|sref)=[^\s&#]+/gi;
function scrub(s: string): string {
  return s.replace(AFFIL_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

function compactCandidate(
  c: z.infer<typeof FollowupAuditSchema>["candidates"] extends Array<infer T> | undefined ? T : never,
): string {
  const parts: string[] = [];
  if (c.brand) parts.push(c.brand);
  parts.push(c.name);
  if (c.price != null) parts.push(`$${c.price}`);
  if (typeof c.utilityScore === "number") parts.push(`u=${c.utilityScore.toFixed(3)}`);
  if (c.specs) {
    const top = Object.entries(c.specs)
      .slice(0, 6)
      .map(([k, v]) => `${k}:${typeof v === "string" || typeof v === "number" ? v : "?"}`);
    if (top.length > 0) parts.push(top.join(", "));
  }
  return parts.join(" | ");
}

export async function handleChatFollowup(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = ChatFollowupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ kind: "error", text: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { auditResult, conversation, question } = parsed.data;

  const hasKey = typeof c.env.ANTHROPIC_API_KEY === "string" && c.env.ANTHROPIC_API_KEY.length > 0;
  if (!hasKey) {
    const out: ChatFollowupResponse = {
      kind: "answer",
      text: "I can't run a follow-up right now (offline). The full ranking and Lens's top pick are still visible below — drag the sliders to re-weight if your priorities changed.",
      source: "fallback",
    };
    return c.json(out);
  }

  // Flatten audit into a compact context slug. 1M-context is available but
  // we still keep this dense to save latency + tokens.
  const topCriterion = auditResult.intent?.criteria?.slice().sort((a, b) => b.weight - a.weight)[0]?.name;
  const contextLines: string[] = [];
  if (auditResult.intent?.category) contextLines.push(`CATEGORY: ${auditResult.intent.category}`);
  if (topCriterion) contextLines.push(`TOP CRITERION: ${topCriterion}`);
  if (auditResult.specOptimal) {
    contextLines.push(
      `LENS TOP PICK: ${[auditResult.specOptimal.brand, auditResult.specOptimal.name]
        .filter(Boolean)
        .join(" ")}${auditResult.specOptimal.price != null ? ` ($${auditResult.specOptimal.price})` : ""}`,
    );
  }
  if (auditResult.candidates && auditResult.candidates.length > 0) {
    contextLines.push(
      "CANDIDATES:\n" + auditResult.candidates.slice(0, 12).map((c) => `  - ${compactCandidate(c)}`).join("\n"),
    );
  }
  if (auditResult.claims && auditResult.claims.length > 0) {
    contextLines.push(
      "AI CLAIMS CHECKED:\n" +
        auditResult.claims
          .slice(0, 8)
          .map((cl) => `  - "${cl.attribute ?? "?"}: ${cl.statedValue ?? ""}" → ${cl.verdict ?? "?"}${cl.note ? ` (${cl.note})` : ""}`)
          .join("\n"),
    );
  }

  const recentConversation = conversation
    .slice(-12)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
    .join("\n");

  try {
    const anthropic = client(c.env);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 20_000);
    let res: { content: Array<{ type: string; text?: string }> };
    try {
      res = (await anthropic.messages.create(
        {
          model: OPUS_4_7,
          max_tokens: 500,
          temperature: 0.7,
          system: STAGE4_FOLLOWUP_SYSTEM,
          messages: [
            {
              role: "user",
              content: `${contextLines.join("\n")}\n\nRECENT CONVERSATION:\n${recentConversation}\n\nUSER'S FOLLOW-UP QUESTION: ${question}\n\nAnswer in 2-4 sentences.`,
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
    text = scrub(text);
    if (!text) throw new Error("opus returned empty text");

    const out: ChatFollowupResponse = { kind: "answer", text, source: "opus" };
    return c.json(out);
  } catch (err) {
    console.warn("[chat/followup] Opus failed:", (err as Error).message);
    const out: ChatFollowupResponse = {
      kind: "answer",
      text: "I can't answer that follow-up right now. The full ranking and claim-check is still below — use the sliders to re-weight if something shifted.",
      source: "fallback",
    };
    return c.json(out);
  }
}
