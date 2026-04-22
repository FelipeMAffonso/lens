import type { AuditResult, HostAI, Candidate } from "@lens/shared";

const API_BASE = import.meta.env.VITE_LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";

type Mode = "query" | "text";
let currentMode: Mode = "query";
let currentResult: AuditResult | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadPackStats(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/packs/stats`);
    const data = await res.json();
    const el = $("pack-stats");
    el.textContent = `${data.totalPacks} knowledge packs live · ${data.byType.category} categories · ${data.byType.darkPattern} dark patterns · ${data.byType.regulation} regulations · ${data.categoryAliases} aliases`;
  } catch {
    $("pack-stats").textContent = "packs API unreachable";
  }
}

function setMode(m: Mode): void {
  currentMode = m;
  document.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === m);
  });
  ($("query-section") as HTMLElement).classList.toggle("hidden", m !== "query");
  ($("text-section") as HTMLElement).classList.toggle("hidden", m !== "text");
  ($("audit-btn") as HTMLButtonElement).textContent =
    m === "query" ? "Find spec-optimal" : "Audit this AI answer";
}

async function runAudit(): Promise<void> {
  const streamEl = $("stream");
  const logEl = $("stream-log");
  const resultEl = $("result");
  streamEl.hidden = false;
  resultEl.hidden = true;
  logEl.textContent = "";

  let body: unknown;
  if (currentMode === "query") {
    const userPrompt = ($("query-prompt") as HTMLTextAreaElement).value.trim();
    if (!userPrompt) {
      logEl.append(li("Type what you're shopping for first."));
      return;
    }
    body = { kind: "query", userPrompt };
  } else {
    const source = ($("source") as HTMLSelectElement).value as HostAI;
    const userPrompt = ($("user-prompt") as HTMLInputElement).value || undefined;
    const raw = ($("ai-output") as HTMLTextAreaElement).value.trim();
    const file = ($("screenshot") as HTMLInputElement).files?.[0];
    if (file) {
      body = { kind: "image", source, imageBase64: await fileToBase64(file), userPrompt };
    } else if (raw) {
      body = { kind: "text", source, raw, userPrompt };
    } else {
      logEl.append(li("Paste the AI's answer or drop a screenshot."));
      return;
    }
  }

  // Start SSE for live sub-agent log.
  void runStream(body, logEl);

  // Fetch the full audit card.
  const res = await fetch(`${API_BASE}/audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    logEl.append(li(`HTTP ${res.status}: ${err.slice(0, 300)}`));
    return;
  }
  const result = (await res.json()) as AuditResult;
  currentResult = result;
  renderResult(result);
}

async function runStream(body: unknown, logEl: HTMLElement): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/audit/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const chunk of parts) {
        const event = chunk.match(/^event: (.+)$/m)?.[1];
        const dataJson = chunk.match(/^data: (.+)$/m)?.[1];
        if (!event || !dataJson) continue;
        const data = JSON.parse(dataJson);
        logEl.append(li(`${event} · ${summarize(event, data)}`));
      }
    }
  } catch {
    // silent
  }
}

function summarize(event: string, data: unknown): string {
  const d = data as Record<string, unknown>;
  if (event === "extract:done") return `category=${(d.intent as any)?.category ?? "?"}`;
  if (event === "search:done") return `${d.count} candidates`;
  if (event === "verify:done") return `${(d.claims as unknown[])?.length ?? 0} claims verified`;
  if (event === "rank:done") return `top=${(d.top as Candidate)?.name ?? "?"}`;
  if (event === "crossModel:done") {
    const r = d.results as Array<{ provider: string; model: string; agreesWithLens: boolean }>;
    return r.map((x) => `${x.provider}:${x.model} ${x.agreesWithLens ? "✓" : "✗"}`).join(", ");
  }
  return JSON.stringify(data).slice(0, 120);
}

function renderResult(r: AuditResult): void {
  const el = $("result");
  el.hidden = false;
  const body = $("result-body");
  body.innerHTML = "";

  const card = document.createElement("div");
  card.className = "audit-card";

  const isJob1 = r.aiRecommendation.claims.length === 0 && r.aiRecommendation.pickedProduct.name.startsWith("(no AI");
  const showAiPanel = !isJob1;

  // Header with category + paper anchor
  const header = document.createElement("div");
  header.className = "card-header";
  header.innerHTML = `
    <h2>${isJob1 ? "Your spec-optimal pick" : "Lens audit"}</h2>
    <p class="card-subtitle">category: <strong>${esc(r.intent.category)}</strong></p>
  `;
  card.append(header);

  // Criteria sliders — pack-driven, re-rank on drag
  const sliders = document.createElement("section");
  sliders.className = "criteria-sliders panel";
  sliders.innerHTML = `<h3>Your criteria (drag to re-weight)</h3>`;
  const sliderWrap = document.createElement("div");
  sliderWrap.className = "sliders-wrap";
  for (const c of r.intent.criteria) {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `
      <label>${esc(c.name)}</label>
      <input type="range" min="0" max="100" value="${Math.round(c.weight * 100)}" data-criterion="${esc(c.name)}" />
      <span class="weight-val" data-criterion="${esc(c.name)}">${Math.round(c.weight * 100)}%</span>
    `;
    sliderWrap.append(row);
  }
  sliders.append(sliderWrap);
  card.append(sliders);

  // Panels container
  const panels = document.createElement("div");
  panels.className = "panels-grid";

  if (showAiPanel) {
    panels.append(aiPanel(r));
  }
  panels.append(optimalPanel(r));
  if (showAiPanel) {
    panels.append(claimsPanel(r));
  }
  panels.append(crossModelPanel(r));

  card.append(panels);

  // Ranked list with utility breakdown
  const ranked = document.createElement("section");
  ranked.className = "ranked-list panel";
  ranked.innerHTML = `<h3>Full ranking (utility breakdown)</h3>`;
  const table = document.createElement("table");
  table.innerHTML = `<thead><tr><th>#</th><th>Product</th><th>Price</th><th>Utility</th><th>Breakdown</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  tbody.id = "ranking-tbody";
  for (let i = 0; i < Math.min(r.candidates.length, 10); i++) {
    tbody.append(candidateRow(r.candidates[i]!, i));
  }
  table.append(tbody);
  ranked.append(table);
  card.append(ranked);

  // Elapsed
  const elapsed = document.createElement("p");
  elapsed.className = "elapsed";
  elapsed.textContent = `${r.elapsedMs.total} ms end-to-end (extract ${r.elapsedMs.extract} · search ${r.elapsedMs.search} · verify ${r.elapsedMs.verify} · rank ${r.elapsedMs.rank} · crossModel ${r.elapsedMs.crossModel})`;
  card.append(elapsed);

  body.append(card);

  // Slider interactivity — re-rank client-side using the server-returned per-criterion scores.
  sliderWrap.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      document
        .querySelector<HTMLSpanElement>(`span.weight-val[data-criterion="${input.dataset.criterion}"]`)!
        .textContent = `${input.value}%`;
      reRank();
    });
  });
}

function aiPanel(r: AuditResult): HTMLElement {
  const p = r.aiRecommendation.pickedProduct;
  const div = document.createElement("section");
  div.className = "panel ai-said";
  div.innerHTML = `
    <h3>Your AI said</h3>
    <strong>${esc(p.brand ?? "")} ${esc(p.name)}</strong>
    <ul>${r.aiRecommendation.claims.map((c) => `<li><strong>${esc(c.attribute)}:</strong> ${esc(c.statedValue)}</li>`).join("")}</ul>
  `;
  return div;
}

function optimalPanel(r: AuditResult): HTMLElement {
  const o = r.specOptimal;
  const div = document.createElement("section");
  div.className = "panel spec-optimal";
  div.innerHTML = `
    <h3>Spec-optimal for your criteria</h3>
    <strong>${esc(o.brand ?? "")} ${esc(o.name)}</strong> — $${o.price ?? "?"}
    <p class="utility-line">Utility <strong>${o.utilityScore.toFixed(2)}</strong></p>
    <ul>${o.utilityBreakdown
      .map(
        (b) =>
          `<li>${esc(b.criterion)}: w ${b.weight.toFixed(2)} × s ${b.score.toFixed(2)} = <strong>${b.contribution.toFixed(2)}</strong></li>`,
      )
      .join("")}</ul>
  `;
  return div;
}

function claimsPanel(r: AuditResult): HTMLElement {
  const div = document.createElement("section");
  div.className = "panel claims";
  div.innerHTML = `
    <h3>Claim verdicts</h3>
    <ul>${r.claims
      .map(
        (c) =>
          `<li class="verdict-${c.verdict}"><strong>${esc(c.attribute)}:</strong> ${esc(c.statedValue)} → <em>${esc(c.verdict)}</em>${c.note ? `<br/><small>${esc(c.note)}</small>` : ""}</li>`,
      )
      .join("")}</ul>
  `;
  return div;
}

function crossModelPanel(r: AuditResult): HTMLElement {
  const div = document.createElement("section");
  div.className = "panel cross-model";
  if (r.crossModel.length === 0) {
    div.innerHTML = `<h3>Cross-model disagreement</h3><p class="muted">No other-model picks available (provider keys not configured). The Managed Agent fan-out lives at workers/cross-model/ (Day 3).</p>`;
    return div;
  }
  div.innerHTML = `
    <h3>Other frontier models</h3>
    <ul>${r.crossModel
      .map(
        (c) =>
          `<li><strong>${esc(c.provider)}</strong> / ${esc(c.model)}: picked <em>${esc(c.pickedProduct.name.split("\n")[0]!.slice(0, 60))}</em> <span class="agree-${c.agreesWithLens}">${c.agreesWithLens ? "✓ agrees with Lens" : "✗ agrees with host AI"}</span></li>`,
      )
      .join("")}</ul>
  `;
  return div;
}

function candidateRow(c: Candidate, i: number): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${i + 1}</td>
    <td><strong>${esc(c.brand ?? "")}</strong> ${esc(c.name)}</td>
    <td>$${c.price ?? "?"}</td>
    <td class="utility-cell">${c.utilityScore.toFixed(3)}</td>
    <td><small>${c.utilityBreakdown
      .map((b) => `${esc(b.criterion)}=${b.score.toFixed(2)}`)
      .join(" · ")}</small></td>
  `;
  return tr;
}

function reRank(): void {
  if (!currentResult) return;
  // Read current weights from sliders, renormalize to sum=1.
  const sliders = Array.from(document.querySelectorAll<HTMLInputElement>(".slider-row input"));
  const raw: Record<string, number> = {};
  let sum = 0;
  for (const s of sliders) {
    const v = Number(s.value);
    raw[s.dataset.criterion!] = v;
    sum += v;
  }
  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) normalized[k] = sum > 0 ? v / sum : 0;

  // Recompute utility per candidate using the server-returned per-criterion scores.
  const rescored = currentResult.candidates.map((cand) => {
    let u = 0;
    const breakdown = cand.utilityBreakdown.map((b) => {
      const w = normalized[b.criterion] ?? 0;
      const contribution = w * b.score;
      u += contribution;
      return { ...b, weight: w, contribution };
    });
    return { ...cand, utilityScore: u, utilityBreakdown: breakdown };
  });
  rescored.sort((a, b) => b.utilityScore - a.utilityScore);

  // Re-render ranking table only (not the whole card).
  const tbody = document.getElementById("ranking-tbody")!;
  tbody.innerHTML = "";
  for (let i = 0; i < Math.min(rescored.length, 10); i++) {
    tbody.append(candidateRow(rescored[i]!, i));
  }
}

function esc(s: string | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

function li(text: string): HTMLLIElement {
  const el = document.createElement("li");
  el.textContent = text;
  return el;
}

async function fileToBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]!);
  return btoa(s);
}

// ---------- init ----------
document.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode as Mode));
});
$("audit-btn").addEventListener("click", () => {
  void runAudit();
});
void loadPackStats();
