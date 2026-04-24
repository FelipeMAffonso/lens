import type { AuditResult, HostAI, Candidate, Claim } from "@lens/shared";
import "./chat/chat.css";

const API_BASE = import.meta.env.VITE_LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";

type Mode = "query" | "text" | "url";

// ---------- preference profile (Workflow 50: localStorage portability) ----------
interface ProfileState {
  savedAt: string;
  criteria: Array<{ name: string; weight: number; direction: string }>;
  category: string;
}
const PROFILE_KEY = "lens.profiles.v1";

function loadProfiles(): Record<string, ProfileState> {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveProfile(category: string, state: ProfileState): void {
  const all = loadProfiles();
  all[category] = state;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
}

// ---------- welfare-delta history (Workflow 32) ----------
interface HistoryEntry {
  at: string;
  category: string;
  lensPickName: string;
  lensPickPrice: number | null;
  aiPickName: string | null;
  aiPickPrice: number | null;
  utilityDelta: number;
  priceDelta: number | null;
}
const HISTORY_KEY = "lens.history.v1";

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function pushHistory(e: HistoryEntry): void {
  const h = loadHistory();
  h.push(e);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-50)));
}
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
  ($("url-section") as HTMLElement).classList.toggle("hidden", m !== "url");
  ($("text-section") as HTMLElement).classList.toggle("hidden", m !== "text");
  ($("audit-btn") as HTMLButtonElement).textContent =
    m === "query" ? "Find the spec-optimal pick" :
    m === "url" ? "Audit this product URL" :
    "Audit this AI answer";
}

function prefillExampleUrl(url: string): void {
  setMode("url");
  ($("url-input") as HTMLInputElement).value = url;
  ($("url-input") as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
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
  } else if (currentMode === "url") {
    const url = ($("url-input") as HTMLInputElement).value.trim();
    const userPrompt = ($("url-prompt") as HTMLInputElement).value.trim() || undefined;
    if (!url) {
      logEl.append(logLine("Paste a product URL first."));
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      logEl.append(logLine("URL must start with http:// or https://"));
      return;
    }
    body = { kind: "url", url, userPrompt };
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
    logEl.append(logLine(`Error: ${res.status}. ${err.slice(0, 200)}`));
    return;
  }
  const result = (await res.json()) as AuditResult;
  currentResult = result;

  // Save preference profile for this category (W50)
  saveProfile(result.intent.category, {
    savedAt: new Date().toISOString(),
    criteria: result.intent.criteria.map((c) => ({ name: c.name, weight: c.weight, direction: c.direction })),
    category: result.intent.category,
  });

  // Track welfare-delta in history (W32)
  const lensPickPrice = result.specOptimal.price ?? null;
  const aiPickName = result.aiRecommendation.pickedProduct.name.startsWith("(no AI")
    ? null
    : result.aiRecommendation.pickedProduct.name;
  const aiPickPrice = result.aiPickCandidate?.price ?? null;
  const priceDelta = lensPickPrice !== null && aiPickPrice !== null ? aiPickPrice - lensPickPrice : null;
  const aiPickUtility = result.aiPickCandidate?.utilityScore ?? 0;
  const utilityDelta = (result.specOptimal.utilityScore ?? 0) - aiPickUtility;
  pushHistory({
    at: new Date().toISOString(),
    category: result.intent.category,
    lensPickName: result.specOptimal.name,
    lensPickPrice,
    aiPickName,
    aiPickPrice,
    utilityDelta,
    priceDelta,
  });

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

// Human-readable status labels for each pipeline stage. Replaces the previous
// dev-log style (`extract:done`, `search:done`) with copy a shopper understands.
// Maps Study 3 ecological-bot pattern: short friendly status lines, not a log.
function summarize(event: string, data: unknown): string {
  const d = data as Record<string, unknown>;
  if (event === "extract:done") {
    const cat = (d.intent as { category?: string } | undefined)?.category;
    return cat && cat !== "product" ? `Understanding what you need (${cat})` : "Understanding what you need";
  }
  if (event === "search:done") return `Looking at ${d.count ?? "?"} real products`;
  if (event === "verify:done") {
    const n = (d.claims as unknown[])?.length ?? 0;
    return n === 0 ? "No AI claims to check" : `Double-checking ${n} AI claim${n === 1 ? "" : "s"}`;
  }
  if (event === "rank:done") {
    const top = (d.top as Candidate)?.name;
    return top ? `Best match: ${top}` : "Ranking your top matches";
  }
  if (event === "crossModel:done") {
    const r = d.results as Array<{ provider: string; model: string; agreesWithLens: boolean }> | undefined;
    if (!r || r.length === 0) return "Other-model comparison skipped";
    const agree = r.filter((x) => x.agreesWithLens).length;
    return `Other frontier models: ${agree} of ${r.length} agree with Lens`;
  }
  return "";
}

function logLine(text: string): HTMLLIElement {
  const el = document.createElement("li");
  el.textContent = text;
  return el;
}

// Humanize snake_case + camelCase criterion names into consumer-friendly labels.
// `cpu_performance` → "CPU performance", `batteryLife` → "Battery life".
// Known acronyms stay uppercased; everything else gets sentence-cased.
const ACRONYMS = new Set([
  "cpu", "gpu", "ssd", "hdd", "ram", "anc", "oled", "lcd", "led", "usb", "hdmi",
  "ac", "dc", "ip", "nvme", "wifi", "pd", "dpi", "iso", "uv", "ev", "fps", "mph",
  "mpg", "btu", "db", "nm", "oz", "lb", "kg",
]);
function humanizeCriterion(raw: string): string {
  if (!raw) return raw;
  const tokens = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return raw;
  return tokens
    .map((t, i) => {
      const low = t.toLowerCase();
      if (ACRONYMS.has(low)) return low.toUpperCase();
      return i === 0 ? low[0]!.toUpperCase() + low.slice(1) : low;
    })
    .join(" ");
}

export function renderResult(r: AuditResult): void {
  const el = $("result");
  el.hidden = false;
  const body = $("result-body");
  body.innerHTML = "";

  const isJob1 = r.aiRecommendation.claims.length === 0 && r.aiRecommendation.pickedProduct.name.startsWith("(no AI");

  body.append(headerCard(r, isJob1));
  // 2026-04-23: provenance banner — shows the audit was grounded in the
  // spine (SKU count, source count, cron count), not a single web query.
  // Fetched async; rendered even when stats are slow so the card never
  // shows a silent "loading" state.
  body.append(provenanceCard(r));
  if (!isJob1) body.append(verdictBanner(r));
  body.append(heroPickCard(r));
  // B5: parallel-enrichment signals + repairability render immediately below
  // the top pick so the user sees the full trust surface in one glance.
  body.append(enrichmentsCard(r));
  const repairSection = document.createElement("section");
  repairSection.className = "card";
  repairSection.id = "repairability-card-slot";
  repairSection.innerHTML = `<div class="card-header"><h2>Repairability</h2></div><p class="muted" style="margin:0;">Loading iFixit data…</p>`;
  body.append(repairSection);
  void hydrateRepairabilityCard(r, repairSection);
  body.append(criteriaCard(r));
  if (!isJob1 && r.claims.length > 0) body.append(claimsCard(r));
  body.append(alternativesCard(r));
  body.append(rankedCard(r));
  body.append(crossModelCard(r));
  body.append(welfareDeltaCard());
  body.append(profileCard());
  body.append(elapsedFooter(r));
}

// B5 — enrichmentsCard renders all parallel-enrichment signals (B2) as a
// grid of chips with verdict + source badge. Skipped signals are honestly
// labeled so the user sees the full trust surface.
function enrichmentsCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  const e = r.enrichments ?? {};
  const has = e.scam || e.breach || e.priceHistory || e.provenance || e.sponsorship;
  if (!has) {
    card.innerHTML = `<div class="card-header"><h2>Trust signals</h2></div><p class="muted" style="margin:0;">Enrichment pipeline did not run for this audit.</p>`;
    return card;
  }
  // Judge P1-6: when every signal is "skipped" (query-mode audits without a
  // product URL), collapse to a single muted line instead of 5 italic chips.
  const signals = [e.scam, e.breach, e.priceHistory, e.provenance, e.sponsorship].filter(Boolean);
  const allSkipped = signals.length > 0 && signals.every((s) => s?.status === "skipped");
  if (allSkipped) {
    card.innerHTML = `<div class="card-header"><h2>Trust signals</h2></div><p class="muted" style="margin:0;">No trust signals apply to this audit (query mode. Paste a retailer URL to evaluate).</p>`;
    return card;
  }
  const rows: string[] = [];
  const chipFor = (
    label: string,
    status: "ok" | "skipped" | "error" | undefined,
    verdict: string | undefined,
    reason: string | undefined,
    cls: string,
  ): string => {
    const statusCls = status === "ok" ? "ok" : status === "error" ? "err" : "skip";
    const text = status === "ok" ? (verdict ?? "ok") : status === "error" ? `error: ${reason ?? ""}` : `skipped: ${reason ?? ""}`;
    // Judge P1-3: a11y — role=group + aria-label joins label + text.
    return `<div class="trust-chip ${cls} ${statusCls}" role="group" aria-label="${esc(label)}: ${esc(text)}">
      <div class="trust-chip-label">${esc(label)}</div>
      <div class="trust-chip-value">${esc(text)}</div>
    </div>`;
  };
  if (e.scam) rows.push(chipFor("Scam / fraud", e.scam.status, e.scam.verdict, e.scam.reason, "scam"));
  if (e.breach) rows.push(chipFor("Seller breach history", e.breach.status, e.breach.band, e.breach.reason, "breach"));
  if (e.priceHistory) rows.push(chipFor("Price history", e.priceHistory.status, e.priceHistory.verdict, e.priceHistory.reason, "price"));
  if (e.provenance) rows.push(chipFor("Source provenance", e.provenance.status, e.provenance.score !== undefined ? `score ${(e.provenance.score * 100).toFixed(0)}/100` : undefined, e.provenance.reason, "prov"));
  if (e.sponsorship) rows.push(chipFor("Sponsorship / affiliate", e.sponsorship.status, e.sponsorship.verdict, e.sponsorship.reason, "spon"));
  card.innerHTML = `
    <div class="card-header">
      <h2>Trust signals</h2>
      <p class="card-subtitle">Parallel enrichment on the picked product's retailer + catalog</p>
    </div>
    <div class="trust-grid">${rows.join("")}</div>
  `;
  return card;
}

// B5 — repairability card (async fetch /repairability/lookup).
// Judge P0-2: in-session cache keyed on (brand||"")::name::category. N audits
// of the same product don't re-hit the worker.
const REPAIR_CACHE = new Map<string, Promise<Response>>();

async function hydrateRepairabilityCard(r: AuditResult, slot: HTMLElement): Promise<void> {
  const top = r.specOptimal;
  if (!top || !top.name || top.name.startsWith("(no candidates")) {
    slot.innerHTML = `<div class="card-header"><h2>Repairability</h2></div><p class="muted" style="margin:0;">No product to assess.</p>`;
    return;
  }
  // Judge P0-2: skip for brand-less picks. iFixit matching is brand-dependent
  // and a nameless query-mode pick will just return source=none anyway.
  if (!top.brand || top.brand.trim().length === 0) {
    slot.innerHTML = `<div class="card-header"><h2>Repairability</h2></div><p class="muted" style="margin:0;">Repairability lookup requires a product brand. This pick has none.</p>`;
    return;
  }
  const cacheKey = `${(top.brand ?? "").toLowerCase()}::${top.name.toLowerCase()}::${(r.intent.category ?? "").toLowerCase()}`;
  try {
    let resPromise = REPAIR_CACHE.get(cacheKey);
    if (!resPromise) {
      resPromise = fetch(`${API_BASE}/repairability/lookup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productName: top.name,
          ...(top.brand ? { brand: top.brand } : {}),
          ...(r.intent.category ? { category: r.intent.category } : {}),
        }),
      });
      REPAIR_CACHE.set(cacheKey, resPromise);
    }
    const res = (await resPromise).clone();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      source: string;
      score?: number;
      band: string;
      commonFailures: string[];
      partsAvailability: { manufacturer: string; thirdParty: string };
      citations: Array<{ label: string; url: string; source: string }>;
      reason?: string;
    };
    const scoreDisplay = body.score !== undefined ? `${body.score}/10` : "—";
    const bandCls = body.band === "easy" ? "band-easy" : body.band === "medium" ? "band-medium" : body.band === "hard" ? "band-hard" : body.band === "unrepairable" ? "band-bad" : "band-unknown";
    slot.innerHTML = `
      <div class="card-header">
        <h2>Repairability</h2>
        <p class="card-subtitle">iFixit-style score · source: ${esc(body.source)}</p>
      </div>
      <div class="repair-grid">
        <div class="repair-score ${bandCls}" role="group" aria-label="Repairability score ${esc(scoreDisplay)}, band ${esc(body.band)}">
          <div class="repair-score-num" aria-hidden="true">${esc(scoreDisplay)}</div>
          <div class="repair-band" aria-hidden="true">${esc(body.band)}</div>
        </div>
        <div class="repair-detail">
          ${body.commonFailures.length > 0 ? `<div><strong>Common failure modes:</strong><ul style="margin:4px 0 0 18px;padding:0;">${body.commonFailures.slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>` : ""}
          <div style="margin-top:8px;"><strong>Parts availability:</strong><br/>
            <span class="muted">Manufacturer:</span> ${esc(body.partsAvailability.manufacturer)}<br/>
            <span class="muted">Third-party:</span> ${esc(body.partsAvailability.thirdParty)}
          </div>
          ${body.reason ? `<p class="muted" style="margin-top:8px;">${esc(body.reason)}</p>` : ""}
        </div>
      </div>
      ${body.citations.length > 0
        ? `<details style="margin-top:10px;"><summary>Citations (${body.citations.length})</summary><ul style="margin:4px 0 0 18px;padding:0;">${body.citations.map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--hl-hi);">${esc(c.label)}</a> <span class="muted">(${esc(c.source)})</span></li>`).join("")}</ul></details>`
        : ""}
    `;
  } catch (err) {
    slot.innerHTML = `<div class="card-header"><h2>Repairability</h2></div><p class="muted" style="margin:0;">Lookup failed: ${esc((err as Error).message)}</p>`;
  }
}

// W11 — Alternative surfacing at price tiers
function alternativesCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  const topPrice = r.specOptimal.price ?? 0;
  const tiers = [
    { label: "Similar price, different trade-off", max: topPrice * 1.1, min: topPrice * 0.9, excludeTop: true },
    { label: "~75% of top price", max: topPrice * 0.85, min: topPrice * 0.6, excludeTop: true },
    { label: "Budget option (~50% price)", max: topPrice * 0.6, min: 0, excludeTop: true },
  ];
  const topIdx = 0;
  const picks = tiers.map((t) => {
    const cands = r.candidates.filter((c, i) => {
      if (t.excludeTop && i === topIdx) return false;
      const p = c.price ?? 0;
      return p <= t.max && p >= t.min;
    });
    return { label: t.label, pick: cands[0] ?? null };
  });
  const anyPicks = picks.some((p) => p.pick !== null);
  if (!anyPicks) {
    // D16 — graceful empty state. Don't render a bleak "not enough"; instead
    // tell the user what Lens WOULD show when the catalog has siblings.
    card.style.display = "none";
    return card;
  }
  card.innerHTML = `
    <div class="card-header">
      <h2>Alternatives at other price points</h2>
      <p class="card-subtitle">Same criteria, different trade-offs</p>
    </div>
    <div style="display:grid;gap:10px;">
      ${picks
        .filter((p) => p.pick !== null)
        .map(
          (p) => `<div style="display:grid;grid-template-columns:200px 1fr 70px;gap:12px;align-items:center;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;">
          <div style="color:var(--fg-muted);font-size:12px;">${esc(p.label)}</div>
          <div><span class="brand" style="color:var(--fg-dim);">${esc(p.pick!.brand ?? "")}</span> <strong>${esc(p.pick!.name)}</strong></div>
          <div style="text-align:right;font-family:ui-monospace,monospace;color:var(--fg-dim);">$${p.pick!.price ?? "?"}</div>
        </div>`,
        )
        .join("")}
    </div>
  `;
  return card;
}

// W50 — Preference profile export/import card
function profileCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  const profiles = loadProfiles();
  const profileSlugs = Object.keys(profiles);
  card.innerHTML = `
    <div class="card-header">
      <h2>Your saved preferences</h2>
      <p class="card-subtitle">${profileSlugs.length} categor${profileSlugs.length === 1 ? "y" : "ies"} learned · stored on your device only</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <button class="chip" id="profile-export">Export profile JSON</button>
      <button class="chip" id="profile-import">Import profile JSON</button>
      <button class="chip" id="profile-clear" style="color:var(--warn);">Clear all</button>
      <input type="file" id="profile-file" accept="application/json,.json" style="display:none;" />
    </div>
    ${
      profileSlugs.length > 0
        ? `<div style="margin-top:12px;display:grid;gap:10px;">${profileSlugs
            .map((slug) => {
              const p = profiles[slug];
              const crits = p?.criteria ?? [];
              const budget = p?.budget;
              const criteriaHtml = crits
                .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
                .map((c) => {
                  const pct = Math.round((c.weight ?? 0) * 100);
                  return `<div style="display:flex;align-items:center;gap:10px;font-size:12px;">
                    <span style="flex:0 0 150px;color:var(--fg);">${esc(c.name)}</span>
                    <span style="flex:1;height:4px;background:var(--bg);border-radius:999px;overflow:hidden;"><span style="display:block;height:100%;background:var(--accent);width:${pct}%"></span></span>
                    <span style="flex:0 0 36px;text-align:right;font-family:ui-monospace,monospace;font-size:11px;color:var(--fg-muted);">${pct}%</span>
                  </div>`;
                })
                .join("");
              const budgetTxt = budget && (budget.min != null || budget.max != null)
                ? `<div style="font-size:11px;color:var(--fg-muted);margin-top:4px;">Budget: ${budget.min ?? "?"} – ${budget.max ?? "?"} ${budget.currency ?? "USD"}</div>`
                : "";
              return `<details style="border:1px solid #e3dfd4;border-radius:8px;padding:10px 14px;background:#fff;">
                <summary style="display:flex;justify-content:space-between;cursor:pointer;list-style:none;">
                  <span style="font-weight:600;text-transform:capitalize;">${esc(slug.replace(/-/g, " "))}</span>
                  <span style="font-family:ui-monospace,monospace;font-size:11px;color:var(--fg-muted);">${crits.length} criteria</span>
                </summary>
                <div style="margin-top:10px;display:grid;gap:6px;">${criteriaHtml || "<div class='muted' style='font-size:12px;'>No criteria recorded yet.</div>"}</div>
                ${budgetTxt}
                <div style="margin-top:10px;display:flex;gap:6px;">
                  <button class="chip" data-profile-load="${esc(slug)}" style="font-size:11px;">Use for next audit →</button>
                  <button class="chip" data-profile-delete="${esc(slug)}" style="font-size:11px;color:var(--warn);">Delete</button>
                </div>
              </details>`;
            })
            .join("")}</div>`
        : `<p class="muted" style="font-size:13px;margin-top:10px;">No saved preferences yet. After your first audit, Lens saves the inferred criteria + weights for that category so the next one is faster.</p>`
    }
  `;
  // Wire up handlers
  setTimeout(() => {
    const exportBtn = card.querySelector<HTMLButtonElement>("#profile-export");
    const importBtn = card.querySelector<HTMLButtonElement>("#profile-import");
    const clearBtn = card.querySelector<HTMLButtonElement>("#profile-clear");
    const fileInput = card.querySelector<HTMLInputElement>("#profile-file");
    exportBtn?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(loadProfiles(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lens-profiles-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    importBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
        alert(`Imported ${Object.keys(data).length} preference profile(s).`);
        location.reload();
      } catch (e) {
        alert(`Import failed: ${(e as Error).message}`);
      }
    });
    clearBtn?.addEventListener("click", () => {
      if (confirm("Clear all preference profiles AND audit history? This cannot be undone.")) {
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(HISTORY_KEY);
        location.reload();
      }
    });
    // Per-profile load + delete wiring
    card.querySelectorAll<HTMLButtonElement>("[data-profile-load]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const slug = btn.dataset["profileLoad"];
        if (!slug) return;
        const all = loadProfiles();
        const p = all[slug];
        if (!p) return;
        const crits = (p.criteria ?? [])
          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
          .map((c) => c.name)
          .slice(0, 4)
          .join(", ");
        const budget = p.budget?.max ? ` under $${p.budget.max}` : "";
        const filled = `${slug.replace(/-/g, " ")}${budget}, ${crits || "quality"} matter most`;
        const input = document.getElementById("query-prompt") as HTMLTextAreaElement | null;
        if (input) {
          input.value = filled;
          input.focus();
          input.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
    card.querySelectorAll<HTMLButtonElement>("[data-profile-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const slug = btn.dataset["profileDelete"];
        if (!slug) return;
        if (!confirm(`Delete saved preferences for "${slug}"?`)) return;
        const all = loadProfiles();
        delete all[slug];
        localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
        location.reload();
      });
    });
  }, 0);
  return card;
}

// W32 — Welfare-delta analytic
function welfareDeltaCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  const history = loadHistory();
  if (history.length < 3) {
    card.innerHTML = `
      <div class="card-header"><h2>Welfare-delta (your history)</h2></div>
      <p class="muted" style="margin:0;">After ~10 audits, Oracle will show you the utility + dollar delta between the AI's picks and Oracle's picks across your history. Currently at ${history.length} audit${history.length === 1 ? "" : "s"}.</p>
    `;
    return card;
  }
  const withAi = history.filter((h) => h.aiPickName !== null);
  const avgUtilityDelta = withAi.reduce((s, h) => s + h.utilityDelta, 0) / Math.max(withAi.length, 1);
  const priceSamples = withAi.filter((h) => h.priceDelta !== null);
  const avgPriceDelta =
    priceSamples.length > 0 ? priceSamples.reduce((s, h) => s + (h.priceDelta ?? 0), 0) / priceSamples.length : 0;
  card.innerHTML = `
    <div class="card-header">
      <h2>Welfare-delta (your history)</h2>
      <p class="card-subtitle">Across your last ${history.length} audits</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div style="padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;">
        <div style="color:var(--fg-muted);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Avg utility advantage</div>
        <div style="font-size:24px;font-weight:700;color:var(--accent);margin-top:4px;">+${avgUtilityDelta.toFixed(3)}</div>
        <div style="color:var(--fg-dim);font-size:12px;margin-top:4px;">vs AI's pick</div>
      </div>
      <div style="padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;">
        <div style="color:var(--fg-muted);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Avg price difference</div>
        <div style="font-size:24px;font-weight:700;color:${avgPriceDelta >= 0 ? "var(--accent)" : "var(--warn)"};margin-top:4px;">${avgPriceDelta >= 0 ? "+" : "-"}$${Math.abs(Math.round(avgPriceDelta))}</div>
        <div style="color:var(--fg-dim);font-size:12px;margin-top:4px;">AI pick vs Lens pick</div>
      </div>
    </div>
    <p class="muted" style="margin-top:12px;font-size:12px;">This runs entirely in your browser (localStorage). Nothing is sent to Oracle's server. Clear with devtools application → storage → lens.history.v1.</p>
  `;
  return card;
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

// provenanceCard — "How we got this answer". Shows the data-spine count
// (SKUs, sources, recalls, regulations) + the pipeline stages that ran
// for THIS audit (extract / search / verify / rank / cross-model) with
// millisecond timings pulled from r.elapsedMs. Makes the effort behind
// every answer visible — never a single random product without the
// provenance chain that produced it. Pulls live stats from /architecture
// /stats; falls back to static copy if the endpoint is unreachable.
function provenanceCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  const e = r.elapsedMs ?? ({} as AuditResult["elapsedMs"]);
  const pipe = [
    { name: "extract intent", ms: e.extract },
    { name: "spine + web search", ms: e.search },
    { name: "verify claims", ms: e.verify },
    { name: "rank (U = Σ wᵢ·sᵢ)", ms: e.rank },
    { name: "cross-model fanout", ms: e.crossModel },
    { name: "enrich signals", ms: e.enrich },
  ].filter((s) => typeof s.ms === "number");
  const pipelineHtml = pipe
    .map(
      (s) =>
        `<span class="prov-stage" role="group" aria-label="${esc(s.name)} ${s.ms}ms">` +
        `<strong>${esc(s.name)}</strong><span class="prov-stage-ms">${s.ms}ms</span></span>`,
    )
    .join("<span class=\"prov-arrow\">→</span>");
  card.innerHTML = `
    <div class="card-header">
      <h2>How we got this answer</h2>
      <p class="card-subtitle">Every result is grounded in the spine. No single random product.</p>
    </div>
    <div class="prov-grid" id="prov-spine" aria-live="polite">
      <div class="prov-stat"><div class="prov-stat-n">…</div><div class="prov-stat-lbl">indexed SKUs</div></div>
      <div class="prov-stat"><div class="prov-stat-n">…</div><div class="prov-stat-lbl">live sources contributing</div></div>
      <div class="prov-stat"><div class="prov-stat-n">…</div><div class="prov-stat-lbl">recalls tracked</div></div>
      <div class="prov-stat"><div class="prov-stat-n">…</div><div class="prov-stat-lbl">regulations in force</div></div>
      <div class="prov-stat"><div class="prov-stat-n">…</div><div class="prov-stat-lbl">brand registry rows</div></div>
      <div class="prov-stat"><div class="prov-stat-n">…</div><div class="prov-stat-lbl">crons running</div></div>
    </div>
    <div class="prov-pipeline">${pipelineHtml}</div>
    <div class="prov-foot">
      <a href="/architecture" target="_blank" rel="noopener">Full architecture + live source list →</a>
      <span class="muted" style="margin-left:10px;font-size:12px;">every claim triangulates across ≥2 independent public feeds</span>
    </div>
  `;
  // Fetch live stats and patch the numbers in-place.
  void (async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/architecture/stats`);
      if (!res.ok) return;
      const d = (await res.json()) as {
        skus_active?: number;
        sources_contributing?: number;
        sources_configured?: number;
        recalls_total?: number;
        regulations_in_force?: number;
        brands_known?: number;
      };
      const grid = card.querySelector<HTMLElement>("#prov-spine");
      if (!grid) return;
      const nums = grid.querySelectorAll<HTMLElement>(".prov-stat-n");
      const fmt = (n: number | undefined): string =>
        n == null ? "?" : n >= 1000 ? (n / 1000).toFixed(n >= 100_000 ? 0 : 1) + "K" : String(n);
      const srcStr =
        d.sources_contributing != null && d.sources_configured != null
          ? `${d.sources_contributing}/${d.sources_configured}`
          : String(d.sources_contributing ?? "?");
      const values = [
        fmt(d.skus_active),
        srcStr,
        fmt(d.recalls_total),
        fmt(d.regulations_in_force),
        fmt(d.brands_known),
        "8", // explicit — matches the 8 cron entries in CRON_JOBS
      ];
      values.forEach((v, i) => { if (nums[i]) nums[i]!.textContent = v; });
    } catch {
      /* best-effort */
    }
  })();
  return card;
}

function verdictBanner(r: AuditResult): HTMLElement {
  const falseCount = r.claims.filter((c) => c.verdict === "false").length;
  const misleadCount = r.claims.filter((c) => c.verdict === "misleading").length;
  const trueCount = r.claims.filter((c) => c.verdict === "true").length;
  const total = r.claims.length;

  const unverifiableCount = r.claims.filter((c) => c.verdict === "unverifiable").length;
  const counts = `${falseCount} false · ${misleadCount} misleading · ${trueCount} verified · ${unverifiableCount} unverifiable (out of ${total} total)`;

  let cls = "good";
  let icon = "✓";
  let title = "The AI's claims check out.";
  let body = counts;

  if (falseCount > 0) {
    cls = "bad";
    icon = "✗";
    title = `Lens flagged ${falseCount} false claim${falseCount === 1 ? "" : "s"} in the AI's recommendation.`;
    body = counts;
  } else if (misleadCount > 0) {
    cls = "mixed";
    icon = "⚠";
    title = `Lens flagged ${misleadCount} misleading claim${misleadCount === 1 ? "" : "s"}.`;
    body = counts;
  } else if (unverifiableCount > 0 && trueCount === 0) {
    cls = "mixed";
    icon = "?";
    title = `${unverifiableCount} of ${total} claims could not be verified from available data.`;
    body = counts;
  }

  const div = document.createElement("div");
  div.className = `verdict-banner ${cls}`;
  div.innerHTML = `
    <div class="verdict-icon">${icon}</div>
    <div class="verdict-text"><strong>${esc(title)}</strong>${esc(body)}</div>
  `;
  return div;
}

function priorityLabel(weight: number): string {
  if (weight >= 0.33) return "matters a lot";
  if (weight >= 0.18) return "matters";
  if (weight >= 0.07) return "nice to have";
  return "minor factor";
}

function fitLabel(score: number): string {
  if (score >= 0.85) return "excellent fit";
  if (score >= 0.6) return "good fit";
  if (score >= 0.35) return "okay fit";
  if (score >= 0.15) return "weak fit";
  return "poor fit";
}

// Honest price display. Before: "Price: $279 · Best fit for your stated priorities"
// implied that $279 was the current retailer price. User feedback 2026-04-23:
// the retailer page often shows a different (usually higher) number. Lens doesn't
// lie by saying "$279 IS the price" — it says "we last observed ~$279 here, and
// if you find a lower price elsewhere, that's good for you, click through to
// verify". Price-from-outside-retailer discounts are a *feature*, not a bug.
function renderPriceLine(c: {
  price: number | null;
  priceSources?: number;
  priceMin?: number;
  priceMax?: number;
  priceObservedAt?: string;
}): string {
  if (c.price == null || c.price <= 0) {
    return `<span class="muted">Price not verified yet, check the retailer link below for the current number.</span>`;
  }
  const n = c.priceSources ?? 0;
  const hasRange =
    typeof c.priceMin === "number" &&
    typeof c.priceMax === "number" &&
    c.priceMin > 0 &&
    c.priceMax > c.priceMin;
  const rangeChip = hasRange
    ? `<span class="tri-chip" title="Range across the sources Oracle consulted (triangulated).">
        <span class="tri-chip-dot" aria-hidden="true">◎</span>
        <span>median <strong>$${c.price}</strong> · ${n} retailer${n === 1 ? "" : "s"} · $${c.priceMin}–$${c.priceMax}</span>
      </span>`
    : n >= 2
      ? `<span class="tri-chip" title="Oracle consulted ${n} independent sources and took the median.">
          <span class="tri-chip-dot" aria-hidden="true">◎</span>
          <span>median <strong>$${c.price}</strong> · triangulated across ${n} sources</span>
        </span>`
      : `<span class="tri-chip tri-chip-single" title="Only one source so far. Oracle will triangulate once more retailers index this SKU.">
          <span class="tri-chip-dot" aria-hidden="true">◌</span>
          <span><strong>$${c.price}</strong> · single source, not yet triangulated</span>
        </span>`;
  const freshness = relativePriceFreshness(c.priceObservedAt);
  const freshnessNote = freshness ? `<span class="muted" style="font-size:11px;margin-left:6px;">${freshness}</span>` : "";
  return `
    <div class="pick-price-line">${rangeChip}${freshnessNote}</div>
    <div class="muted" style="font-size:11px;margin-top:4px;">Retailer price may differ. If the retailer is lower, take it.</div>
  `;
}

function relativePriceFreshness(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso.includes("T") || iso.includes("Z") ? iso : iso + "Z");
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1) return "observed today";
  if (days < 7) return `observed ${days}d ago`;
  if (days < 30) return `observed ${Math.floor(days / 7)}w ago`;
  if (days < 365) return `observed ${Math.floor(days / 30)}mo ago`;
  return `observed over a year ago, likely stale`;
}

function heroPickCard(r: AuditResult): HTMLElement {
  const o = r.specOptimal;
  const card = document.createElement("section");
  card.className = "card";
  // B5: surface a clickable retailer link (URL already scrubbed of affiliate
  // params at the search boundary).
  // Judge P1-5: aria-label for the external-link arrow that's otherwise visual-only.
  const urlLink = o.url
    ? `<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" aria-label="View ${esc(o.name)} at retailer (opens in new tab)" style="color:var(--hl-hi);text-decoration:underline;font-size:13px;">View at retailer <span aria-hidden="true">↗</span></a>`
    : `<span class="muted" style="font-size:13px;">No retailer URL available</span>`;
  card.innerHTML = `
    <div class="card-header"><h2>Oracle's top pick</h2></div>
    <div class="hero-pick">
      <div>
        <div class="pick-product"><span class="brand">${esc(o.brand ?? "")}</span> <span class="name">${esc(o.name)}</span></div>
        <div class="pick-price">${renderPriceLine(o)}</div>
        <div style="margin-top:6px;">${urlLink}</div>
      </div>
    </div>
    <details open>
      <summary>Why this came out on top</summary>
      <div class="criteria-detail">
        ${o.utilityBreakdown
          .map((b) => {
            return `<div class="criterion-row">
              <div class="label"><strong>${esc(b.criterion)}</strong></div>
              <div style="display:flex;gap:10px;align-items:center;color:var(--fg-dim);font-size:13px;">
                <span style="min-width:120px;">${priorityLabel(b.weight)}</span>
                <span style="flex:1;height:4px;background:var(--bg);border-radius:999px;overflow:hidden;"><span style="display:block;height:100%;background:var(--hl);width:${Math.round(b.score * 100)}%"></span></span>
                <span style="min-width:110px;">${fitLabel(b.score)}</span>
              </div>
              <div class="value" style="text-align:right;color:var(--accent);">${b.contribution >= 0.1 ? "★★★" : b.contribution >= 0.05 ? "★★" : b.contribution > 0 ? "★" : "·"}</div>
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
        <p class="card-subtitle">Tell Oracle in plain language what to change ("make it quieter", "budget is tight at $300"). Ranking below re-computes.</p>
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
      <div class="label"><strong>${esc(humanizeCriterion(c.name))}</strong></div>
      <input type="range" min="0" max="100" value="${pct}" data-criterion="${esc(c.name)}" />
      <div class="value" data-criterion-val="${esc(c.name)}" style="text-align:right;color:var(--fg-dim);font-family:inherit;font-size:12px;min-width:120px;">${priorityLabel(c.weight)}</div>
    `;
    wrap.append(row);
  }
  wrap.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      const v = Number(input.value) / 100;
      wrap.querySelector<HTMLSpanElement>(`[data-criterion-val="${input.dataset.criterion}"]`)!.textContent = priorityLabel(v);
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
        <span class="claim-attr">${esc(humanizeCriterion(c.attribute ?? "?"))}</span>
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
    list.append(rankRow(r.candidates[i]!, i, r.candidates[0]?.utilityScore ?? 1));
  }
  return card;
}

function rankRow(c: Candidate, i: number, topScore: number): HTMLElement {
  const row = document.createElement("div");
  row.className = `rank-row rank-${i + 1}`;
  // Normalize the displayed bar so the #1 pick is always 100% — makes the rank ordering visually clear
  const normalized = topScore > 0 ? Math.round(((c.utilityScore ?? 0) / topScore) * 100) : 0;
  const rankLabel = i === 0 ? "best" : i === 1 ? "runner-up" : i === 2 ? "third" : `#${i + 1}`;
  const cext = c as Candidate & { priceSources?: number; priceMin?: number; priceMax?: number };
  const n = cext.priceSources ?? 0;
  const priceStory = n >= 2
    ? `<span class="muted" style="font-size:11px;margin-left:8px;">triangulated across ${n} retailers${cext.priceMin != null && cext.priceMax != null && cext.priceMin !== cext.priceMax ? ` · range $${cext.priceMin}–$${cext.priceMax}` : ""}</span>`
    : n === 1
    ? `<span class="muted" style="font-size:11px;margin-left:8px;">one source so far</span>`
    : "";
  const retailerLink = c.url
    ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#CC785C;text-decoration:none;margin-left:8px;">view ↗</a>`
    : "";
  const detailLink = cext.skuId
    ? `<a href="/sku.html?id=${encodeURIComponent(cext.skuId)}" style="font-size:11px;color:#CC785C;text-decoration:none;margin-left:8px;">all sources →</a>`
    : "";
  row.innerHTML = `
    <div class="rank-num">${i === 0 ? "👑" : "#" + (i + 1)}</div>
    <div class="rank-product">
      <span class="brand">${esc(c.brand ?? "")}</span>
      <span class="name">${esc(c.name)}</span>
      ${i === 0 ? '<span style="display:inline-block;margin-left:8px;color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">best fit</span>' : ""}
      ${retailerLink}${detailLink}
    </div>
    <div class="rank-price">
      ${c.price != null && c.price > 0 ? `~$${c.price}` : "<span class='muted'>?</span>"}
      ${priceStory}
    </div>
    <div class="rank-match">
      <div class="rank-match-bar"><div style="width:${normalized}%"></div></div>
      <div class="rank-match-label">${esc(rankLabel)}</div>
    </div>
  `;
  return row;
}

function crossModelCard(r: AuditResult): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  // D4 — when cross-model returned nothing, DO NOT publish "provider keys
  // may need refresh" to the user. Either hide entirely (if the env flag
  // says the panel is disabled) or render a neutral "skipped in this run"
  // state. No alarming copy.
  if (r.crossModel.length === 0) {
    // Hide altogether unless the env reveals cross-model is expected to run.
    // Safe default in the field: return an empty fragment wrapper.
    card.style.display = "none";
    return card;
  }
  card.innerHTML = `
    <div class="card-header">
      <h2>What other frontier models picked</h2>
      <p class="card-subtitle">Oracle consulted every frontier model in parallel. Here's what each of them recommends for your question.</p>
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
          ${c.agreesWithLens ? "✓ agrees with Oracle" : "picks differently"}
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
  const enrichPart = r.elapsedMs.enrich !== undefined ? ` · enrich ${r.elapsedMs.enrich}ms` : "";
  el.textContent = `${(r.elapsedMs.total / 1000).toFixed(1)}s end-to-end · extract ${r.elapsedMs.extract}ms · search ${r.elapsedMs.search}ms · verify ${r.elapsedMs.verify}ms · rank ${r.elapsedMs.rank}ms · cross-model ${r.elapsedMs.crossModel}ms${enrichPart}`;
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
    list.append(rankRow(rescored[i]!, i, rescored[0]?.utilityScore ?? 1));
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
// Priority-value chips (appends "<value>" to the query textarea so each
// click adds a meta-preference the audit pipeline will pick up as a
// criterion). Persists across categories, doesn't require onboarding.
document.querySelectorAll<HTMLButtonElement>(".chip[data-values-add]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.dataset["valuesAdd"];
    if (!v) return;
    const ta = document.getElementById("query-prompt") as HTMLTextAreaElement | null;
    if (!ta) return;
    const cur = ta.value.trim();
    const add = cur.toLowerCase().includes(v.toLowerCase())
      ? "" // already there
      : (cur ? (cur.endsWith(",") ? ` ${v}` : `, ${v}`) : v);
    if (add) ta.value = cur + add;
    ta.focus();
  });
});

document.querySelectorAll<HTMLButtonElement>(".chip[data-example-query]").forEach((btn) => {
  btn.addEventListener("click", () => prefillExampleQuery(btn.dataset.exampleQuery!));
});
document.querySelectorAll<HTMLButtonElement>(".chip[data-example-audit]").forEach((btn) => {
  btn.addEventListener("click", () => prefillExampleAudit(btn.dataset.exampleAudit!));
});
document.querySelectorAll<HTMLButtonElement>(".chip[data-example-url]").forEach((btn) => {
  btn.addEventListener("click", () => prefillExampleUrl(btn.dataset.exampleUrl!));
});
$("audit-btn").addEventListener("click", () => {
  void runAudit();
});
void loadPackStats();

// CJ-W53 — chat-first dispatch. Flag via ?chat=1 OR localStorage.lens.ui.v2="chat"
// OR by default (first Sunday of the hackathon — chat is the primary surface;
// legacy paste-box remains reachable via ?chat=0 for direct comparison).
// Judge P0-2: persist `?chat=0` into localStorage so the legacy choice sticks
// across reloads without the param. Surface a toggle link in the footer so
// users without URL-editing skills can flip between views.
(function maybeMountChat(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("chat");
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem("lens.ui.v2")) || "";
    if (flag === "0") {
      try { localStorage.setItem("lens.ui.v2", "legacy"); } catch { /* silent */ }
    } else if (flag === "1") {
      try { localStorage.setItem("lens.ui.v2", "chat"); } catch { /* silent */ }
    }
    const decisionFlag = flag === "0" || flag === "1" ? flag : null;
    const off = decisionFlag === "0" || (decisionFlag == null && stored === "legacy");
    const on = !off;
    // Render UI-view toggle in the footer regardless of current mode.
    renderUiToggle(on);
    if (!on) return;
    // Lazy-import so the legacy bundle stays small when chat is disabled.
    void import("./chat/ChatView.js").then(({ mountChatView }) => {
      const mount = document.getElementById("chat-view");
      const hero = document.querySelector<HTMLElement>(".hero");
      const pasteBox = document.querySelector<HTMLElement>(".paste-box");
      const modeSwitch = document.querySelector<HTMLElement>(".mode-switch");
      const streamEl = document.getElementById("stream");
      const result = document.getElementById("result");
      if (!mount || !result) return;
      mount.hidden = false;
      if (hero) hero.style.display = "none";
      if (pasteBox) pasteBox.style.display = "none";
      if (modeSwitch) modeSwitch.style.display = "none";
      if (streamEl) streamEl.hidden = true;
      mountChatView({ mount, resultMount: result });
    });
  } catch (err) {
    console.warn("[main] chat mount failed:", (err as Error).message);
  }
})();

function renderUiToggle(chatActive: boolean): void {
  const footer = document.querySelector(".site-footer");
  if (!footer) return;
  if (document.getElementById("lens-ui-toggle")) return;
  const p = document.createElement("p");
  p.className = "footer-fine";
  p.id = "lens-ui-toggle";
  p.style.cssText = "margin-top:8px;";
  const label = chatActive
    ? "Prefer the classic paste-box view?"
    : "Prefer the new chat view?";
  const target = chatActive ? "?chat=0" : "?chat=1";
  const cta = chatActive ? "Switch to classic" : "Switch to chat";
  p.innerHTML = `${label} <a href="${target}" style="color:var(--accent,#DA7756);">${cta}</a>.`;
  footer.append(p);
}

// ---- F1 auth wiring (vanilla) ----
import { runCallbackIfPresent } from "./auth/callback.js";
import { openSignInModal } from "./auth/signin-modal.js";
import { refreshSession, subscribe, signout } from "./auth/session.js";
// ---- F9 PWA wiring ----
import { registerServiceWorker, renderIOSInstallHintIfNeeded, maybeShowInstallPrompt } from "./pwa/install.js";
registerServiceWorker();
renderIOSInstallHintIfNeeded();
(window as unknown as { __lensMaybeInstall?: () => void }).__lensMaybeInstall = () => void maybeShowInstallPrompt();

void runCallbackIfPresent();
void refreshSession();

// Inject a minimal nav-level auth control beside the existing brand/nav meta.
function renderAuthControl(): void {
  const nav = document.querySelector(".top-nav");
  if (!nav) return;
  const existing = document.getElementById("lens-auth-control");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "lens-auth-control";
  el.style.cssText = "display:flex;align-items:center;gap:10px;margin-left:auto;font-size:13px;";
  nav.append(el);
  subscribe((state) => {
    if (state.user) {
      el.innerHTML = `<span style="color:var(--fg-muted);">${escape(state.user.email)}</span> <button id="lens-signout" style="background:none;border:0;color:var(--accent-hi);cursor:pointer;font:inherit;text-decoration:underline;">Sign out</button>`;
      el.querySelector<HTMLButtonElement>("#lens-signout")!.addEventListener("click", () => void signout());
    } else if (!state.loading) {
      el.innerHTML = `<button id="lens-signin" style="background:none;border:1px solid var(--border);color:var(--fg-dim);padding:5px 12px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px;">Sign in to sync</button>`;
      el.querySelector<HTMLButtonElement>("#lens-signin")!.addEventListener("click", () => openSignInModal());
    }
  });
}
function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
renderAuthControl();

// improve-E5 — mount the architecture-reveal section. Self-updates every 60s.
import { mountArchitectureReveal } from "./architecture-reveal.js";
void mountArchitectureReveal();
