# F8 — Content-script router + host consent

**Status:** in progress.

## Scope (minimum viable)
- Narrow `manifest.json` `host_permissions` + `content_scripts.matches` from `<all_urls>` to an explicit allowlist: AI-chat hosts + major US retailers.
- **Per-host Stage-2 consent** module: `apps/extension/content/consent.ts`. Before any Stage-2 POST /passive-scan on a host, check consent state; if unknown, render a single one-time modal ("Always allow / Ask each time / Never") and store decision in `chrome.storage.local`.
- `apps/extension/content/consent.test.ts`: 4 tests.

## Why narrow permissions
Per AMBIENT_MODEL.md §3 and browser-store listing requirements, `<all_urls>` is overly broad. Narrowed list is still permissive enough for the demo.

## Allowlist (v1)
- `https://chatgpt.com/*`, `https://chat.openai.com/*`
- `https://claude.ai/*`, `https://*.claude.ai/*`
- `https://gemini.google.com/*`
- `https://perplexity.ai/*`, `https://www.perplexity.ai/*`
- `https://*.amazon.com/*`
- `https://*.bestbuy.com/*`, `https://*.walmart.com/*`, `https://*.target.com/*`, `https://*.homedepot.com/*`, `https://*.costco.com/*`

## Acceptance
- [ ] Manifest narrowed, extension still builds, extension still detects host via adapterForUrl.
- [ ] Consent module: hasConsent / setConsent / askForConsent with 3-value state (always/ask/never).
- [ ] 4+ consent tests.
