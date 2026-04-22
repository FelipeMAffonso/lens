// S3-W16 — fuzzy claim verifier.
// Three stages: exact → normalized → partial-sentence token overlap.

import type { ClaimFoundVia } from "./types.js";

export interface ClaimMatch {
  via: ClaimFoundVia;
  snippet?: string;
}

/**
 * Strip <script>, <style>, tags + collapse whitespace.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentTokens(s: string): string[] {
  // keep alpha tokens ≥ 3 chars (filter short stopwords + digits-only).
  return normalize(s)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "have",
  "has",
  "had",
  "are",
  "was",
  "were",
  "but",
  "not",
  "all",
  "any",
  "you",
  "your",
  "our",
  "its",
]);

export function verifyClaim(rawHtml: string, claim: string): ClaimMatch {
  const text = htmlToText(rawHtml);
  if (!text || !claim.trim()) return { via: "none" };
  const lowerText = text.toLowerCase();

  // Stage 1: exact phrase (case-insensitive).
  const lowerClaim = claim.toLowerCase().trim();
  const exactIdx = lowerText.indexOf(lowerClaim);
  if (exactIdx >= 0) {
    return { via: "exact", snippet: snippetAround(text, exactIdx, claim.length) };
  }

  // Stage 2: normalized (strip punctuation, collapse ws).
  const normalizedText = normalize(text);
  const normalizedClaim = normalize(claim);
  if (normalizedClaim && normalizedText.includes(normalizedClaim)) {
    const idx = normalizedText.indexOf(normalizedClaim);
    return { via: "normalized", snippet: snippetAround(normalizedText, idx, normalizedClaim.length) };
  }

  // Stage 3: partial sentence — ≥ 50% of claim tokens within a 400-char window.
  const claimTokens = contentTokens(claim);
  if (claimTokens.length === 0) return { via: "none" };
  const threshold = Math.ceil(claimTokens.length * 0.5);
  const WINDOW = 400;
  for (let start = 0; start < normalizedText.length; start += 200) {
    const window = normalizedText.slice(start, start + WINDOW);
    const windowTokens = new Set(window.split(/\s+/));
    let hits = 0;
    for (const t of claimTokens) {
      if (windowTokens.has(t)) hits += 1;
      if (hits >= threshold) break;
    }
    if (hits >= threshold) {
      return { via: "partial-sentence", snippet: window.slice(0, 300) };
    }
  }
  return { via: "none" };
}

function snippetAround(text: string, idx: number, len: number): string {
  const before = Math.max(0, idx - 60);
  const after = Math.min(text.length, idx + len + 60);
  return text.slice(before, after).trim();
}
