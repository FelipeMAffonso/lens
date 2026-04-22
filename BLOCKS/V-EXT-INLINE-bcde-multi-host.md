# V-EXT-INLINE-b/c/d/e — Claude + Gemini + Rufus + Perplexity inline sidebars

**Depends on:** V-EXT-INLINE-a ✅ (ChatGPT shipped with the full ambient-pill + sidebar infra, narrowed manifest, observer/popstate reattach).

**Goal:** Extend the same ambient pill + sidebar pattern across all four remaining AI-chat hosts. Same infrastructure — adapters already exist, manifest already includes the hosts (`claude.ai`, `gemini.google.com`, `www.perplexity.ai`, `amazon.com` for Rufus). This block (a) validates each adapter, (b) brings each up to the V-EXT-INLINE-a hardening bar with fallback selectors, (c) rebuilds + deploys the extension, (d) marks all four CHECKLIST rows ✅.

Per `BLOCK_PLAN.md`:

> V-EXT-INLINE-a..e: Sidebar on ChatGPT/Claude.ai/Gemini/Rufus/Perplexity.

## State when this block opened

- `apps/extension/content/hosts/claude.ts` — `.font-claude-message` + `.font-claude-response` (Tailwind utility classes — fragile).
- `apps/extension/content/hosts/gemini.ts` — `model-response`, `[data-response-id]`, `message-content` custom elements.
- `apps/extension/content/hosts/perplexity.ts` — `[data-testid="answer-block"]`, `[data-testid="copilot-answer"]`, `.prose.dark\\:prose-invert`.
- `apps/extension/content/hosts/rufus.ts` — matches `amazon.com`, scopes to `[data-feature-name="rufus"]` panel.
- Registry at `content/hosts/registry.ts` routes by URL match.
- Tests exist for every adapter.
- Manifest already allowlists every host (from V-EXT-INLINE-a P0-2 narrowing).

Missing: each adapter silently fails when its primary selector changes. V-EXT-INLINE-a applied a fallback-selectors + one-shot warn pattern to ChatGPT; this block replicates it across the four remaining adapters.

## Acceptance criteria

- Each adapter has a primary + fallback selector path.
- Each adapter emits a single-shot `[Lens] <host> selector stale` warn when the fallback fires.
- Tests exist for each adapter (already the case — confirmed).
- Extension build produces a working dist.
- Manifest grants host access + content-script injection (already applied in V-EXT-INLINE-a).
- No affiliate regressions.

## Files touched

- `apps/extension/content/hosts/claude.ts`, `gemini.ts`, `perplexity.ts`, `rufus.ts` — fallback selectors.
- `CHECKLIST.md` — 4 rows flipped ⬜ → ✅.

## Implementation checklist

1. claude.ts: primary `.font-claude-message` + `.font-claude-response`; fallback `[data-testid="message-content"]`, `[data-message-author-role="assistant"]`.
2. gemini.ts: primary `model-response, [data-response-id], message-content`; fallback `[data-test-id="conversation-model-response"]`, `[role="region"][aria-label*="response"]`.
3. perplexity.ts: primary `[data-testid="answer-block"]`, `[data-testid="copilot-answer"]`; fallback `[data-testid="answer"]`, `article.prose`.
4. rufus.ts: primary `[data-feature-name="rufus"]` panel + inner `[role="article"]`; fallback `[data-feature-name="amazon-shopping"]` panel.
5. Each emits one-shot `globalThis.__lens<Host>Stale = true` warn when fallback fires.
6. Rebuild extension.
7. Run vitest across adapter tests.
8. Opus judge pass.
9. Apply P0+P1.
10. Commit + push.
11. CHECKLIST: 4 rows ✅ + progress-log one-liner per.
