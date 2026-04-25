// F6 — sidebar app. Receives an init payload from the content script, fires the
// /audit/stream SSE, renders stage events into a live log, and finally renders
// the full audit card with the Apple-bar design tokens.

import type { InitPayload } from "../content/bridge.js";
import { onContentMessage, postToParent } from "../content/bridge.js";
import { preferenceModelCard, type SidebarPreferenceModel } from "./preference-model.js";

type AuditResult = {
  id: string;
  intent: {
    category: string;
    criteria: Array<{
      name: string;
      weight: number;
      direction: string;
      confidence?: number;
      source?: string;
      rationale?: string;
    }>;
    rawCriteriaText: string;
    preferenceModel?: SidebarPreferenceModel;
  };
  aiRecommendation: { host: string; pickedProduct: { name: string; brand?: string; price?: number | null; currency?: string }; claims: Array<{ attribute: string; statedValue: string }>; reasoningTrace: string };
  specOptimal: {
    name: string; brand?: string; price?: number | null; currency?: string;
    utilityScore: number;
    utilityBreakdown: Array<{ criterion: string; weight: number; score: number; contribution: number }>;
  } | null;
  candidates: Array<NonNullable<AuditResult["specOptimal"]>>;
  claims: Array<{ attribute: string; statedValue: string; verdict: "true" | "false" | "misleading" | "unverifiable"; note?: string; evidenceUrl?: string }>;
  crossModel: Array<{ provider: string; model: string; pickedProduct: { name: string }; agreesWithLens: boolean }>;
  warnings?: Array<{ stage: string; message: string }>;
  elapsedMs: { total: number };
};

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const root = (): HTMLElement => $("root");

function esc(s: string | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function announceReady(): void {
  postToParent({ type: "ready", payload: {} });
}

function requestClose(): void {
  postToParent({ type: "request-close", payload: {} });
}

$("close-btn").addEventListener("click", requestClose);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") requestClose();
});

// Subscribe to init + start the audit.
onContentMessage((msg) => {
  if (msg.type === "init") {
    void runAudit(msg.payload);
  } else if (msg.type === "close") {
    requestClose();
  }
});

// Signal we're ready so the injector sends init + starts slide-in.
announceReady();

async function runAudit(init: InitPayload): Promise<void> {
  root().innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>Auditing…</h2>
          <p class="card-subtitle">Host: <strong>${esc(init.host)}</strong></p>
        </div>
      </div>
      <ul class="stream" id="stream"></ul>
    </div>
  `;
  const streamEl = $("stream");
  streamEl.append(li("init · reading assistant response"));

  let finalResult: AuditResult | null = null;

  // We call /audit/stream for live events AND /audit in parallel to ensure we get
  // the complete result even when SSE connection is flaky. Stream events render
  // live; the parallel call lands the canonical result.
  const body: Record<string, unknown> = {
    kind: "text",
    source: init.host === "unknown" ? "unknown" : init.host,
    raw: init.responseText,
  };
  if (init.userPrompt) body["userPrompt"] = init.userPrompt;

  // Kick off stream + final request in parallel.
  void tailStream(init.apiBase, body, streamEl);
  try {
    const res = await fetch(`${init.apiBase}/audit`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", ...getAnonHeader() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    finalResult = (await res.json()) as AuditResult;
  } catch (e) {
    streamEl.append(li(`audit failed: ${(e as Error).message}`));
    return;
  }

  renderResult(finalResult);
}

async function tailStream(
  apiBase: string,
  body: Record<string, unknown>,
  logEl: HTMLElement,
): Promise<void> {
  try {
    const res = await fetch(`${apiBase}/audit/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", ...getAnonHeader() },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const chunk of parts) {
        const event = chunk.match(/^event: (.+)$/m)?.[1];
        const dataJson = chunk.match(/^data: (.+)$/m)?.[1];
        if (!event || !dataJson) continue;
        try {
          const data = JSON.parse(dataJson);
          logEl.append(li(labelFor(event, data)));
        } catch {
          logEl.append(li(event));
        }
      }
    }
  } catch {
    // silent — the parallel /audit call still produces the result
  }
}

function labelFor(event: string, data: Record<string, unknown>): string {
  const d = data as Record<string, unknown>;
  if (event.endsWith(":start")) return `${event} · ${JSON.stringify(d).slice(0, 90)}`;
  if (event.endsWith(":done")) return `${event} · ${JSON.stringify(d).slice(0, 120)}`;
  if (event === "done") return "pipeline complete";
  return event;
}

function li(text: string): HTMLLIElement {
  const el = document.createElement("li");
  el.textContent = text;
  return el;
}

function getAnonHeader(): Record<string, string> {
  // Prefer anon id stored by the web app; content script could sync this too.
  try {
    const v = window.localStorage.getItem("lens.anon.v1");
    return v ? { "x-lens-anon-id": v } : {};
  } catch {
    return {};
  }
}

function renderResult(r: AuditResult): void {
  const banner = verdictBanner(r);
  const hero = heroPick(r);
  const criteria = criteriaCard(r);
  const claims = r.claims.length > 0 ? claimsCard(r) : "";
  const cross = crossModelCard(r);
  const elapsed = `<p class="elapsed">${(r.elapsedMs.total / 1000).toFixed(1)}s end-to-end</p>`;

  root().innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>Lens audit</h2>
          <p class="card-subtitle">Category: <strong>${esc(r.intent.category)}</strong></p>
        </div>
      </div>
      ${banner}
      ${hero}
    </div>
    ${criteria}
    ${claims}
    ${cross}
    ${elapsed}
  `;

  wireSliders(r);
}

function verdictBanner(r: AuditResult): string {
  const total = r.claims.length;
  if (total === 0) return "";
  const f = r.claims.filter((c) => c.verdict === "false").length;
  const m = r.claims.filter((c) => c.verdict === "misleading").length;
  const t = r.claims.filter((c) => c.verdict === "true").length;
  const u = total - f - m - t;
  const summary = `${f} false · ${m} misleading · ${t} verified · ${u} unverifiable`;
  if (f > 0)
    return `<div class="verdict bad"><span class="verdict-icon">✗</span><span><strong>Lens flagged ${f} false claim${f === 1 ? "" : "s"}.</strong>${esc(summary)}</span></div>`;
  if (m > 0)
    return `<div class="verdict mixed"><span class="verdict-icon">⚠</span><span><strong>Lens flagged ${m} misleading claim${m === 1 ? "" : "s"}.</strong>${esc(summary)}</span></div>`;
  return `<div class="verdict good"><span class="verdict-icon">✓</span><span><strong>Every claim checks out.</strong>${esc(summary)}</span></div>`;
}

function heroPick(r: AuditResult): string {
  const o = r.specOptimal;
  if (!o) {
    return `
      <div class="hero-pick">
        <div class="pick-product">
          <span class="name">No defensible top pick</span>
        </div>
        <div class="pick-price"><span class="muted">Lens did not have enough verified product data to rank a product honestly.</span></div>
      </div>
    `;
  }
  return `
    <div class="hero-pick">
      <div class="pick-product">
        <span class="brand">${esc(o.brand ?? "")}</span><span class="name">${esc(o.name)}</span>
      </div>
      <div class="pick-price">Price: <span class="amount">$${o.price ?? "?"}</span> · <span class="muted">Best fit for your stated criteria</span></div>
    </div>
  `;
}

function criteriaCard(r: AuditResult): string {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>Your criteria</h2>
          <p class="card-subtitle">Drag to re-weight. Ranking updates live.</p>
        </div>
      </div>
      ${preferenceModelCard(r.intent.preferenceModel, r.intent.criteria)}
      <div class="sliders" id="sliders-wrap">
        ${r.intent.criteria.map((c) => `
          <div class="slider-row">
            <div class="name">${esc(c.name)}</div>
            <input type="range" min="0" max="100" value="${Math.round(c.weight * 100)}" data-name="${esc(c.name)}" />
            <div class="value" data-for="${esc(c.name)}">${Math.round(c.weight * 100)}%</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function claimsCard(r: AuditResult): string {
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>AI's claims, checked</h2>
          <p class="card-subtitle">${r.claims.length} claim${r.claims.length === 1 ? "" : "s"} verified against live spec sheets.</p>
        </div>
      </div>
      ${r.claims.map((c) => {
        const icon = { true: "✓", false: "✗", misleading: "⚠", unverifiable: "?" }[c.verdict] ?? "?";
        return `
          <div class="claim ${c.verdict}">
            <div class="icon">${icon}</div>
            <div>
              <span class="attr">${esc(c.attribute)}</span><span class="value">${esc(c.statedValue)}</span>
              ${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function crossModelCard(r: AuditResult): string {
  if (r.crossModel.length === 0) {
    return `<div class="card"><div class="card-header"><h2>Other models</h2></div><p class="muted" style="margin:0;">No cross-model picks for this run.</p></div>`;
  }
  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>What other models picked</h2>
          <p class="card-subtitle">Parallel fan-out via a separate Managed Agent Worker.</p>
        </div>
      </div>
      ${r.crossModel.map((c) => `
        <div class="cross-row">
          <div>
            <span class="provider">${esc(c.provider)}</span>
            <span class="pick">${esc((c.pickedProduct.name || "").split("\n")[0]!.slice(0, 60))}</span>
          </div>
          <div class="verdict-badge ${c.agreesWithLens ? "agrees" : "disagrees"}">
            ${c.agreesWithLens ? "agrees" : "sides with host"}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function wireSliders(r: AuditResult): void {
  const wrap = document.getElementById("sliders-wrap");
  if (!wrap) return;
  wrap.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.type !== "range") return;
    const name = input.dataset["name"];
    if (!name) return;
    const valEl = wrap.querySelector<HTMLElement>(`[data-for="${name}"]`);
    if (valEl) valEl.textContent = `${input.value}%`;
    reRank(r);
  });
}

function reRank(r: AuditResult): void {
  // Pull fresh weights from sliders, normalize, recompute utility per candidate.
  const wraps = document.querySelectorAll<HTMLInputElement>(".sliders input[type='range']");
  const raw: Record<string, number> = {};
  let sum = 0;
  for (const s of wraps) {
    const v = Number(s.value);
    raw[s.dataset["name"] ?? ""] = v;
    sum += v;
  }
  const norm: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) norm[k] = sum > 0 ? v / sum : 0;
  // Recompute top candidate
  let topName = r.specOptimal?.name ?? "No defensible top pick";
  let topScore = 0;
  for (const cand of r.candidates) {
    let u = 0;
    for (const b of cand.utilityBreakdown) u += (norm[b.criterion] ?? 0) * b.score;
    if (u > topScore) { topScore = u; topName = cand.name; }
  }
  const hero = document.querySelector<HTMLElement>(".hero-pick .name");
  if (hero) hero.textContent = topName;
}
