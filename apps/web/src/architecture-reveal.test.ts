import { describe, expect, it, vi, afterEach } from "vitest";
import { paintSourceInspector, paintSources } from "./architecture-reveal.js";

describe("architecture reveal source UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders a live source inspector from the public source-detail endpoint", async () => {
    document.body.innerHTML = `<section><div id="sources-grid"></div></section>`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: {
          id: "cpsc-recalls",
          name: "CPSC Recalls",
          type: "government",
          cadence_minutes: 1440,
          last_run_at: "2026-04-25T12:00:00.000Z",
          last_success_at: "2026-04-25T12:00:00.000Z",
          last_error: null,
          rows_total: 42,
          status: "ok",
          description: "Recall feed",
          base_url: "https://www.cpsc.gov/",
          docs_url: "https://www.cpsc.gov/Recalls",
        },
        recent_runs: [{ started_at: "2026-04-25T12:00:00.000Z", status: "ok", rows_upserted: 12 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    paintSources([
      {
        id: "cpsc-recalls",
        name: "CPSC Recalls",
        type: "government",
        cadence_minutes: 1440,
        last_run_at: null,
        last_success_at: null,
        last_error: null,
        rows_total: 0,
        status: "scheduled",
        description: "Recall feed",
        base_url: "https://www.cpsc.gov/",
        docs_url: "https://www.cpsc.gov/Recalls",
      },
    ]);

    const button = document.querySelector<HTMLButtonElement>(".source-inspect-btn");
    expect(button?.textContent).toContain("inspect live");
    button?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lens-api.webmarinelli.workers.dev/architecture/sources/cpsc-recalls",
      { credentials: "omit" },
    );
    expect(document.getElementById("source-inspector")?.textContent).toContain("CPSC Recalls");
    expect(document.getElementById("source-inspector")?.textContent).toContain("Recent ingester runs");
  });

  it("escapes bootstrapping/error source detail text", () => {
    document.body.innerHTML = `<section><div id="source-inspector"></div><div id="sources-grid"></div></section>`;
    paintSourceInspector({ id: "bad-source", error: `"><script>alert(1)</script>` });
    const panel = document.getElementById("source-inspector")!;
    expect(panel.textContent).toContain("bad-source");
    expect(panel.innerHTML).not.toContain("<script>");
  });
});
