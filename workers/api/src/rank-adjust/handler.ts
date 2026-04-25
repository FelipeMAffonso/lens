// Lens phase-1 commit 3 — natural-language preference adjustment.
//
// Replaces the sliders on the criteriaCard. The user types a plain-language
// change ("make it quieter", "budget is tight at $300", "care more about
// durability") and Opus 4.7 parses it into per-criterion weight deltas. The
// returned criteria flow back into rank.ts deterministic math — the only
// LLM call is the parse; the re-rank itself is pure.
//
// Public endpoint, no auth. Rate-limited via middleware.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";
import { opusExtendedThinking } from "../anthropic.js";

const CriterionSchema = z.object({
  name: z.string().min(1).max(80),
  weight: z.number().min(0).max(1),
  direction: z
    .enum(["higher_is_better", "lower_is_better", "target", "binary"])
    .optional(),
});

const AdjustRequestSchema = z.object({
  criteria: z.array(CriterionSchema).min(1).max(20),
  nlChange: z.string().min(1).max(400),
  category: z.string().optional(),
});

type Criterion = z.infer<typeof CriterionSchema>;

interface AdjustmentOut {
  name: string;
  delta: number;
  reason: string;
}
interface NewCriterionOut {
  name: string;
  weight: number;
  direction: "higher_is_better" | "lower_is_better" | "target" | "binary";
  reason: string;
}
interface OpusOut {
  adjustments: AdjustmentOut[];
  newCriteria?: NewCriterionOut[];
  summary?: string;
}

const SYSTEM = `You are Lens's preference-adjustment engine. The user has a set of weighted criteria for a product ranking and wants to change them in plain language. Parse the change into per-criterion weight deltas.

Return STRICT JSON matching exactly this schema (no prose before or after):
{
  "adjustments": [
    { "name": "<exact criterion name from the user's list>", "delta": <number in [-0.30, 0.30]>, "reason": "<short phrase, 1 sentence>" }
  ],
  "newCriteria": [
    { "name": "<new criterion name, snake_case>", "weight": <0.05 to 0.30>, "direction": "higher_is_better" | "lower_is_better" | "target" | "binary", "reason": "<short phrase>" }
  ],
  "summary": "<one sentence summarising what you changed>"
}

Rules:
- Only adjust criteria the user explicitly addressed. Leave others untouched.
- Cap each delta at ±0.30 per call. Small nudges ≈ ±0.08, big emphasis ≈ ±0.20, "this matters the most" ≈ ±0.30.
- If a user wants more of X, reduce others proportionally by adding negative deltas summing approximately to -(+X). Don't over-compensate.
- If the user introduces a new criterion not in the list, create a newCriteria entry (weight ≤ 0.30). Pick a sensible direction: price / cost / budget → lower_is_better; quality / durability / battery → higher_is_better; size near a target → target.
- If the user sets a hard budget ("$300 max"), interpret as "price matters a lot": adjustment on existing "price" or "cost" with delta +0.20, or new criterion {"name":"price","weight":0.25,"direction":"lower_is_better"} if absent.
- If the user's message is ambiguous or unrelated to ranking (e.g. "tell me more about the top pick"), return {"adjustments":[],"newCriteria":[],"summary":"no preference change detected"}.
- Absolutely no prose outside the JSON.`;

function buildUserPrompt(criteria: Criterion[], nlChange: string, category?: string): string {
  const list = criteria
    .map((c, i) => `${i + 1}. ${c.name} (weight ${c.weight.toFixed(2)}${c.direction ? `, ${c.direction}` : ""})`)
    .join("\n");
  const cat = category ? `\nCategory context: ${category}` : "";
  return `Current criteria:\n${list}${cat}\n\nUser's change: ${nlChange}\n\nReturn the JSON now.`;
}

export function parseOpusJson(text: string): OpusOut | null {
  // Strip fences if present + grab first {...} block.
  const stripped = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Partial<OpusOut>;
    const adjustments = Array.isArray(raw.adjustments)
      ? raw.adjustments
          .filter((a): a is AdjustmentOut => !!a && typeof a.name === "string" && typeof a.delta === "number")
          .map((a) => ({
            name: a.name.trim(),
            delta: Math.max(-0.3, Math.min(0.3, a.delta)),
            reason: typeof a.reason === "string" ? a.reason.slice(0, 140) : "",
          }))
      : [];
    const newCriteria = Array.isArray(raw.newCriteria)
      ? raw.newCriteria
          .filter(
            (n): n is NewCriterionOut =>
              !!n && typeof n.name === "string" && typeof n.weight === "number",
          )
          .map((n): NewCriterionOut => {
            const direction: NewCriterionOut["direction"] =
              n.direction === "lower_is_better" ||
              n.direction === "target" ||
              n.direction === "binary"
                ? n.direction
                : "higher_is_better";
            return {
              name: n.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              weight: Math.max(0.03, Math.min(0.3, n.weight)),
              direction,
              reason: typeof n.reason === "string" ? n.reason.slice(0, 140) : "",
            };
          })
      : [];
    const summary = typeof raw.summary === "string" ? raw.summary.slice(0, 280) : undefined;
    return { adjustments, newCriteria, ...(summary !== undefined ? { summary } : {}) };
  } catch {
    return null;
  }
}

export function applyAndRenormalize(
  criteria: Criterion[],
  adjustments: AdjustmentOut[],
  newCriteria: NewCriterionOut[],
): { updated: Criterion[]; changed: Array<{ name: string; before: number; after: number }> } {
  const byName = new Map(criteria.map((c) => [c.name, { ...c }]));
  const beforeMap = new Map(criteria.map((c) => [c.name, c.weight]));

  // Apply deltas.
  for (const a of adjustments) {
    const existing = byName.get(a.name);
    if (!existing) continue;
    existing.weight = Math.max(0.01, Math.min(0.99, existing.weight + a.delta));
  }
  // Add new criteria.
  for (const n of newCriteria) {
    if (byName.has(n.name)) continue;
    byName.set(n.name, { name: n.name, weight: n.weight, direction: n.direction });
  }

  // Renormalize sum=1.
  const arr = [...byName.values()];
  const sum = arr.reduce((s, c) => s + Math.max(0.01, c.weight), 0);
  const updated = arr.map((c) => ({
    ...c,
    weight: Math.round((Math.max(0.01, c.weight) / sum) * 10000) / 10000,
  }));

  // Trim precision drift so sum rounds to 1.0
  const driftSum = updated.reduce((s, c) => s + c.weight, 0);
  if (updated.length > 0 && Math.abs(driftSum - 1) > 0.0001) {
    updated[0]!.weight = Math.round((updated[0]!.weight + (1 - driftSum)) * 10000) / 10000;
  }

  const changed: Array<{ name: string; before: number; after: number }> = [];
  for (const c of updated) {
    const before = beforeMap.get(c.name);
    if (before === undefined || Math.abs(before - c.weight) > 0.001) {
      changed.push({ name: c.name, before: before ?? 0, after: c.weight });
    }
  }
  return { updated, changed };
}

export async function handleRankAdjust(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = AdjustRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { criteria, nlChange, category } = parsed.data;

  const t0 = Date.now();
  let opusOut: OpusOut | null = null;
  let source: "opus" | "fallback" = "fallback";
  try {
    const user = buildUserPrompt(criteria, nlChange, category);
    const { text } = await opusExtendedThinking(c.env, {
      system: SYSTEM,
      user,
      maxOutputTokens: 600,
      effort: "low",
    });
    opusOut = parseOpusJson(text);
    if (opusOut) source = "opus";
  } catch (err) {
    console.warn("[rank-adjust] opus failed:", (err as Error).message);
  }

  if (!opusOut) {
    // Graceful fallback: return unchanged criteria with a note. The UI can
    // show the user an honest "I couldn't parse that — try rephrasing"
    // message rather than silently changing nothing.
    return c.json({
      ok: false,
      source: "fallback",
      error: "parse_failed",
      message:
        "I couldn't parse that change. Try something specific like \"care more about battery life\", \"budget is tight at $300\", or \"make it quieter\".",
      criteria,
      elapsedMs: Date.now() - t0,
    });
  }

  const { updated, changed } = applyAndRenormalize(
    criteria,
    opusOut.adjustments,
    opusOut.newCriteria ?? [],
  );

  return c.json({
    ok: true,
    source,
    summary: opusOut.summary ?? null,
    criteria: updated,
    changed,
    adjustments: opusOut.adjustments,
    newCriteria: opusOut.newCriteria ?? [],
    elapsedMs: Date.now() - t0,
  });
}
