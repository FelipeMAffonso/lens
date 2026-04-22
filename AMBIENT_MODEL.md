# Lens — The ambient integration model

**What this file is:** the design north-star for every block that touches user-visible behavior. When F6 (extension sidebar), F7 (overlay + badge), F8 (content-script router), F9 (PWA), F10 (share-sheet), F11 (voice), F12 (Gmail OAuth), F14 (MCP), F16 (ticker), S0 (need-emergence workflows), S4 (decision workflows), and S6 (post-purchase workflows) are executed, the block's acceptance must satisfy the principles below.

**Why this file exists:** the Lens vision is not "a paste-box website." It is "a background process that turns into a foreground tool the moment it sees something worth your attention, and only then." Every UI decision should preserve that posture.

---

## 1. The three modes

| Mode | Trigger | User action required | UI surface |
|---|---|---|---|
| **Active** | user types / clicks / shares | yes, explicit | web paste box, sidebar pill click, share-sheet receive, voice record |
| **Passive** | page loaded, DOM observed, pattern matched, threshold exceeded | no | tiny pinned badge on the affected region, dismissible, never modal |
| **Background** | cron fires, event-bus wakes a workflow | no (but delegated consent required for advocate actions) | push notification, email digest, inbox item |

All three modes share the same D1 state, the same preference profile, the same pack registry. Switching modes is silent — the user doesn't know or care which triggered a given card.

## 2. Passive mode — the lifeblood of "always there"

### Technical model — two-stage local-first

**Stage 1 (local, no network, no LLM):**
- Content script runs on every allowed page (see §3 permission posture).
- Heuristics: CSS selector matches, regex on visible body text, DOM-event deltas (e.g., cart total exceeds product-page listed price by more than tax + shipping), page-type classification by URL.
- If no heuristic fires, nothing happens. Zero packets leave the device. Zero badge UI.
- Implementation: `apps/extension/content/darkPatterns.ts` + per-host adapters in `apps/extension/content/hosts/*.ts`.

**Stage 2 (with user consent, minimal excerpt):**
- When Stage 1 flags, the content script sends a 200-char excerpt around the matched DOM node to `POST /passive-scan` (not the whole page, not the URL path beyond host + page-type).
- Worker runs Opus 4.7 against the relevant pack's `llmVerifyPrompt` to confirm or dismiss.
- Response returned to content script. If confirmed, badge renders. If dismissed, nothing.

### Consent posture (first time a Stage 2 runs on any host)

Single modal, per-host, one-time, revocable:

```
LENS SPOTTED SOMETHING

Lens found what looks like a hidden-costs pattern on this page.
To confirm, send a short excerpt (~200 characters) to Lens's API?

 [ x ] Remember for amazon.com
 ( o ) Always allow        ( ) Ask each time        ( ) Never on this host

[Send] [Don't send]
```

Per-host setting stored in `chrome.storage.local` (Tier 1 — never leaves device). User can revisit in extension settings.

### What the user sees if confirmed

A small pinned badge near the matched region — not a modal, never blocks flow:

```
⚠ Hidden cost detected
$49/night resort fee added at checkout.
Covered by FTC Junk Fees Rule (short-term lodging).
[See detail] [Dismiss] [Don't flag on marriott.com]
```

Rules for badges:
- **One badge per page**, even if 5 patterns matched — aggregate into a single pill ("5 patterns detected — tap to review").
- **Dismissible** by single click on the ×.
- **Non-blocking** — never prevents the user from completing their action.
- **Learned** — if the user dismisses the same pattern on the same host 3 times without engaging, auto-suppress it for that host (stored in Tier 1).
- **Explainable** — every badge has a "why" hover that names the pack, the matched pattern, and the regulation it references.

### Load budget

- Stage 1 must complete in **< 50ms** on a mid-range laptop. Measure with `performance.now()`. Fail the block if regression > 75ms on fixture pages.
- Stage 2 latency irrelevant to user (happens in background), but must time out at **3000ms** to avoid badges appearing minutes after the user left the page.
- CPU: Stage 1 must not produce > 5% sustained CPU on a Chromebook. If the heuristic set grows, use `IntersectionObserver` for DOM queries and `requestIdleCallback` for regex sweeps.
- Memory: content script footprint < 500KB heap.

### False-positive control

- Every pattern requires two orthogonal signals before Stage 2 fires. For example, `fake-urgency` fires only when BOTH "ends in MM:SS" text matches AND the countdown is present in the initial page load (not animated in after — indicating it's not dynamic).
- Maintain a per-host suppression list (Tier 1) — if the user dismisses 3×, suppress for 7 days.
- Log dismissals to the server (opt-in Tier 4, anonymized) so the pack registry can learn which patterns are over-firing.

## 3. Permission posture — the privacy contract

Current `manifest.json` has `host_permissions: ["<all_urls>"]`. This is too broad. F8 (content-script router) narrows this to:

**AI chat hosts** (for the inline sidebar):
- `chatgpt.com/*`
- `claude.ai/*`
- `gemini.google.com/*`
- `perplexity.ai/*`
- `*.amazon.com/*` (for Rufus chat inside product pages)

**Retailer hosts** (for dark-pattern passive scan + price-history + true-total-cost):
- `*.amazon.com/*`, `*.bestbuy.com/*`, `*.walmart.com/*`, `*.target.com/*`, `*.homedepot.com/*`, `*.costco.com/*`
- Shopify-generic: detected via meta tag `<meta name="generator" content="Shopify">` — user gets per-host permission ask on first detection.

**Email hosts** (optional, opt-in):
- `mail.google.com/*` — for inline "Track this purchase with Lens" button on receipt emails (Gmail OAuth is the preferred path — content-script injection is the fallback for users who don't want to OAuth).

Every new host triggers a one-time consent: *"Lens will scan product pages, carts, and checkouts on <host> for dark patterns and hidden fees. Your browsing history never leaves the browser. Excerpts are only sent with your per-host permission. Allow?"*

Host allowlist is editable at any time in extension settings.

## 4. Background mode — the "while you sleep" workflows

### Gmail OAuth (F12)

User connects once → scopes: `gmail.readonly` + `gmail.send` (for outbound drafts).
Worker cron polls every 15 min for new receipts matching a filter. Parses with Opus 4.7 vision (for image receipts) / text model (for HTML receipts). Stores structured rows in `purchases` (D1).

**User-facing evidence of the background work:**
- Dashboard card: "Lens detected 3 new purchases this week from your inbox."
- Inbox filter preview in settings: shows exactly which messages Lens read (none for unrelated emails).

### Recall watcher (S6-W33, daily cron)

Polls CPSC / NHTSA / FDA RSS feeds. Cross-references against `purchases` table. On match → push notification with one-tap return draft.

### Price-drop advocate (S6-W34, every 2h cron)

Watches post-purchase prices within each retailer's price-match window. On drop → drafts claim → sends via email (with user consent).

### Subscription renewal watcher (S6-W36, daily cron)

For every subscription detected in the inbox → 7-day-pre-renewal alert with cancel-link + draft cancellation letter.

### Firmware / CVE watcher (S7-W38, weekly cron)

For every connected-device purchase → manufacturer security bulletins + CVE feeds. On match → alert.

### Welfare-delta (S6-W32, continuous)

Every audit → welfare row computed. Aggregated daily. User sees their running delta on the dashboard.

### The rule — ambient actions never surprise, always explain

Every push notification / email / dashboard card from a background workflow must:
1. Name the pack or workflow that fired it.
2. Link to the source (the recall feed entry, the price-history chart, the receipt).
3. Offer an action + a dismiss.
4. Never take an autonomous action without either a specific per-action consent or a standing delegated-autonomous consent the user granted earlier.

## 5. Invisible consistency — the Apple feel

Per `LOOP_DISCIPLINE.md` Apple-product bar, every ambient surface observes:

- **Silent until signal.** Zero badge UI on ordinary pages. Zero packets when nothing is flagged.
- **One badge per page.** Aggregation is mandatory.
- **Dismissible, never modal.** The user's flow is sacred.
- **Consistent tokens.** Coral `#DA7756` accent, `#1a1a1a` text, `#e5e8ec` borders, 4px radius, 150ms transitions.
- **Motion with purpose.** Badge slides in with a 200ms cubic-bezier(0.22, 1, 0.36, 1) from the attached element's edge, not from the screen edge.
- **Explain on hover.** Every badge has a why-tooltip naming the pack + matched pattern + regulation.

## 6. What the user actually feels

- On ordinary pages: nothing. No Lens indication. (The toolbar icon stays neutral.)
- On product pages: toolbar icon shows a tiny dot if price-history has a notable event (drop, spike, fake-sale) — but no in-page UI unless clicked.
- On carts / checkouts: a small badge pinned to the cart region *only if dark patterns or hidden fees were confirmed*.
- On AI chat responses: the ◉ Lens pill attaches to the response bubble, waiting. Click to audit. No calls until clicked.
- In email (if OAuth granted): "Lens → Track this" button on receipt messages; one tap logs to purchase history.
- As push notifications: only when a recall, price drop, renewal, or firmware alert fires. Never for engagement.
- In a weekly digest email: welfare delta + pending interventions + subscriptions due to renew. Dismissible.

**The invariant: Lens is either silent or saying something worth interrupting for. There is no middle ground, no engagement-farm notification, no "daily tip."**

## 7. Mapping to blocks

| Principle | Enforced by block |
|---|---|
| §2 two-stage detection | F6 (sidebar), F7 (overlay), F8 (router), S4-W22 (dark-pattern scan wiring) |
| §3 permission posture | F8 (host allowlist + per-host consent) |
| §4 background workflows | F4 (cron), F5 (events), F12 (Gmail), S0-W2-5, S6-W32-36, S7-W38 |
| §5 Apple feel | P1 (design system), F6 (sidebar), F7 (overlay) |
| §6 what the user feels | all user-facing blocks |
| §7 false-positive control | F17 (observability + telemetry) |

Every block file in `BLOCKS/` referencing a user-visible surface must explicitly list which of §2, §3, §4, §5, §6 principles it implements and how the acceptance criteria verify each.
