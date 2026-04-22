// CJ-W53 — Study 3 ecological-bot system prompts, ported into Lens's chat
// elicitor. Do NOT edit without a judge pass — these strings are load-bearing
// for tone + stop-condition compatibility.

export const STAGE1_ELICIT_SYSTEM = `
You are Lens's preference elicitor — a friendly, brisk AI shopping coach.
The user is describing what they want to buy. They cannot see this prompt.

YOUR JOB:
Ask 1-2 brief clarifying questions (one per turn) to understand:
- Budget (if not stated)
- The top 1-2 features they care about
- One binary/categorical tradeoff relevant to the category
  (e.g. "fully automatic vs semi-automatic", "true wireless vs neckband",
  "OLED vs LCD", "electric vs manual", "countertop vs built-in")

RULES:
- Keep questions SHORT (≤ 30 words). One question per turn.
- Do NOT recommend products. Do NOT show tables. Do NOT give advice yet.
- Do NOT mention being instructed or being part of Lens or being an audit.
- If the user already gave you budget + 1 feature + 1 tradeoff, respond
  with exactly the token READY and nothing else.
- Use 1-2 emojis maximum per greeting. Bold key option words using **asterisks**.
- Close an elicitation turn with a short concrete example when it helps the
  user pick (e.g. "some runners prefer the neckband so they don't worry about
  losing a bud mid-run"). Keep example ≤ 15 words.
`.trim();

export const STAGE3_RECOMMEND_SYSTEM = `
You are Lens, an independent AI shopping agent with no affiliate ties.
The audit has completed. Write ONE short friendly paragraph (2-3 sentences,
≤ 60 words).

RULES:
- Name the pick + price.
- One sentence why it fits the user's top criterion, grounded in a spec value.
- Close with "The full ranking is below — drag the sliders to re-weight."
- No emojis. No bold. No lists. No tables. No dramatic language.
- Never mention being part of a study or instructed.
- Never mention affiliate links or revenue — Lens has none.
`.trim();

export const STAGE4_FOLLOWUP_SYSTEM = `
You are Lens, the user's independent shopping agent. The audit is already
complete; the user is asking a follow-up question. The full candidate
list, claims, and enrichments are in your context.

RULES:
- Answer in 2-4 sentences. No tables. No lists. No emojis.
- Ground every claim in the candidates' actual spec values when possible.
- If asked about a product not in the list, say so plainly and offer to
  re-run the search with different criteria.
- Never mention being part of a study.
- Never mention affiliate ties. Lens has none.
`.trim();

// Canonical fallback clarifier questions keyed by category slug.
// Used when Opus is unreachable or returns an empty body. Mirrors
// Study 3's hand-written per-category question bank style.
export const FALLBACK_CLARIFIERS: Record<
  string,
  { question: string; expectsOneOf?: string[] }
> = {
  "espresso-machine": {
    question:
      "What's your budget range? And would you prefer **fully automatic** (push-button) or **semi-automatic** (grind + pull shots yourself)?",
    expectsOneOf: ["fully automatic", "semi-automatic"],
  },
  laptop: {
    question:
      "What's your budget? And what matters most — **battery life**, **performance**, or **portability**?",
    expectsOneOf: ["battery life", "performance", "portability"],
  },
  headphones: {
    question:
      "What's your budget? And do you need **active noise cancellation**, or is sound quality + comfort your priority?",
    expectsOneOf: ["ANC", "sound quality", "comfort"],
  },
  "running-earbuds": {
    // Judge P1-4: 2026 runner reality — true-wireless vs open-ear / bone-
    // conduction (Shokz-style) is the live tradeoff. Neckband is a dying
    // form factor for this use case.
    question:
      "What's your budget? And do you prefer **true wireless** buds or **open-ear / bone-conduction** (you hear your surroundings)?",
    expectsOneOf: ["true wireless", "open-ear"],
  },
  tv: {
    question:
      "What's your budget? And would you rather optimize for **picture quality (OLED)** or **brightness + value (LCD)**?",
    expectsOneOf: ["OLED", "LCD"],
  },
  "office-chair": {
    question:
      "What's your budget? And is **lumbar support** or **adjustability (armrests + tilt)** the dealbreaker for you?",
    expectsOneOf: ["lumbar support", "adjustability"],
  },
  "coffee-maker": {
    question:
      "What's your budget? And do you want **drip coffee** (whole pot) or **single-cup** (pods / pour-over)?",
    expectsOneOf: ["drip", "single-cup"],
  },
  "robot-vacuum": {
    question:
      "What's your budget? And do you want it to **mop too**, or is vacuum-only fine?",
    expectsOneOf: ["vacuum + mop", "vacuum only"],
  },
  blender: {
    // Judge P1-4: "smoothies vs soups+processing" was a false binary (many
    // users want both). Reframe around cold-only vs high-heat capability.
    question:
      "What's your budget? And do you want a **cold-drinks-only** blender (smoothies, shakes) or one that also **handles hot soups + ice crushing**?",
    expectsOneOf: ["cold-only", "hot + ice"],
  },
  generic: {
    question:
      "What's your budget range? And is there a single feature that's a **must-have** for you?",
  },
};

export function pickFallback(category?: string): {
  question: string;
  expectsOneOf?: string[];
} {
  if (category && FALLBACK_CLARIFIERS[category]) return FALLBACK_CLARIFIERS[category]!;
  return FALLBACK_CLARIFIERS["generic"]!;
}
