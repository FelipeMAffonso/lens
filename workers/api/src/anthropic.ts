import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";

// Released 2026-04-16. Adaptive thinking is the only supported mode on this model.
// Docs: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
export const OPUS_4_7 = "claude-opus-4-7" as const;

export type Effort = "low" | "medium" | "high" | "max";

export function client(env: Env): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

type UserContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >;

/**
 * Run an Opus 4.7 call with adaptive extended thinking.
 * Returns the final text + the thinking trace (may be null if adaptive decided no thinking was needed).
 */
export async function opusExtendedThinking(
  env: Env,
  opts: {
    system: string;
    user: UserContent;
    maxOutputTokens?: number;
    effort?: Effort;
    tools?: Anthropic.Messages.Tool[];
  },
): Promise<{ text: string; thinking: string | null; raw: unknown }> {
  const anthropic = client(env);
  // The Anthropic SDK types lag behind the 4.7 API surface; cast to any for the newer fields
  // (thinking.type: "adaptive", output_config.effort). This will tighten once the SDK catches up.
  const payload: Record<string, unknown> = {
    model: OPUS_4_7,
    max_tokens: opts.maxOutputTokens ?? 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "high" },
    system: opts.system,
    messages: [
      {
        role: "user",
        content: typeof opts.user === "string" ? [{ type: "text", text: opts.user }] : opts.user,
      },
    ],
  };
  if (opts.tools) payload.tools = opts.tools;

  const response = (await anthropic.messages.create(payload as never)) as unknown as {
    content: Array<{ type: string; text?: string; thinking?: string }>;
  };

  let text = "";
  let thinking: string | null = null;
  for (const block of response.content) {
    if (block.type === "text" && block.text) text += block.text;
    if (block.type === "thinking" && block.thinking) thinking = block.thinking;
  }
  return { text, thinking, raw: response };
}
