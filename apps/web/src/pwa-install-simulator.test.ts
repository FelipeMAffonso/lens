import { describe, expect, it } from "vitest";
import { runPwaInstallDemo } from "./pwa-install-simulator.js";

function fixture(): HTMLElement {
  document.body.innerHTML = `
    <section id="pwa-install-simulator">
      <button data-pwa-demo-run>Run phone demo</button>
      <div id="pwa-sim-status">idle</div>
      <ol id="pwa-sim-steps">
        <li data-pwa-step="manifest"><span></span>Manifest</li>
        <li data-pwa-step="service-worker"><span></span>Service worker</li>
        <li data-pwa-step="install"><span></span>Install</li>
        <li data-pwa-step="watcher"><span></span>Watcher</li>
        <li data-pwa-step="action"><span></span>Action</li>
      </ol>
      <div data-pwa-phone>
        <div data-pwa-notification></div>
        <div data-pwa-letter></div>
      </div>
      <div id="pwa-sim-result"></div>
    </section>
  `;
  return document.getElementById("pwa-install-simulator")!;
}

describe("PWA install simulator", () => {
  it("runs readiness checks and renders the fallback desktop path", async () => {
    const root = fixture();

    await runPwaInstallDemo(root, {
      delayMs: 0,
      manifestReady: async () => true,
      serviceWorkerReady: () => true,
      prompt: async () => "native_prompt_unavailable",
    });

    expect(document.getElementById("pwa-sim-status")?.textContent).toBe("ready");
    expect(document.getElementById("pwa-sim-result")?.textContent).toContain("Manifest");
    expect(document.getElementById("pwa-sim-result")?.textContent).toContain("manual install path");
    expect(root.querySelectorAll(".is-done")).toHaveLength(5);
    expect(root.querySelector("[data-pwa-notification]")?.classList.contains("is-visible")).toBe(true);
  });

  it("shows fallback status when the manifest is unavailable", async () => {
    const root = fixture();

    await runPwaInstallDemo(root, {
      delayMs: 0,
      manifestReady: async () => false,
      serviceWorkerReady: () => true,
      prompt: async () => "native_prompt_recently_dismissed",
    });

    expect(document.getElementById("pwa-sim-status")?.textContent).toBe("fallback");
    expect(document.getElementById("pwa-sim-result")?.textContent).toContain("recently dismissed");
  });
});
