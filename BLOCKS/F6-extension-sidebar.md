# F6 — Extension inline sidebar

**Status:** in progress.
**Prerequisites:** F1 ✅ (auth, for signed-in state across extension), F3 ✅ (workflow engine serves the audit), F20 ✅ (tests).
**Unlocks:** F7 (overlay + badge), F8 (host router), S3-W14 inline-on-ChatGPT demo beat, every "ambient on AI chat" workflow.
**Estimated time:** 8-12 hours across 2-3 loop turns.

## Why this block exists

The current extension is a **tab-launcher**. The popup button does `chrome.tabs.create({url: "https://lens-b1h.pages.dev/?..."})` — opens a new tab. That is not ambient. That is not Apple-product. That is a bookmark.

The headline demo beat (per `VISION_COMPLETE.md` §3) is: *"Sarah asks ChatGPT for an espresso machine. GPT recommends a De'Longhi. A small ◉ Lens pill slides into the corner of GPT's response bubble. She clicks — a sidebar unfolds beside the chat."* The sidebar must render NEXT TO the AI response, not in a new tab. Scroll the host page and the sidebar stays pinned. Click the pill again or ESC and the sidebar slides out. The host page is never disrupted — no layout shift, no blocked scroll.

This block converts the extension from a launcher into an ambient agent.

## Design principles

1. **Sidebar is an iframe**, not an injected DOM tree. Iframe sandboxes styles completely (host CSS can't bleed in; our CSS can't bleed out) and sidesteps CSP for strict sites (ChatGPT has a strict CSP that blocks injected styles).
2. **Pill is a Shadow-DOM island** attached to each AI response bubble. Shadow DOM gives style isolation without the iframe overhead — pill is small and light.
3. **Communication is typed postMessage** between content script + sidebar iframe. One narrow protocol: `{type, requestId, payload}`.
4. **State per-origin.** Open/closed, last route, last audit — all stored in `chrome.storage.local` keyed by `origin`.
5. **Apple-bar compliance.** 300ms slide-in on `cubic-bezier(0.22, 1, 0.36, 1)`. No CLS on host. Focus trap inside sidebar. ESC closes. Smooth on 90Hz, 120Hz, 60Hz.
6. **Never breaks the host.** If DOM queries fail, log and no-op. If the sidebar crashes, host page keeps working. If the audit API is down, sidebar shows an inline retry card.
7. **One pill per AI response.** If host adds 10 responses to a page, Lens attaches 10 pills. MutationObserver handles dynamic additions.
8. **Host adapters are thin.** Each file exports `{ name, match(url), detectResponses(root), extractText(el), responseAnchor(el) }`. Common logic — pill rendering, click handling, sidebar launch — stays in `content/common.ts`.

## File inventory

### Sidebar UI (iframe contents)

| Path | Purpose |
|---|---|
| `apps/extension/sidebar/index.html` | iframe shell, loads CSS + JS |
| `apps/extension/sidebar/sidebar.ts` | sidebar app logic — audit render, SSE streaming, routes |
| `apps/extension/sidebar/sidebar.css` | scoped styles, shared design tokens with web app |
| `apps/extension/sidebar/routes/audit.ts` | audit-card route |
| `apps/extension/sidebar/routes/checkout-scan.ts` | dark-pattern + total-cost view (used by F7) |
| `apps/extension/sidebar/routes/welfare.ts` | welfare-delta snapshot |
| `apps/extension/sidebar/components/audit-card.ts` | audit-card render (mirrors apps/web render) |
| `apps/extension/sidebar/components/stream-log.ts` | SSE event stream rendering |
| `apps/extension/sidebar/components/criteria-sliders.ts` | live re-rank sliders |
| `apps/extension/sidebar/components/claims-list.ts` | claim verdicts with hover-source |
| `apps/extension/sidebar/components/cross-model.ts` | other-models panel |

### Content script (runs in host page)

| Path | Purpose |
|---|---|
| `apps/extension/content/common.ts` | pill rendering, sidebar injection, bridge instance |
| `apps/extension/content/injector.ts` | iframe injection + lifecycle |
| `apps/extension/content/bridge.ts` | typed postMessage protocol |
| `apps/extension/content/observer.ts` | MutationObserver for dynamic responses |
| `apps/extension/content/hosts/common.ts` | shared host-adapter types + helpers |
| `apps/extension/content/hosts/chatgpt.ts` | ChatGPT adapter |
| `apps/extension/content/hosts/claude.ts` | Claude.ai adapter |
| `apps/extension/content/hosts/gemini.ts` | Gemini adapter |
| `apps/extension/content/hosts/rufus.ts` | Amazon Rufus adapter |
| `apps/extension/content/hosts/perplexity.ts` | Perplexity adapter |
| `apps/extension/content/hosts/registry.ts` | registry: match host → adapter |

### Tests

| Path | Purpose |
|---|---|
| `apps/extension/content/bridge.test.ts` | postMessage protocol typing |
| `apps/extension/content/hosts/chatgpt.test.ts` | detection against static fixture HTML |
| `apps/extension/content/hosts/claude.test.ts` | ditto |
| `apps/extension/content/hosts/gemini.test.ts` | ditto |
| `apps/extension/content/hosts/rufus.test.ts` | ditto |
| `apps/extension/content/hosts/perplexity.test.ts` | ditto |
| `apps/extension/tests/e2e/sidebar-injection.spec.ts` | Playwright persistent-context load-unpacked smoke |

### Manifest + build

| Path | Change |
|---|---|
| `apps/extension/manifest.json` | add `web_accessible_resources` for sidebar + icons |
| `apps/extension/package.json` | extend esbuild script to bundle `sidebar/sidebar.ts` + copy `sidebar/*.html`, `sidebar/*.css` |

## Bridge protocol (typed postMessage)

Content script ⇄ sidebar iframe, via `window.postMessage`:

```ts
// Content → Sidebar
type ContentToSidebar =
  | { type: "init"; requestId: string; payload: { origin: string; host: HostId; responseText: string; userPrompt?: string } }
  | { type: "close"; requestId: string; payload: Record<string, never> }
  | { type: "theme"; requestId: string; payload: { prefers: "light" | "dark" } };

// Sidebar → Content
type SidebarToContent =
  | { type: "ready"; requestId: string; payload: Record<string, never> }
  | { type: "request-close"; requestId: string; payload: Record<string, never> }
  | { type: "resize"; requestId: string; payload: { width: number } }
  | { type: "copy-to-clipboard"; requestId: string; payload: { text: string } }
  | { type: "open-url"; requestId: string; payload: { url: string } };
```

Every message has `origin` checked. Sidebar's `window.postMessage` target is `chrome-runtime://<ext-id>` (extension origin). Content script's source is the host origin. Reject messages from any other origin.

## Host adapter shape

```ts
export interface HostAdapter {
  id: "chatgpt" | "claude" | "gemini" | "rufus" | "perplexity" | "unknown";
  match(url: URL): boolean;
  /** Find every AI-response element in the document. */
  detectResponses(root: Document | Element): HTMLElement[];
  /** Extract the text content of a single response element (for /audit input). */
  extractText(el: HTMLElement): string;
  /** Where to attach the pill — usually the response bubble itself or a sibling. */
  responseAnchor(el: HTMLElement): HTMLElement;
  /** Optional: user's original prompt (from the paired user-message node). */
  extractUserPrompt?(el: HTMLElement): string | null;
}
```

### ChatGPT adapter
- `match`: `url.hostname === "chatgpt.com"`
- `detectResponses`: `[...document.querySelectorAll('[data-message-author-role="assistant"]')]`
- `extractText`: `el.innerText.trim()`
- `responseAnchor`: the response element itself; pill positioned absolute/bottom-right inside it
- `extractUserPrompt`: walk backwards to the preceding `[data-message-author-role="user"]`, take `innerText.trim()`

### Claude adapter
- `match`: `url.hostname === "claude.ai"`
- `detectResponses`: `[...document.querySelectorAll('.font-claude-message, .font-claude-response')]`
- rest analogous

### Gemini adapter
- `match`: `url.hostname.includes("gemini.google")` or `url.hostname === "gemini.google.com"`
- `detectResponses`: `[...document.querySelectorAll('model-response, [data-response-id]')]`
- rest analogous

### Rufus adapter
- `match`: `url.hostname.endsWith("amazon.com") && document.querySelector('[data-feature-name="rufus"]')`
- `detectResponses`: `[...document.querySelectorAll('[data-feature-name="rufus"] [role="article"]')]`

### Perplexity adapter
- `match`: `url.hostname === "perplexity.ai"`
- `detectResponses`: `[...document.querySelectorAll('[data-testid="answer-block"]')]`

## Pill rendering (Shadow-DOM attached to each response)

```ts
function attachPill(responseEl: HTMLElement, host: HostId, text: string): void {
  if (responseEl.dataset.lensPilled === "1") return;
  const host = document.createElement("span");
  host.style.cssText = "position:absolute;bottom:8px;right:8px;z-index:2147483646;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = PILL_HTML;
  const btn = shadow.querySelector("button")!;
  btn.addEventListener("click", () => openSidebar({ host, text }));
  // ensure response is a positioning context
  if (getComputedStyle(responseEl).position === "static") responseEl.style.position = "relative";
  responseEl.append(host);
  responseEl.dataset.lensPilled = "1";
}
```

Shadow styles: 32x32 circle, coral accent, 200ms hover scale, aria-label "Audit with Lens."

## Sidebar injection

One iframe per page. Pinned-right, 380px wide on desktop, 100vw on mobile-web. Slide-in transform: `translateX(100%)` → `translateX(0)` over 300ms.

```ts
function openSidebar(init: InitPayload): void {
  let iframe = document.getElementById("lens-sidebar") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "lens-sidebar";
    iframe.src = chrome.runtime.getURL("sidebar/index.html");
    iframe.style.cssText = `
      position: fixed; top: 0; right: 0; bottom: 0;
      width: min(420px, 100vw); height: 100vh; border: 0;
      background: transparent; z-index: 2147483647;
      transform: translateX(100%);
      transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
      box-shadow: -8px 0 32px rgba(15,20,30,0.18);
    `;
    document.documentElement.append(iframe);
    // Wait for load + ready handshake before sliding in
    const onReady = (msg: MessageEvent): void => {
      if (msg.source !== iframe!.contentWindow) return;
      if (msg.data?.type === "ready") {
        window.removeEventListener("message", onReady);
        bridge.post(iframe!.contentWindow!, { type: "init", payload: init });
        requestAnimationFrame(() => {
          iframe!.style.transform = "translateX(0)";
        });
      }
    };
    window.addEventListener("message", onReady);
  } else {
    bridge.post(iframe.contentWindow!, { type: "init", payload: init });
    iframe.style.transform = "translateX(0)";
  }
  saveState(window.location.origin, { open: true });
}

function closeSidebar(): void {
  const iframe = document.getElementById("lens-sidebar") as HTMLIFrameElement | null;
  if (!iframe) return;
  iframe.style.transform = "translateX(100%)";
  saveState(window.location.origin, { open: false });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});
```

## Sidebar UI (inside iframe)

Loads `sidebar/index.html`:
```html
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="sidebar.css"/>
<title>Lens</title>
</head><body>
<div id="app"></div>
<script src="sidebar.js"></script>
</body></html>
```

`sidebar.ts` main loop:
1. `parent.postMessage({type: "ready"}, "*")` — signal handshake
2. Listen for `init` message → capture `{host, text, userPrompt}`
3. Render loading state: header (Lens brand + X close button), "Running audit..." + SSE-log card
4. Call `POST /audit/stream` with `{kind: "text", source: host, raw: text, userPrompt}`
5. Render stream events in real time (per Apple-bar §Honest-loading)
6. On `done`, render full audit card — spec-optimal, criteria sliders, claims list, cross-model panel
7. Slider drag → re-rank client-side (reuse math from `apps/web/src/main.ts`)
8. X or ESC → `parent.postMessage({type: "request-close"}, "*")`

Styles mirror `apps/web/src/styles.css` design tokens exactly (coral `#DA7756`, 4px radius, Apple motion curves).

## Manifest changes

```json
{
  "web_accessible_resources": [
    {
      "resources": ["sidebar/*", "icons/*"],
      "matches": ["<all_urls>"]
    }
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ]
}
```

Keep `host_permissions: ["<all_urls>"]` for v1 demo; F8 narrows it.

## Build script

`apps/extension/package.json` → `build` script:
```bash
esbuild content.ts --bundle --outfile=dist/content.js --platform=browser --format=iife --target=chrome120
esbuild background.ts --bundle --outfile=dist/background.js --platform=browser --format=iife --target=chrome120
esbuild sidebar/sidebar.ts --bundle --outfile=dist/sidebar/sidebar.js --platform=browser --format=iife --target=chrome120
cp manifest.json popup.html popup.js dist/
mkdir -p dist/sidebar
cp sidebar/index.html sidebar/sidebar.css dist/sidebar/
cp -r icons dist/ 2>/dev/null || true
```

## Apple-bar compliance checklist

- [ ] Pill: 200ms hover scale (1.05x), 150ms press scale (0.95x)
- [ ] Sidebar slide-in: 300ms `cubic-bezier(0.22, 1, 0.36, 1)`
- [ ] No CLS on host: iframe is `position: fixed` — never in flow
- [ ] Focus trap: Tab cycles inside sidebar, not out to host
- [ ] ESC closes + first-focusable gets focus on open
- [ ] AAA contrast on all text
- [ ] Keyboard: Enter on pill opens, Space opens, Tab through all actions
- [ ] Motion respects `prefers-reduced-motion` (skip slide, instant show)
- [ ] No layout shift when sidebar opens (iframe doesn't push content)
- [ ] Never a placeholder: every state is real. Audit running → streaming log. No candidates → empty-state card with actionable hint.

## Acceptance criteria

- [ ] Block file written (this file).
- [ ] 8+ content-script files: common, injector, bridge, observer, hosts/registry + 5 host adapters.
- [ ] 10+ sidebar files: index.html, sidebar.ts, sidebar.css + 4 components + 3 routes.
- [ ] 6+ tests passing: bridge protocol + 5 host-adapter fixtures.
- [ ] Extension builds cleanly: `cd apps/extension && npm run build` produces `dist/` with content.js, background.js, sidebar/sidebar.js, sidebar/index.html, sidebar/sidebar.css, manifest.json.
- [ ] `npm run typecheck` green across workspaces.
- [ ] Manual load-unpacked test: pill appears on chatgpt.com response, clicking opens sidebar, clicking X closes, ESC closes, `?legacy=1` kept working.
- [ ] Playwright smoke (stretch): persistent-context launch, pill detected on fixture HTML.
- [ ] Commit `lens(F6): extension inline sidebar + 5 host adapters`.
- [ ] CHECKLIST.md F6 ✅ with commit hash.
- [ ] Progress log.

## Implementation execution order

1. Bridge + common types + pill shadow-DOM HTML.
2. `hosts/common.ts` + `hosts/registry.ts`.
3. Host adapters: chatgpt → claude → gemini → rufus → perplexity.
4. `observer.ts` — MutationObserver wiring.
5. `injector.ts` — sidebar iframe lifecycle.
6. Rewrite `content.ts` to use new modules (keep darkPatterns scan as-is for F7 to deepen).
7. Sidebar `index.html` + `sidebar.css` + `sidebar.ts`.
8. Sidebar components + routes.
9. Manifest `web_accessible_resources`.
10. esbuild additions.
11. Tests (bridge + host-adapter fixtures).
12. Local build verify.
13. Commit + push.
14. Update CHECKLIST.

## Rollback

If the sidebar destabilizes the extension:
- Keep the current popup.html path working (the "Audit this page" button that opens a new tab). That's the fallback.
- Feature-flag the pill via `chrome.storage.local.get("lens.sidebar.enabled")` — default true, user can toggle off in popup.

## Deferred to later blocks

- F7: overlay + badge system (dark-pattern inline badges — uses the same iframe infra but a different route)
- F8: host-permission narrowing (current v1 keeps `<all_urls>` to simplify)
- F9: PWA mobile version of the sidebar (for share-sheet intake)
- F18: Durable-Object backed sidebar session persistence across page reloads
- Full Playwright MV3 suite landing in F20 stretch (requires persistent context)

## Notes on extension-to-API cookies

The sidebar loads from `chrome-extension://<id>/sidebar/index.html` and calls `https://lens-api.webmarinelli.workers.dev/audit/stream`. The worker sets `SameSite=None` cookies (F1). Extension pages send cookies by default when the request goes to an allowed host (declared in `host_permissions`). So signed-in sidebar users see their D1 history; anon users get anon-keyed behavior via the `x-lens-anon-id` header (read from `chrome.storage.local`).
