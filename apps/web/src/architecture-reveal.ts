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

function paintSources(sources: SourceRow[]): void {
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
        ${s.docs_url ? `<a href="${escapeHtml(s.docs_url)}" target="_blank">docs ↗</a>` : ""}
      </footer>
    `;
    host.append(tile);
  }
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