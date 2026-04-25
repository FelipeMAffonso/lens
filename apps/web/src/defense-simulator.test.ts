import { describe, expect, it, vi } from "vitest";

import { DARK_PATTERN_DEMO_REQUEST, runDefenseDemo, runLiveUrlProbe } from "./defense-simulator";

function fixture(): HTMLElement {
  document.body.innerHTML = `
    <section id="dark-pattern-simulator">
      <button data-defense-demo-run>Run scanner</button>
      <code id="defense-sim-status">idle</code>
      <ol class="sim-steps">
        <li data-step="observe"><span></span>Observe</li>
        <li data-step="compare"><span></span>Compare</li>
        <li data-step="detect"><span></span>Detect</li>
        <li data-step="worker"><span></span>Worker</li>
        <li data-step="result"><span></span>Result</li>
      </ol>
      <div id="defense-sim-network"></div>
      <div id="defense-sim-result"></div>
      <input data-live-probe-url />
      <textarea data-live-probe-text></textarea>
      <button data-live-probe-run>Scan live URL</button>
      <div id="live-probe-result"></div>
    </section>
  `;
  return document.getElementById("dark-pattern-simulator")!;
}

describe("runDefenseDemo", () => {
  it("calls the real passive-scan contract shape and renders the Worker response", async () => {
    const root = fixture();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual(DARK_PATTERN_DEMO_REQUEST);
      return new Response(
        JSON.stringify({
          confirmed: [
            {
              packSlug: "dark-pattern/hidden-costs",
              brignullId: "hidden-costs",
              verdict: "confirmed",
              llmExplanation: "The mandatory fee appears only at checkout.",
              regulatoryCitation: {
                officialName: "Trade Regulation Rule on Unfair or Deceptive Fees",
                citation: "16 CFR Part 464",
                status: "in-force",
                userRightsPlainLanguage: "Mandatory fees must be disclosed in the advertised total.",
              },
              suggestedInterventions: [{ canonicalName: "File FTC complaint", consentTier: "explicit-per-action" }],
            },
          ],
          dismissed: [],
          latencyMs: 42,
          ran: "opus",
          runId: "01HVDEMO000000000000000000",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await runDefenseDemo(root, { apiBase: "https://api.example.test", fetchImpl, delayMs: 0 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.test/passive-scan",
      expect.objectContaining({ method: "POST" }),
    );
    expect(root.classList.contains("sim-done")).toBe(true);
    expect(document.getElementById("defense-sim-status")?.textContent).toBe("opus");
    expect(document.getElementById("defense-sim-result")?.textContent).toContain("01HVDEMO");
    expect(document.getElementById("defense-sim-result")?.textContent).toContain("16 CFR Part 464");
  });

  it("renders a clear failure state when the Worker is unreachable", async () => {
    const root = fixture();
    const fetchImpl = vi.fn(async () => {
      throw new Error("network offline");
    }) as unknown as typeof fetch;

    await runDefenseDemo(root, { apiBase: "https://api.example.test", fetchImpl, delayMs: 0 });

    expect(root.classList.contains("sim-error")).toBe(true);
    expect(document.getElementById("defense-sim-status")?.textContent).toBe("error");
    expect(document.getElementById("defense-sim-result")?.textContent).toContain("network offline");
  });
});

describe("runLiveUrlProbe", () => {
  it("posts the judge-supplied URL to the live probe endpoint and renders page-derived hits", async () => {
    const root = fixture();
    const url = "https://www.marriott.com/booking/confirm?hotelId=demo";
    root.querySelector<HTMLInputElement>("[data-live-probe-url]")!.value = url;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe("https://api.example.test/passive-scan/probe");
      expect(JSON.parse(String(init?.body))).toEqual({ url });
      return new Response(
        JSON.stringify({
          ok: true,
          status: "scanned",
          host: "marriott.com",
          pageType: "checkout",
          fetched: { fetchedVia: "jina-reader", bytes: 1800 },
          hits: [
            {
              packSlug: "dark-pattern/hidden-costs",
              brignullId: "hidden-costs",
              severity: "deceptive",
              excerpt: "Destination amenity fee $49/night appears after room subtotal.",
            },
          ],
          scan: {
            confirmed: [
              {
                packSlug: "dark-pattern/hidden-costs",
                brignullId: "hidden-costs",
                verdict: "confirmed",
                llmExplanation: "The visible page evidence includes a mandatory fee.",
                suggestedInterventions: [],
              },
            ],
            dismissed: [],
            latencyMs: 50,
            ran: "opus",
            runId: "01JNLIVEURL00000000000000",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await runLiveUrlProbe(root, { apiBase: "https://api.example.test", fetchImpl });

    const text = document.getElementById("live-probe-result")?.textContent ?? "";
    expect(text).toContain("marriott.com");
    expect(text).toContain("dark-pattern/hidden-costs");
    expect(text).toContain("Destination amenity fee");
    expect(text).toContain("01JNLIVEURL");
  });

  it("rejects local URLs in the browser before hitting the Worker", async () => {
    const root = fixture();
    root.querySelector<HTMLInputElement>("[data-live-probe-url]")!.value = "http://127.0.0.1:8787/secret";
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await runLiveUrlProbe(root, { apiBase: "https://api.example.test", fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(document.getElementById("live-probe-result")?.textContent).toContain("Local/private URLs are blocked");
  });
});
