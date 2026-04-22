// F6 — host adapter common types + utilities.

export type HostId = "chatgpt" | "claude" | "gemini" | "rufus" | "perplexity" | "unknown";

export interface HostAdapter {
  id: HostId;
  match(url: URL): boolean;
  detectResponses(root: Document | Element): HTMLElement[];
  extractText(el: HTMLElement): string;
  responseAnchor(el: HTMLElement): HTMLElement;
  extractUserPrompt?(el: HTMLElement): string | null;
}

export function txt(el: HTMLElement | null): string {
  return el?.innerText?.trim() ?? "";
}
