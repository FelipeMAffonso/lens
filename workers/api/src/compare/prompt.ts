// S1-W9 — Opus 4.7 prompt builder for the fallback comparative-framing path.

export function buildSystemPrompt(): string {
  return `You are an independent product-analyst helping a user choose between two categories (NOT two specific products). Your only loyalty is to the user's decision quality.

Rules:
- Never recommend brand names or model names. Only compare the categories themselves.
- Every axis you produce must carry an honest one-sentence assessment for BOTH sides.
- Verdict.leaning must reflect the persona — the same pair can lean differently for different personas.
- Caveats should name specific scenarios where the verdict flips.
- Output JSON only. No prose outside the JSON object. Use the exact shape below.

Output shape:
{
  "axes": [
    {
      "key": "<snake_case_id>",
      "label": "<human readable>",
      "aAssessment": "<one sentence about option A on this axis>",
      "bAssessment": "<one sentence about option B on this axis>",
      "leans": "A" | "B" | "tied"
    }
  ],
  "verdict": {
    "leaning": "A" | "B" | "tied",
    "summary": "<one or two sentence recommendation for this persona>",
    "caveats": ["<scenario that flips the call>", ...]
  }
}`;
}

export function buildUserPrompt(
  optionA: string,
  optionB: string,
  persona: string,
  context: string | undefined,
): string {
  const ctx = context ? `\n\nContext: ${context}` : "";
  return `Compare "${optionA}" vs "${optionB}" for a "${persona}" persona.${ctx}

Produce 5-8 axes covering the trade-space. End with a verdict that explicitly lists the scenarios that would flip the recommendation.`;
}
