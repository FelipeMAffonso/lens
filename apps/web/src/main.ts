import type { AuditResult, HostAI, Candidate, Claim } from "@lens/shared";

const API_BASE = import.meta.env.VITE_LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";

type Mode = "query" | "text";
let currentMode: Mode = "query";
let currentResult: AuditResult | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const EXAMPLE_AUDITS: Record<string, { source: HostAI; userPrompt: string; raw: string }> = {
  "chatgpt-espresso": {
    source: "chatgpt",
    userPrompt: "espresso machine under $400, pressure + build + steam matter most",
    raw: "For an espresso machine under $400 that balances pressure, build quality, and steam power, I recommend the De'Longhi Stilosa (EC260BK). It features a 15-bar pressure pump, a stainless-steel build, and a manual steam wand for frothing milk. At around $249, it's a reliable pick that won't break the bank while still delivering café-quality espresso.",
  },
  "claude-laptop": {
    source: "claude",
    userPrompt: "best laptop under $1000 for coding — battery life, keyboard, reliability matter most",
    raw: "For coding under $1000, I'd recommend the Lenovo ThinkPad E14 Gen 5. You'll get 16GB of RAM, a 512GB SSD, and the legendary ThinkPad keyboard — durable enough for daily typing and well-liked by developers. Battery life is around 10 hours, and the build quality and reliability are what this line is known for.",
  },
};

async function loadPackStats(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/packs/stats`);
    const data = await res.json();
    const el = $("pack-stats");
    el.textContent = `${data.totalPacks} knowledge packs · ${data.byType.category} categories · ${data.byType.darkPattern} dark patterns · ${data.byType.regulation} regulations`;
  } catch {
    $("pack-stats").textContent = "packs api offline";
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
    m === "query" ? "Find the spec-optimal pick" : "Audit this AI answer";
}

function prefillExampleQuery(query: string): void {
  setMode("query");
  ($("query-prompt") as HTMLTextAreaElement).value = query;
  ($("query-prompt") as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
}

function prefillExampleAudit(key: string): void {
  const ex = EXAMPLE_AUDITS[key];
  if (!ex) return;
  setMode("text");
  ($("source") as HTMLSelectElement).value = ex.source;
  ($("user-prompt") as HTMLInputElement).value = ex.userPrompt;
  ($("ai-output") as HTMLTextAreaElement).value = ex.raw;
  ($("ai-output") as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
}

async function runAudit(): Promise<void> {
  const streamEl = $("stream");
  const logEl = $("stream-log");
  const resultEl = $("result");
  streamEl.hidden = false;
  resultEl.hidden = true;
  logEl.innerHTML = "";

  let body: unknown;
  if (currentMode === "query") {
    const userPrompt = ($("query-prompt") as HTMLTextAreaElement).value.trim();
    if (!userPrompt) {
      logEl.append(logLine("Tell me what you're shopping for first."));
      return;
    }
    body = { kind: "query", userPrompt };
  } else {
    const source = ($("source") as HTMLSelectElement).value as HostAI;
    const userPrompt = ($("user-prompt") as HTMLInputElement).value || undefined;
    const raw = ($("ai-output") as HTMLTextAreaElement).value.trim();
    if (!raw) {
      logEl.append(logLine("Paste the AI's answer first."));
      return;
    }
    body = { kind: "text", source, raw, userPrompt };
  }

  void runStream(body, logEl);

  const res = await fetch(`${API_BASE}/audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    logEl.append(logLine(`Error: ${res.status} — ${err.slice(0, 200)}`));
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
        logEl.append(logLine(`${event.replace(":", " → ")} · ${summarize(event, data)}`));
      }
    }
  } catch {
    // silent
  }
}

function summarize(event: string, data: unknown): string {
  const d = data as Record<string, unknown>;
  if (event === "extract:done") return `category: ${(d.intent as any)?.category ?? "?"}`;
  if (event === "search:done") return `${d.count} real products found`;
  if (event === "verify:done") return `${(d.claims as unknown[])?.length ?? 0} AI claims checked`;
  if (event === "rank:done") return `top pick: ${(d.top as Candidate)?.name ?? "?"}`;
  if (event === "crossModel:done") {
    const r = d.results as Array<{ provider: string; model: string; agreesWithLens: boolean }>;
    return r.length === 0 ? "(no other-model picks)" : r.map((x) => `${x.provider}: ${x.agreesWithLens ? "agrees ✓" : "sides with host AI"}`).join(", ");
  }
  return "";
}

function logLine(text: string): HTMLLIElement {
  const el = document.createElement("li");
  el.textContent = text;
  return el;
}

function renderResult(r: AuditResult): void {
  const el = $("result");
  el.hidden = false;
  const body = $("result-body");
  body.innerHTML = "";

  const isJob1 = r.aiRecommendation.claims.length === 0 && r.aiRecommendation.pickedProduct.name.startsWith("(no AI");

  body.append(headerCard(r, isJob1));
  if (!isJob1) body.append(verdictBanner(r));
  body.append(heroPickCard(r));
  body.append(criteriaCard(r));
  if (!isJob1 && r.claims.length > 0) body.append(claimsCard(r));
  body.append(rankedCard(r));
  body.append(crossModelCard(r));
  body.append(elapsedFooter(r));
}

function headerCard(r: AuditResult, isJob1: boolean): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <h2>${isJob1 ? "Your spec-optimal pick" : "Lens audit"}</h2>
        <p class="card-subtitle">Category: <strong>${esc(r.intent.category)}</strong></p>
      </div>
      <div class="pack-pill">transparent math · pack-verified</div>
    </div>
  `;
  return card;
}

function verdictBanner(r: AuditResult): HTMLElement {
  const falseCount = r.claims.filter((c) => c.verdict === "false").length;
  const misleadCount = r.claims.filter((c) => c.verdict === "misleading").length;
  const trueCount = r.claims.filter((c) => c.verdict === "true").length;
  const total = r.claims.length;

  let cls = "good";
  let icon = "✓";
  let title = "The AI's claims check out.";
  let body = `${trueCount} of ${total} attribute claims verified.`;

  if (falseCount > 0) {
    cls = "bad";
    icon = "✗";
    title = `Lens flagged ${falseCount} false claim${falseCount === 1 ? "" : "s"} in the AI's recommendation.`;
    body = `${falseCount} false, ${misleadCount} misleading, ${trueCount} verified out of ${total} total.`;
  } else if (misleadCount > 0) {
    cls = "mixed";
    icon = "⚠";
    title = `Lens flagged ${misleadCount} misleading claim${misleadCount === 1 ? "" : "s"}.`;
    body = `${misleadCount} misleading, ${trueCount} verified out of ${total} total.`;
  }

  const div = document.createElement("div");
  div.className = `verdict-banner ${cls}`;
  div.innerHTML = `
    <div class="verdict-icon">${icon}</div>
    <div class="verdict-text"><strong>${esc(title)}</strong>${esc(body)}</div>
  `;
  return div;
}

function heroPickCard(r: AuditResult): HTMLElement {
  const o = r.specOptimal;
  const matchPct = Math.round((o.utilityScore ?? 0) * 100);
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header"><h2>Spec-optimal pick</h2></div>
    <div class="hero-pick">
      <div>
        <div class="pick-product"><span class="brand">${esc(o.brand ?? "")}</span> <span class="name">${esc(o.name)}</span></div>
        <div class="pick-price">Price: <span class="amount">$${o.price ?? "?"}</span></div>
      </div>
      <div class="match-bar">
        <div class="match-bar-fill"><div style="width:${matchPct}%"></div></div>
        <div class="match-bar-label">${matchPct}% match to your criteria</div>
      </div>
    </div>
    <details>
      <summary>How was this scored?</summary>
      <div class="criteria-detail">
        ${o.utilityBreakdown
          .map((b) => {
            const wp = Math.round(b.weight * 100);
            const sp = Math.round(b.score * 100);
            return `<div class="criterion-row">
              <div class="label">${esc(b.criterion)}</div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span style="color:var(--fg-muted);font-size:12px;min-width:100px;">You weight ${wp}%</span>
                <span style="flex:1;height:4px;background:var(--bg);border-radius:999px;overflow:hidden;"><span style="display:block;height:100%;background:var(--hl);width:${sp}%"></span></span>
                <span style="color:var(--fg-dim);font-size:12px;min-width:70px;">scores ${sp}/100</span>
              </div>
              <div class="value">+${(b.contribution * 100).toFixed(0)}</div>
            </div>`;
          })
          .join("")}
      </div>
    </details>
  `;
  return card;
}

function criteriaCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <h2>Your criteria</h2>
        <p class="card-subtitle">Drag sliders to re-weight. Ranking below updates live.</p>
      </div>
    </div>
    <div class="criteria-detail" id="sliders-wrap"></div>
  `;
  const wrap = card.querySelector<HTMLElement>("#sliders-wrap")!;
  for (const c of r.intent.criteria) {
    const pct = Math.round(c.weight * 100);
    const row = document.createElement("div");
    row.className = "criterion-row";
    row.innerHTML = `
      <div class="label">${esc(c.name)}</div>
      <input type="range" min="0" max="100" value="${pct}" data-criterion="${esc(c.name)}" />
      <div class="value" data-criterion-val="${esc(c.name)}">${pct}%</div>
    `;
    wrap.append(row);
  }
  wrap.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      wrap.querySelector<HTMLSpanElement>(`[data-criterion-val="${input.dataset.criterion}"]`)!.textContent = `${input.value}%`;
      reRank();
    });
  });
  return card;
}

function claimsCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header"><h2>AI's claims, checked</h2></div>
    <div class="claims-list">${r.claims.map((c) => claimRow(c)).join("")}</div>
  `;
  return card;
}

function claimRow(c: Claim): string {
  const icons: Record<string, string> = { true: "✓", false: "✗", misleading: "⚠", unverifiable: "?" };
  const icon = icons[c.verdict] ?? "?";
  const labelByVerdict: Record<string, string> = {
    true: "Accurate",
    false: "False",
    misleading: "Misleading",
    unverifiable: "Unverifiable",
  };
  const label = labelByVerdict[c.verdict] ?? c.verdict;
  return `<div class="claim-row verdict-${c.verdict}">
    <div class="claim-icon">${icon}</div>
    <div class="claim-body">
      <div>
        <span class="claim-attr">${esc(c.attribute ?? "?")}</span>
        <span class="claim-stated">${esc(c.statedValue ?? "")}</span>
        <span class="claim-verdict-badge">${esc(label)}</span>
      </div>
      ${c.note ? `<div class="claim-note">${esc(c.note)}</div>` : ""}
    </div>
  </div>`;
}

function rankedCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header">
      <h2>Full ranking</h2>
      <p class="card-subtitle">${r.candidates.length} real products · transparent utility math</p>
    </div>
    <div class="ranked-list" id="ranked-list"></div>
  `;
  const list = card.querySelector<HTMLElement>("#ranked-list")!;
  for (let i = 0; i < Math.min(r.candidates.length, 10); i++) {
    list.append(rankRow(r.candidates[i]!, i));
  }
  return card;
}

function rankRow(c: Candidate, i: number): HTMLElement {
  const row = document.createElement("div");
  row.className = `rank-row rank-${i + 1}`;
  const pct = Math.round((c.utilityScore ?? 0) * 100);
  row.innerHTML = `
    <div class="rank-num">#${i + 1}</div>
    <div class="rank-product">
      <span class="brand">${esc(c.brand ?? "")}</span>
      <span class="name">${esc(c.name)}</span>
    </div>
    <div class="rank-price">$${c.price ?? "?"}</div>
    <div class="rank-match">
      <div class="rank-match-bar"><div style="width:${pct}%"></div></div>
      <div class="rank-match-label">${pct}%</div>
    </div>
  `;
  return row;
}

function crossModelCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  if (r.crossModel.length === 0) {
    card.innerHTML = `
      <div class="card-header"><h2>What other frontier models picked</h2></div>
      <p class="muted" style="margin: 0;">The cross-model check runs on a <a href="https://lens-cross-model.webmarinelli.workers.dev/health" target="_blank" style="color:var(--hl-hi);">separate Claude Managed Agent Worker</a>. No other-model picks for this run — some provider keys may need refresh.</p>
    `;
    return card;
  }
  card.innerHTML = `
    <div class="card-header">
      <h2>What other frontier models picked</h2>
      <p class="card-subtitle">Parallel fan-out via Claude Managed Agent</p>
    </div>
    <div class="cross-model-list">
      ${r.crossModel
        .map(
          (c) => `<div class="cross-model-row">
        <div class="cross-model-left">
          <span class="cross-model-provider">${esc(c.provider)}</span>
          <span class="cross-model-pick">${esc((c.pickedProduct.name || "").split("\n")[0]!.slice(0, 60))}</span>
        </div>
        <div class="cross-model-verdict ${c.agreesWithLens ? "agrees" : "disagrees"}">
          ${c.agreesWithLens ? "✓ agrees with Lens" : "sides with host AI"}
        </div>
      </div>`,
        )
        .join("")}
    </div>
  `;
  return card;
}

function elapsedFooter(r: AuditResult): HTMLElement {
  const el = document.createElement("p");
  el.className = "elapsed";
  el.textContent = `${(r.elapsedMs.total / 1000).toFixed(1)}s end-to-end · extract ${r.elapsedMs.extract}ms · search ${r.elapsedMs.search}ms · verify ${r.elapsedMs.verify}ms · rank ${r.elapsedMs.rank}ms · cross-model ${r.elapsedMs.crossModel}ms`;
  return el;
}

function reRank(): void {
  if (!currentResult) return;
  const sliders = Array.from(document.querySelectorAll<HTMLInputElement>(".criterion-row input[type='range']"));
  const raw: Record<string, number> = {};
  let sum = 0;
  for (const s of sliders) {
    const v = Number(s.value);
    raw[s.dataset.criterion!] = v;
    sum += v;
  }
  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) normalized[k] = sum > 0 ? v / sum : 0;

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

  const list = document.getElementById("ranked-list")!;
  list.innerHTML = "";
  for (let i = 0; i < Math.min(rescored.length, 10); i++) {
    list.append(rankRow(rescored[i]!, i));
  }
}

function esc(s: string | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

document.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode as Mode));
});
document.querySelectorAll<HTMLButtonElement>(".chip[data-example-query]").forEach((btn) => {
  btn.addEventListener("click", () => prefillExampleQuery(btn.dataset.exampleQuery!));
});
document.querySelectorAll<HTMLButtonElement>(".chip[data-example-audit]").forEach((btn) => {
  btn.addEventListener("click", () => prefillExampleAudit(btn.dataset.exampleAudit!));
});
$("audit-btn").addEventListener("click", () => {
  void runAudit();
});
void loadPackStats();
