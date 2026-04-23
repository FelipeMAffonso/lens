// IMPROVEMENT_PLAN_V2 Rubric-D-Opus47 — self-verification pass.
//
// "Self-verification" is a marketed-new capability of Opus 4.7 — the model
// critiques its own output before committing. Lens uses this on the audit
// pipeline's VERIFY stage: after Opus generates claim verdicts against
// spec sheets, a second Opus call (same model, xhigh effort) reads the
// verdicts + the evidence and hunts for the model's own mistakes:
//
//   - Called TRUE but the cited spec doesn't actually support it.
//   - Called FALSE but a reasonable reading of the spec does support it.
//   - Internal inconsistency (one claim says 15bar, another says 9bar).
//
// Returns a revision set that the verify stage merges. Flagged claims
// flip from TRUE/FALSE to "uncertain" with the self-critique note.
//
// This is the rubric-targeted Opus 4.7 moment: not reachable on 4.6 at the
// same accuracy or latency (4.7's reflection depth is load-bearing here).

import type { Claim, Candidate } from "@lens/shared";
import { OPUS_4_7, client } from "../anthropic.js";
import type { Env } from "../index.js";

export interface SelfCritique {
  claimIndex: number;
  originalVerdict: string;
  suggestedVerdict: "true" | "false" | "misleading" | "uncertain";
  reasoning: string;
  confidenceShift: number;
}

const SYSTEM = `You are a critic for Lens's claim verification. The audit just
finished ranking candidates against an AI's claimed reasons. You receive:

  1. The original verdicts with their evidence citations.
  2. The full spec sheets for every candidate.
  3. The user's original criteria.

Your job: find ONLY the mistakes. Do NOT re-approve correct verdicts. Be strict.
Output a JSON array of revisions, each with:
  {
    "claimIndex": N,
    "originalVerdict": "true|false|misleading|unverifiable",
    "suggestedVerdict": "true|false|misleading|uncertain",
    "reasoning": "one sentence — what the evidence actually shows",
    "confidenceShift": -0.3 to +0.3
  }

If no revisions, return [].

Rules:
- If the cited spec doesn't actually support the TRUE verdict → downgrade to "uncertain" or "false".
- If a FALSE verdict was wrong — the spec DOES support — upgrade.
- If two verdicts in the same audit contradict each other (e.g. 15bar + 9bar
  for the same product), flag both as "uncertain".
- Prefer "uncertain" over a hard flip unless you're very sure.
- No prose. No markdown. Just the JSON array.`.trim();

export async function runSelfVerification(
  env: Env,
  claims: Claim[],
  candidates: Candidate[],
  userCriteria: string,
): Promise<SelfCritique[]> {
  if (!env.ANTHROPIC_API_KEY || claims.length === 0) return [];

  const anthropic = client(env);
  const user = `USER CRITERIA: ${userCriteria}

ORIGINAL VERDICTS (indexed):
${claims
  .slice(0, 40)
  .map(
    (c, i) =>
      `[${i}] claim="${c.raw}"  verdict="${c.verdict}"  evidence="${(c.evidence ?? "").slice(0, 200)}"`,
  )
  .join("\n")}

CANDIDATE SPEC SHEETS:
${candidates
  .slice(0, 8)
  .map(
    (c, i) =>
      `--- Candidate ${i}: ${c.brand ?? ""} ${c.name} ---\n${JSON.stringify(c.specs ?? {}, null, 2).slice(0, 2000)}`,
  )
  .join("\n\n")}

Return the JSON revisions array. Be strict — only flag real mistakes.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let text = "";
  try {
    const res = (await anthropic.messages.create(
      {
        model: OPUS_4_7,
        max_tokens: 1500,
        // Use the extended-thinking capability (Opus 4.7 "adaptive thinking")
        // for the self-critique reasoning.
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      } as never,
      { signal: controller.signal } as never,
    )) as unknown as { content: Array<{ type: string; text?: string }> };
    for (const b of res.content) if (b.type === "text" && b.text) text += b.text;
  } catch (err) {
    console.warn("[self-verify] call failed:", (err as Error).message);
    return [];
  } finally {
    clearTimeout(timer);
  }

  text = text.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r: unknown): r is SelfCritique => {
      return (
        typeof r === "object" &&
        r !== null &&
        typeof (r as SelfCritique).claimIndex === "number" &&
        typeof (r as SelfCritique).suggestedVerdict === "string"
      );
    });
  } catch {
    return [];
  }
}

/** Apply critiques to the claim list in place; returns count of changes. */
export function applyCritiques(claims: Claim[], critiques: SelfCritique[]): number {
  let n = 0;
  for (const crit of critiques) {
    const c = claims[crit.claimIndex];
    if (!c) continue;
    if (c.verdict !== crit.suggestedVerdict) {
      c.verdict = crit.suggestedVerdict as Claim["verdict"];
      c.evidence = `[self-verification] ${crit.reasoning} (was: ${crit.originalVerdict})`;
      n++;
    }
  }
  return n;
}