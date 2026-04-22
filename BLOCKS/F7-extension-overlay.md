# F7 — Extension overlay + badge system

**Status:** in progress. Replaces the legacy `renderBadges()` aggregate toast.

## Why
Per AMBIENT_MODEL.md §2, dark-pattern detection must render as *inline per-pattern badges pinned near the matched element*, Shadow-DOM-isolated, dismissible, never modal. The current `darkPatterns.ts renderBadges` renders one bottom-right aggregate toast — that's a step down from Apple-feel.

## Scope
- `apps/extension/content/overlay/badge.ts` — Shadow-DOM-isolated pinned badge. Takes a hit + anchor element + onClick handler. Motion matches `pill.ts` (200ms cubic-bezier).
- `apps/extension/content/overlay/snackbar.ts` — optional stacked aggregate snackbar ("3 patterns detected on this page") for when matches aren't anchorable.
- `apps/extension/content/overlay/learned-suppression.ts` — per-host dismissal tracking + auto-suppress after 3 dismissals (via `chrome.storage.local`).
- Rewrite `darkPatterns.ts renderBadges` to use the new system.
- Per AMBIENT_MODEL.md §2 "one badge per page" — aggregate if > 3 hits; otherwise inline.

## Acceptance
- [ ] Dark-pattern hits render Shadow-DOM badges anchored to matched elements.
- [ ] Dismiss with × button + ESC.
- [ ] Per-host learned suppression after 3 dismissals of the same pattern.
- [ ] One-badge-per-page rule: > 3 matches → aggregate snackbar.
- [ ] Motion: 200ms cubic-bezier on entry, 150ms on dismiss.
- [ ] Tests: 4 (badge render, dismissal counted, suppression after 3, aggregate trigger).
