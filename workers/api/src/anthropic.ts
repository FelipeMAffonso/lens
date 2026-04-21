import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";

// Exact model ID to be confirmed from the kickoff stream / Anthropic docs.
// Candidates seen: "claude-opus-4-7", "claude-opus-4-7-20260420".
export const OPUS_4_7 = "claude-opus-4-7" as const;

export function client(env: Env): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

/**
 * Convenience wrapper that runs an Opus 4.7 call with extended thinking enabled.
 * Returns the final text + the thinking trace.
 */
export async function opusExtendedThinking(
  env: Env,
  opts: {
    system: string;
    user: string | Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }>;
    maxOutputTokens?: number;
    thinkingBudget?: number;
    tools?: Anthropic.Messages.Tool[];
  },
): Promise<{ text: string; thinking: string | null; raw: Anthropic.Messages.Message }> {
  const anthropic = client(env);
  const response = await anthropic.messages.create({
    model: OPUS_4_7,
    max_tokens: opts.maxOutputTokens ?? 4096,
    thinking: {
      type: "enabled",
      budget_tokens: opts.thinkingBudget ?? 4096,
    },
    system: opts.system,
    messages: [
      {
        role: "user",
        content: typeof opts.user === "string" ? [{ type: "text", text: opts.user }] : opts.user,
      },
    ],
    ...(opts.tools ? { tools: opts.tools } : {}),
  } as Anthropic.Messages.MessageCreateParamsNonStreaming);

  let text = "";
  let thinking: string | null = null;
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
    if (block.type === "thinking") thinking = block.thinking;
  }
  return { text, thinking, raw: response };
}
