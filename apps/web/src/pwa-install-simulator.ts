import { hasDeferredInstallPrompt, maybeShowInstallPrompt, type InstallPromptOutcome } from "./pwa/install.js";

type PwaStep = "manifest" | "service-worker" | "install" | "watcher" | "action";

interface PwaInstallDemoOptions {
  prompt?: () => Promise<InstallPromptOutcome>;
  manifestReady?: () => Promise<boolean>;
  serviceWorkerReady?: () => boolean;
  delayMs?: number;
}

const OUTCOME_COPY: Record<InstallPromptOutcome, string> = {
  native_prompt_unavailable:
    "No native browser install prompt is available in this desktop context, so Lens shows the QR/manual install path instead.",
  native_prompt_recently_dismissed:
    "The browser prompt was recently dismissed, so Lens keeps the manual install path visible instead of nagging.",
  native_prompt_accepted:
    "The browser accepted the native PWA install prompt.",
  native_prompt_dismissed:
    "The browser showed the native prompt and the user dismissed it.",
};

export function mountPwaInstallSimulator(options: PwaInstallDemoOptions = {}): void {
  const root = document.getElementById("pwa-install-simulator");
  if (!root) return;
  const run = root.querySelector<HTMLButtonElement>("[data-pwa-demo-run]");
  run?.addEventListener("click", () => {
    void runPwaInstallDemo(root, options);
  });
  document.querySelectorAll<HTMLAnchorElement>("[data-run-pwa-demo]").forEach((link) => {
    if (link.dataset["pwaWired"] === "1") return;
    link.dataset["pwaWired"] = "1";
    link.addEventListener("click", (event) => {
      // Mirror the defense-simulator pattern: stop the anchor's default hash jump,
      // do a smooth scroll, and replace (not push) the history entry so Back doesn't
      // break.
      event.preventDefault();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#pwa-install-simulator");
      window.setTimeout(() => void runPwaInstallDemo(root, options), 150);
    });
  });
}

export async function runPwaInstallDemo(root: HTMLElement, options: PwaInstallDemoOptions = {}): Promise<void> {
  const button = root.querySelector<HTMLButtonElement>("[data-pwa-demo-run]");
  const status = root.querySelector<HTMLElement>("#pwa-sim-status");
  const result = root.querySelector<HTMLElement>("#pwa-sim-result");
  const phone = root.querySelector<HTMLElement>("[data-pwa-phone]");
  const notification = root.querySelector<HTMLElement>("[data-pwa-notification]");
  const letter = root.querySelector<HTMLElement>("[data-pwa-letter]");
  const delayMs = options.delayMs ?? 260;
  const prompt = options.prompt ?? maybeShowInstallPrompt;
  const manifestReady = options.manifestReady ?? defaultManifestReady;
  const serviceWorkerReady = options.serviceWorkerReady ?? (() => "serviceWorker" in navigator);

  button?.setAttribute("disabled", "true");
  if (button) button.textContent = "Running...";
  if (status) status.textContent = "checking";
  root.classList.remove("pwa-sim-error", "pwa-sim-complete");
  phone?.classList.remove("is-installed", "has-notification", "has-letter");
  notification?.classList.remove("is-visible");
  letter?.classList.remove("is-visible");
  resetSteps(root);
  if (result) {
    result.innerHTML = `<strong>Running live readiness checks.</strong><p>Reading the manifest and browser PWA capability from this page.</p>`;
  }

  const manifestOk = await runStep(root, "manifest", delayMs, manifestReady);
  const swOk = await runStep(root, "service-worker", delayMs, async () => serviceWorkerReady());
  const nativeAvailable = hasDeferredInstallPrompt();
  const outcome = await runStep(root, "install", delayMs, async () => prompt());
  phone?.classList.add("is-installed");
  await runStep(root, "watcher", delayMs, async () => true);
  phone?.classList.add("has-notification");
  notification?.classList.add("is-visible");
  await runStep(root, "action", delayMs, async () => true);
  phone?.classList.add("has-letter");
  letter?.classList.add("is-visible");

  root.classList.add("pwa-sim-complete");
  if (status) status.textContent = manifestOk && swOk ? "ready" : "fallback";
  if (result) {
    result.innerHTML = `
      <div class="pwa-result-grid">
        <div><span>Manifest</span><strong>${manifestOk ? "found" : "missing"}</strong></div>
        <div><span>Service worker</span><strong>${swOk ? "supported" : "unsupported"}</strong></div>
        <div><span>Native prompt</span><strong>${nativeAvailable ? "available" : "not available"}</strong></div>
      </div>
      <p>${OUTCOME_COPY[outcome]}</p>
      <p class="pwa-result-note">The recall/push sequence shown here is a simulator. In production, purchase matching, Gmail/Plaid/receipt use, and push subscriptions require explicit opt-in and can be disabled independently.</p>
    `;
  }
  button?.removeAttribute("disabled");
  if (button) button.textContent = "Run again";
}

async function runStep<T>(
  root: HTMLElement,
  step: PwaStep,
  delayMs: number,
  action: () => Promise<T> | T,
): Promise<T> {
  markStep(root, step, "active");
  if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  const out = await action();
  markStep(root, step, "done");
  return out;
}

function resetSteps(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-pwa-step]").forEach((el) => {
    el.classList.remove("is-active", "is-done");
  });
}

function markStep(root: HTMLElement, step: PwaStep, state: "active" | "done"): void {
  const el = root.querySelector<HTMLElement>(`[data-pwa-step="${step}"]`);
  if (!el) return;
  if (state === "active") el.classList.add("is-active");
  if (state === "done") {
    el.classList.remove("is-active");
    el.classList.add("is-done");
  }
}

async function defaultManifestReady(): Promise<boolean> {
  try {
    const res = await fetch("/manifest.webmanifest", { credentials: "same-origin" });
    return res.ok;
  } catch {
    return false;
  }
}
