# F9 — PWA (installable + mobile-first + push)

**Status:** in progress.

## Why
Per VISION_COMPLETE.md §5, the iOS/Android tier-1 surface is a PWA. User installs from lens-b1h.pages.dev → home screen icon → opens standalone → camera mode + voice mode + push notifications for recalls/price-drops.

## Scope (minimum viable)
- `apps/web/public/manifest.webmanifest` — name, icons (192/512/maskable), theme color `#DA7756`, standalone display, start_url `/`.
- `apps/web/public/sw.js` — service worker: offline shell (cache-first static assets), network-first API calls, IndexedDB queue for offline intents.
- `apps/web/public/icons/` — icon set (synthesized from the ◉ brand mark; text-SVG converted to PNG at 192/512).
- `apps/web/index.html` — `<link rel="manifest">`, `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-capable">`, `<link rel="apple-touch-icon">`.
- `apps/web/src/pwa/install.ts` — listens for `beforeinstallprompt`, shows "Install Lens" pill on first audit completion. iOS gets a dismissible "Share → Add to Home Screen" hint.
- `apps/web/src/pwa/push.ts` — Web Push subscription: `navigator.serviceWorker.getRegistration().pushManager.subscribe({applicationServerKey: VAPID_PUBLIC})`. POST the subscription to `/push/subscribe` on the Worker.
- `workers/api/src/push/` — VAPID keypair generation util + `/push/subscribe` endpoint stub.
- Mobile-first CSS adjustments: ensure every surface works at 360px, nav bar collapses, input fields stack.

## Acceptance
- [ ] `manifest.webmanifest` served + `/manifest.json` redirect.
- [ ] Service worker registered + caches the shell.
- [ ] "Install Lens" prompt appears on Chrome/Android after a successful audit.
- [ ] iOS renders the "Share → Add to Home Screen" hint.
- [ ] Lighthouse PWA score ≥ 90 on the deployed Pages.
- [ ] `/push/subscribe` endpoint stub returns 200 with subscription-id echo.
- [ ] Tests: manifest JSON validity, install-prompt handler, push-subscription util (5+).
