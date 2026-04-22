// S6-W35 — token-substituted Magnuson-Moss letter renderer.
// Tokens that don't land an input become visible [TODO: <name>] placeholders
// so the user sees exactly what they need to fill before sending.

import type { Draft } from "./types.js";

export interface RenderInput {
  subjectTemplate: string;      // from pack.body.template.subject
  bodyTemplate: string;         // from pack.body.template.bodyTemplate
  tokens: Record<string, string | undefined | null>;
}

const TODO_SENTINEL = (name: string): string => `[TODO: ${name}]`;

/**
 * Render a subject + body from templates + tokens map. Missing tokens fall
 * through to [TODO: <key>] so the user never accidentally ships a placeholder.
 */
export function renderDraft(input: RenderInput): Omit<Draft, "to" | "format"> {
  const subject = substitute(input.subjectTemplate, input.tokens);
  const body = substitute(input.bodyTemplate, input.tokens);
  return { subject, body };
}

export function substitute(
  template: string,
  tokens: Record<string, string | undefined | null>,
): string {
  return template.replace(/\{([a-zA-Z0-9_| ]+)\}/g, (match, rawName: string) => {
    // Handle pipe-union placeholders like {return | warranty service | replacement}
    // by always substituting with the caller's chosen value via the `_verb`
    // key, or leaving the union in place as a TODO hint.
    if (rawName.includes("|")) {
      const chosen = tokens._verb;
      return chosen ? String(chosen) : match;
    }
    const key = rawName.trim();
    const value = tokens[key];
    if (value === undefined || value === null || value === "") {
      return TODO_SENTINEL(key);
    }
    return String(value);
  });
}
