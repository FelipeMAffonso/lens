import { buildCustomerJourneyMap, type CustomerJourneyMap, type CustomerJourneyStage } from "@lens/shared";

const API_BASE = import.meta.env.VITE_LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";

const FALLBACK_MAP: CustomerJourneyMap = buildCustomerJourneyMap({
  generatedAt: new Date(0).toISOString(),
});

export function renderCustomerJourneyMap(map: CustomerJourneyMap, root: HTMLElement): void {
  const score = Math.round(map.readiness.score * 100);
  root.innerHTML = `
    <div class="journey-summary">
      <div>
        <span class="journey-eyebrow">Live journey map</span>
        <strong>${score}% wired today</strong>
        <p>${map.readiness.live} live stages, ${map.readiness.partial} partial stages, ${map.readiness.planned} planned stages.</p>
      </div>
      <div class="journey-meter" aria-label="${score}% wired"><span style="width:${score}%"></span></div>
    </div>
    <div class="journey-rails">
      <div>
        <h3>Non-negotiables</h3>
        <ul>${map.guarantees.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
      </div>
      <div>
        <h3>User control</h3>
        <ul>${map.privacyControls.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="journey-stage-grid">
      ${map.stages.map(stageCard).join("")}
    </div>
  `;
}

export async function mountCustomerJourneyMap(): Promise<void> {
  const root = document.getElementById("customer-journey-map");
  if (!root) return;
  try {
    const res = await fetch(`${API_BASE}/architecture/journey`, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const map = (await res.json()) as CustomerJourneyMap;
    renderCustomerJourneyMap(map, root);
  } catch {
    root.classList.add("journey-fallback");
    renderCustomerJourneyMap(FALLBACK_MAP, root);
  }
}

function stageCard(stage: CustomerJourneyStage): string {
  const edgeCases = stage.edgeCasesCovered.slice(0, 4);
  const recovery = stage.failureRecovery.slice(0, 2);
  const endpoints = stage.endpoints.slice(0, 5);
  return `
    <article class="journey-card journey-${stage.status}">
      <header>
        <span class="journey-status">${statusLabel(stage.status)}</span>
        <span class="journey-consent">${consentLabel(stage.consentTier)}</span>
      </header>
      <h3>${esc(stage.label)}</h3>
      <p>${esc(stage.promise)}</p>
      <div class="journey-card-block">
        <strong>Surfaces</strong>
        <div class="journey-pill-row">${stage.surfaces.slice(0, 5).map((s) => `<span>${esc(s)}</span>`).join(" ")}</div>
      </div>
      <div class="journey-card-block">
        <strong>Edge cases covered</strong>
        <ul>${edgeCases.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
      </div>
      <div class="journey-card-block">
        <strong>Recovery</strong>
        <ul>${recovery.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      </div>
      <div class="journey-endpoints" title="${esc(stage.endpoints.join(", "))}">
        ${endpoints.map((e) => `<code>${esc(e)}</code>`).join(" ")}
        ${stage.endpoints.length > endpoints.length ? `<code>+${stage.endpoints.length - endpoints.length} more</code>` : ""}
      </div>
    </article>
  `;
}

function statusLabel(status: CustomerJourneyStage["status"]): string {
  if (status === "live") return "live";
  if (status === "partial") return "partial";
  return "planned";
}

function consentLabel(tier: CustomerJourneyStage["consentTier"]): string {
  const labels: Record<CustomerJourneyStage["consentTier"], string> = {
    none: "no sensitive data",
    local_only: "local by default",
    account: "account scoped",
    oauth_sensitive: "OAuth consent",
    financial_sensitive: "financial consent",
  };
  return labels[tier] ?? tier;
}

function esc(s: string | number | boolean | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}
