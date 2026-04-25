// F9 — Lens PWA install banner (Chrome/Android) + iOS Add-to-Home-Screen hint.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const STORAGE_KEY = "lens.install.v1";

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export type InstallPromptOutcome =
  | "native_prompt_unavailable"
  | "native_prompt_recently_dismissed"
  | "native_prompt_accepted"
  | "native_prompt_dismissed";

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
});

export function hasDeferredInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

export async function maybeShowInstallPrompt(): Promise<InstallPromptOutcome> {
  if (!deferredPrompt) return "native_prompt_unavailable";
  const dismissed = readDismissed();
  if (dismissed && Date.now() - dismissed < 7 * 24 * 60 * 60 * 1000) return "native_prompt_recently_dismissed";
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === "dismissed") markDismissed();
  deferredPrompt = null;
  return choice.outcome === "accepted" ? "native_prompt_accepted" : "native_prompt_dismissed";
}

export function renderIOSInstallHintIfNeeded(): void {
  // Show an unobtrusive "Share → Add to Home Screen" hint on iOS Safari.
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone?: boolean }).standalone);
  if (!isIOS || isStandalone) return;
  if (readDismissed()) return;
  const existing = document.getElementById("lens-ios-install");
  if (existing) return;
  const hint = document.createElement("div");
  hint.id = "lens-ios-install";
  hint.style.cssText = `
    position: fixed; bottom: 12px; left: 12px; right: 12px;
    background: #1a1a1a; color: #fafbfc; padding: 12px 14px;
    border-radius: 8px; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-shadow: 0 8px 28px rgba(15,20,30,0.35);
    display: flex; gap: 10px; align-items: center; justify-content: space-between;
    z-index: 999; max-width: 520px; margin: 0 auto;
  `;
  hint.innerHTML = `
    <div><strong>Install Lens</strong> · tap Share ▶ then "Add to Home Screen" to keep audits one tap away.</div>
    <button type="button" id="lens-ios-close" aria-label="Dismiss" style="background:none;border:0;color:#9aa4b8;font-size:18px;cursor:pointer;padding:0 4px;">×</button>
  `;
  document.body.append(hint);
  const close = hint.querySelector<HTMLButtonElement>("#lens-ios-close")!;
  close.addEventListener("click", () => {
    hint.remove();
    markDismissed();
  });
}

function readDismissed(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // silent
  }
}

export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
        console.warn("[Lens] SW registration failed:", e);
      });
    });
  }
}
