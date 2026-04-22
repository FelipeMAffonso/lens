// F9 — Lens service worker.
// Strategy:
//   - Static assets (html, css, js, manifest, icons): cache-first with background revalidation.
//   - API calls (/audit, /trace/*, /auth/*): network-first, no cache.
//   - Navigation requests: return the cached index.html shell when offline, live fetch when online.
const CACHE_NAME = "lens-static-v1";
const SHELL = ["/", "/index.html", "/privacy.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function isApiCall(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith("workers.dev") ||
      u.pathname.startsWith("/audit") ||
      u.pathname.startsWith("/auth") ||
      u.pathname.startsWith("/trace") ||
      u.pathname.startsWith("/webhook") ||
      u.pathname.startsWith("/packs") ||
      u.pathname.startsWith("/cron")
    );
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (isApiCall(req.url)) return; // network-first: let browser handle
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/").then((r) => r || new Response("<!doctype html><title>Offline</title>Offline.", { headers: { "content-type": "text/html" } }))),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // background revalidation
        fetch(req).then((live) => {
          if (live && live.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, live.clone()));
          }
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then((live) => {
        if (live && live.ok && req.url.startsWith(self.registration.scope)) {
          const clone = live.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return live;
      });
    }),
  );
});

// Push — show a notification when a recall / price-drop / renewal fires.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "Lens", body: event.data?.text() ?? "" };
  }
  const title = data.title || "Lens";
  const body = data.body || "Something to look at.";
  const url = data.url || "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      tag: data.tag || "lens-notif",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes(url)) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
