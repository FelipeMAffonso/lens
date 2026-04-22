# V-EXT-INLINE-a — Inline Lens sidebar on ChatGPT

**Depends on:** F6 ✅ (extension sidebar infra), F7 ✅ (overlay + badge), F8 🟡 (host router — chatgptAdapter live).

**Goal:** The **Morning-Sarah-at-ChatGPT** scene from `VISION_COMPLETE.md` §3 goes from aspirational to working-in-Chrome: when a user installs the Lens extension and visits `chatgpt.com`, every assistant response in the conversation grows a small **◉ Lens pill** in its bottom-right corner. Click the pill → a 420px sidebar slides in from the right running the full `/audit` pipeline on that response. This is THE ambient-agent moment the vision leans on.

Per `BLOCK_PLAN.md`:

> V-EXT-INLINE-a: S3-W14 (paste audit) inline on ChatGPT/Claude/Gemini/Rufus/Perplexity.

## State when this block opened

Substantial infrastructure already shipped across F6/F7/F8:
- `apps/extension/content/hosts/chatgpt.ts` — adapter with `match()` (chatgpt.com + chat.openai.com), `detectResponses()` (`[data-message-author-role="assistant"]`), `extractText`, `extractUserPrompt` (walks prior sibling for the matching user prompt).
- `apps/extension/content/observer.ts` — MutationObserver attaches pill to every new response.
- `apps/extension/content/pill.ts` — shadow-DOM ◉ pill button with coral `#DA7756` accent, 150ms cubic-bezier hover, prefers-reduced-motion support, aria-label, focus ring.
- `apps/extension/content/injector.ts` — iframe lifecycle (slide-in from `translateX(100%)`, 300ms cubic-bezier, ESC close, persist `open/closed` state per origin).
- `apps/extension/content/bridge.ts` — typed postMessage between content script and sidebar iframe.
- `apps/extension/sidebar/` — full audit card rendering inside the sidebar.
- `apps/extension/content.ts` entrypoint wires `bootAIChatPills()` on load + after 500ms + after 2500ms (SPA late-paint).

What was missing: a load-unpacked **verified** build that actually sends working pills to chatgpt.com. A judge pass on the integration. CHECKLIST row promotion to ✅.

## Acceptance criteria

- Extension build succeeds (`npm run build` → `dist/` with content.js + sidebar + background + manifest).
- `dist/content.js` bundles `attachPill`, `openSidebar`, `lens-pill` styles, and the chatgpt adapter.
- Load-unpacked against a real ChatGPT conversation: every assistant response gets a ◉ pill, clicking it slides the sidebar in, the sidebar runs `/audit` against the extracted text.
- API base is `https://lens-api.webmarinelli.workers.dev` (hardcoded in pill.ts — the F19 secrets-env-parity test covers this).
- No affiliate/tracking params leak through any injected markup.
- Sidebar iframe is `<all_urls>` web-accessible per manifest.
- ESC key closes the sidebar.
- Shadow-DOM isolation on the pill so ChatGPT's global styles don't bleed.

## Judge pass + progress log + CHECKLIST

This block carries V-EXT-INLINE-a from ⬜ to ✅.

## Files touched

- No new files needed — all source is in place. This block **validates + lands** the existing plumbing.
- `CHECKLIST.md` — mark ✅ with commit hash + progress log.

## Implementation checklist

1. `npm run build` inside `apps/extension/` — produces `dist/` with all four entrypoints.
2. Grep `dist/content.js` for `attachPill`, `openSidebar`, `lens-pill` — confirm bundle includes ambient-pill code.
3. Run vitest across extension (`content/hosts/chatgpt.test.ts`, `content/bridge.test.ts`, `content/consent.test.ts`).
4. Write a 2-sentence install guide in README: "Load unpacked from `apps/extension/dist/` at chrome://extensions (dev mode) → pin the Lens icon → visit chatgpt.com → click ◉ on any response bubble."
5. Opus judge pass.
6. Apply P0/P1.
7. Commit `lens(V-EXT-INLINE-a): ...` + push.
8. CHECKLIST V-EXT-INLINE-a ✅ + progress-log note.
