// improve-E5 — Architecture-reveal mount. Fetches /architecture/stats and
// /architecture/sources, hydrates the big numbers + the source tiles. Runs on
// DOMContentLoaded. Fails soft — if either endpoint is 404 during bootstrap
// (before migration 0010 applies), the UI shows "(bootstrapping)" placeholders.

const API_BASE =
  (import.meta as unknown as { env?: { VITE_LENS_API_URL?: string } }).env
    ?.VITE_LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";

interface StatsRow {
  skus_active?: number | null;
  skus_total?: number | null;
  categories_total?: number | null;
  sources_configured?: number | null;
  sources_healthy?: number | null;
  sources_contributing?: number | null;
  recalls_total?: number | null;
  advisories_total?: number | null;
  regulations_in_force?: number | null;
  discrepancies_open?: number | null;
  brands_known?: number | null;
  last_successful_run?: string | null;
  status?: string;
  packs?: Record<string, number>;
  computed_at?: string;
}

interface SourceRow {
  id: string;
  name: string;
  type: string;
  cadence_minutes: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  rows_total: number;
  status: string;
  description: string | null;
  base_url: string | null;
  docs_url: string | null;
}

interface RecentRunRow {
  id?: string | number | null;
  started_at?: string | null;
  finished_at?: string | null;
  status?: string | null;
  rows_seen?: number | null;
  rows_upserted?: number | null;
  rows_skipped?: number | null;
  error_count?: number | null;
  duration_ms?: number | null;
}

interface SourceDetailBody {
  source?: SourceRow | null;
  recent_runs?: RecentRunRow[];
  status?: string;
  message?: string;
  error?: string;
  id?: string;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function paintStats(stats: StatsRow): void {
  const assign = (key: string, n: number | null | undefined): void => {
    const el = document.querySelector<HTMLElement>(`[data-stat="${key}"]`);
    if (!el) return;
    el.textContent = fmtNumber(n);
  };
  const packsCount = Object.values(stats.packs ?? {}).reduce((a, b) => a + b, 0);
  assign("skus_active", stats.skus_active ?? 0);
  assign("categories_total", stats.categories_total ?? packsCount);
  assign("sources_configured", stats.sources_configured ?? 21);
  assign("sources_healthy", stats.sources_healthy ?? 0);
  assign("recalls_total", stats.recalls_total ?? 0);
  assign("regulations_in_force", stats.regulations_in_force ?? 0);
  assign("discrepancies_open", stats.discrepancies_open ?? 0);
  assign("brands_known", stats.brands_known ?? 0);
  // D7 — overwrite the hardcoded "106/120 Knowledge Packs" copy on the
  // "How Lens works" card 3 with the live count.
  if (packsCount > 0) {
    const packEl = document.querySelector<HTMLElement>("[data-pack-count]");
    if (packEl) packEl.textContent = `${packsCount} Knowledge Packs`;
  }
}

export function paintSources(sources: SourceRow[]): void {
  const host = document.getElementById("sources-grid");
  if (!host) return;
  if (sources.length === 0) {
    host.innerHTML =
      '<div class="source-loading">Data-spine bootstrapping. First ingester run schedules on the next 15-min cron.</div>';
    return;
  }
  host.innerHTML = "";
  const typeOrder: Record<string, number> = {
    government: 1,
    "open-data": 2,
    retailer: 3,
    manufacturer: 4,
    "paid-api": 5,
    scrape: 6,
  };
  const sorted = sources.slice().sort(
    (a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.name.localeCompare(b.name),
  );
  for (const s of sorted) {
    const dot = statusDot(s);
    const lastRun = s.last_run_at
      ? relativeTime(s.last_run_at)
      : "not yet run";
    const cadenceLabel = humanCadence(s.cadence_minutes);
    const rowsLabel = s.rows_total > 0 ? ` · ${fmtNumber(s.rows_total)} rows` : "";
    const tile = document.createElement("article");
    tile.className = "source-tile";
    tile.innerHTML = `
      <header>
        <span class="dot ${dot.cls}" title="${dot.title}"></span>
        <span class="source-type">${s.type}</span>
        <span class="source-cadence">${cadenceLabel}</span>
      </header>
      <h4>${escapeHtml(s.name)}</h4>
      <p>${escapeHtml(s.description ?? "")}</p>
      <footer>
        <span class="last-run">${lastRun}${rowsLabel}</span>
        <span class="source-actions">
          <button class="trigger-btn source-inspect-btn" data-source-id="${escapeHtml(s.id)}" title="Inspect live source status">inspect live</button>
          ${s.docs_url ? `<a href="${escapeHtml(s.docs_url)}" target="_blank">docs ↗</a>` : ""}
        </span>
      </footer>
    `;
    host.append(tile);
  }
  wireSourceInspectButtons();
}

async function refreshArchitectureReveal(): Promise<void> {
  const [statsRes, sourcesRes] = await Promise.allSettled([
    fetch(`${API_BASE}/architecture/stats`).then((r) => r.json() as Promise<StatsRow>),
    fetch(`${API_BASE}/architecture/sources`).then((r) => r.json() as Promise<{ sources?: SourceRow[] }>),
  ]);
  if (statsRes.status === "fulfilled") paintStats(statsRes.value);
  if (sourcesRes.status === "fulfilled") paintSources(sourcesRes.value.sources ?? []);
}

function wireSourceInspectButtons(): void {
  const host = document.getElementById("sources-grid");
  if (!host) return;
  host.querySelectorAll<HTMLButtonElement>("button.source-inspect-btn").forEach((btn) => {
    if (btn.dataset["wired"] === "1") return;
    btn.dataset["wired"] = "1";
    btn.addEventListener("click", async () => {
      const id = btn.dataset["sourceId"];
      if (!id) return;
      const original = btn.textContent ?? "";
      btn.disabled = true;
      btn.textContent = "checking...";
      try {
        const res = await fetch(`${API_BASE}/architecture/sources/${encodeURIComponent(id)}`, {
          credentials: "omit",
        });
        const body = (await res.json()) as SourceDetailBody;
        paintSourceInspector(res.ok ? body : { ...body, error: body.error ?? `HTTP ${res.status}`, id });
        btn.textContent = "inspected";
      } catch (err) {
        paintSourceInspector({ id, error: (err as Error).message.slice(0, 120) });
        btn.textContent = "error";
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = original;
        }, 2500);
      }
    });
  });
}

export function paintSourceInspector(body: SourceDetailBody): void {
  const panel = ensureSourceInspector();
  if (!panel) return;
  panel.hidden = false;
  const source = body.source;
  if (!source) {
    panel.innerHTML = `
      <div class="source-inspector-head">
        <span class="platform-eyebrow">Live source probe</span>
        <strong>${escapeHtml(body.id ?? "data source")}</strong>
      </div>
      <p class="source-inspector-message">
        ${escapeHtml(body.error ?? body.message ?? body.status ?? "Source detail is bootstrapping.")}
      </p>
      <code class="source-inspector-endpoint">GET /architecture/sources/${escapeHtml(body.id ?? ":id")}</code>
    `;
    panel.scrollIntoView?.({ behavior: "smooth", block: "center" });
    return;
  }

  const runs = body.recent_runs ?? [];
  const rows = [
    sourceMetric("Cadence", humanCadence(source.cadence_minutes)),
    sourceMetric("Rows in spine", fmtNumber(source.rows_total)),
    sourceMetric("Last run", source.last_run_at ? relativeTime(source.last_run_at) : "not yet run"),
    sourceMetric("Last success", source.last_success_at ? relativeTime(source.last_success_at) : "not yet"),
  ].join("");
  panel.innerHTML = `
    <div class="source-inspector-head">
      <div>
        <span class="platform-eyebrow">Live source probe</span>
        <h4>${escapeHtml(source.name)}</h4>
      </div>
      <span class="source-inspector-status ${escapeHtml(statusDot(source).cls)}">${escapeHtml(source.status)}</span>
    </div>
    <p class="source-inspector-message">${escapeHtml(source.description ?? "No description published for this source yet.")}</p>
    <div class="source-inspector-metrics">${rows}</div>
    <div class="source-inspector-wire">
      <code>GET /architecture/sources/${escapeHtml(source.id)}</code>
      ${source.base_url ? `<a href="${escapeHtml(source.base_url)}" target="_blank" rel="noopener">source</a>` : ""}
      ${source.docs_url ? `<a href="${escapeHtml(source.docs_url)}" target="_blank" rel="noopener">docs</a>` : ""}
    </div>
    ${source.last_error ? `<p class="source-inspector-error">Last error: ${escapeHtml(source.last_error)}</p>` : ""}
    <div class="source-runs">
      <strong>Recent ingester runs</strong>
      ${renderRecentRuns(runs)}
    </div>
  `;
  panel.scrollIntoView?.({ behavior: "smooth", block: "center" });
}

function ensureSourceInspector(): HTMLElement | null {
  let panel = document.getElementById("source-inspector");
  if (panel) return panel;
  const grid = document.getElementById("sources-grid");
  if (!grid?.parentElement) return null;
  panel = document.createElement("div");
  panel.id = "source-inspector";
  panel.className = "source-inspector";
  panel.hidden = true;
  grid.parentElement.insertBefore(panel, grid);
  return panel;
}

function sourceMetric(label: string, value: string): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderRecentRuns(runs: RecentRunRow[]): string {
  if (runs.length === 0) {
    return `<p class="source-inspector-message">No run rows yet. The next cron will create one after this source becomes due.</p>`;
  }
  return `
    <div class="source-run-list">
      ${runs
        .slice(0, 5)
        .map((run) => {
          const when = run.started_at ? relativeTime(run.started_at) : "unknown";
          const rows = run.rows_upserted ?? run.rows_seen ?? 0;
          const errors = run.error_count ?? 0;
          return `<div class="source-run">
            <span>${escapeHtml(when)}</span>
            <strong>${escapeHtml(run.status ?? "unknown")}</strong>
            <code>${fmtNumber(rows)} rows${errors ? ` / ${fmtNumber(errors)} errors` : ""}</code>
          </div>`;
        })
        .join("")}
    </div>
  `;
}

function statusDot(s: SourceRow): { cls: string; title: string } {
  if (s.status === "ok") return { cls: "dot-green", title: "healthy" };
  if (s.status === "running") return { cls: "dot-amber", title: "running" };
  if (s.status === "stale") return { cls: "dot-amber", title: "stale (last run had errors)" };
  if (s.status === "failing") return { cls: "dot-red", title: "failing" };
  if (s.status === "disabled") return { cls: "dot-gray", title: "disabled" };
  return { cls: "dot-gray", title: "scheduled (first run pending)" };
}

function humanCadence(mins: number): string {
  if (mins <= 60) return `every ${mins} min`;
  if (mins <= 1440) return `every ${Math.round(mins / 60)}h`;
  if (mins <= 10080) return `every ${Math.round(mins / 1440)}d`;
  if (mins <= 43200) return `every ${Math.round(mins / 10080)}w`;
  return `every ${Math.round(mins / 43200)}mo`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso.includes("T") || iso.includes("Z") ? iso : iso + "Z").getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "omit" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function mountArchitectureReveal(): Promise<void> {
  const [stats, sourcesBody] = await Promise.all([
    fetchJson<StatsRow>("/architecture/stats"),
    fetchJson<{ sources: SourceRow[] }>("/architecture/sources"),
  ]);
  if (stats) paintStats(stats);
  if (sourcesBody?.sources) paintSources(sourcesBody.sources);

  // Re-poll every 60s so the dots go green as ingesters run.
  setInterval(async () => {
    const [s2, so2] = await Promise.all([
      fetchJson<StatsRow>("/architecture/stats"),
      fetchJson<{ sources: SourceRow[] }>("/architecture/sources"),
    ]);
    if (s2) paintStats(s2);
    if (so2?.sources) paintSources(so2.sources);
  }, 60_000);
}
