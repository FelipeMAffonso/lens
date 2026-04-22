import { chatgptAdapter } from "./chatgpt.js";
import { claudeAdapter } from "./claude.js";
import { geminiAdapter } from "./gemini.js";
import { rufusAdapter } from "./rufus.js";
import { perplexityAdapter } from "./perplexity.js";
import type { HostAdapter } from "./common.js";

export const ADAPTERS: HostAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  rufusAdapter,
  perplexityAdapter,
];

export function adapterForUrl(url: URL = new URL(window.location.href)): HostAdapter | null {
  return ADAPTERS.find((a) => a.match(url)) ?? null;
}
