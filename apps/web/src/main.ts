import type { AuditResult, HostAI } from "@lens/shared";

const API_BASE = import.meta.env.VITE_LENS_API_URL ?? "http://localhost:8787";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function runAudit(): Promise<void> {
  const source = ($("source") as HTMLSelectElement).value as HostAI;
  const userPrompt = ($("user-prompt") as HTMLInputElement).value || undefined;
  const raw = ($("ai-output") as HTMLTextAreaElement).value;
  const file = ($("screenshot") as HTMLInputElement).files?.[0];

  const streamEl = $("stream");
  const logEl = $("stream-log");
  const resultEl = $("result");
  streamEl.hidden = false;
  resultEl.hidden = true;
  logEl.textContent = "";

  const body =
    file !== undefined
      ? { kind: "image", source, imageBase64: await fileToBase64(file), userPrompt }
      : { kind: "text", source, raw, userPrompt };

  // Streaming variant for live sub-agent panel.
  const res = await fetch(`${API_BASE}/audit/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    logEl.append(li(`Error: ${res.status}`));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AuditResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const chunk of parts) {
      const eventMatch = chunk.match(/^event: (.+)$/m);
      const dataMatch = chunk.match(/^data: (.+)$/m);
      if (!eventMatch || !dataMatch) continue;
      const event = eventMatch[1]!;
      const data = JSON.parse(dataMatch[1]!);
      logEl.append(li(`${event} · ${summarize(event, data)}`));
      if (event === "rank:done" && data?.top) {
        // partial — we don't have the full card until the non-streaming fetch finishes too
      }
    }
  }

  // Also hit the JSON endpoint for the full card (simpler render path).
  const cardRes = await fetch(`${API_BASE}/audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (cardRes.ok) {
    finalResult = (await cardRes.json()) as AuditResult;
    renderResult(finalResult);
  }
}

function summarize(event: string, data: unknown): string {
  if (event === "search:done") return `${(data as any).count} candidates`;
  if (event === "rank:done") return `top = ${(data as any).top?.name}`;
  if (event === "crossModel:done") {
    const results = (data as any).results as Array<{ provider: string; model: string; agreesWithLens: boolean }>;
    return results.map((r) => `${r.provider}:${r.model} ${r.agreesWithLens ? "agrees" : "disagrees"}`).join(", ");
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
  card.innerHTML = `
    <section class="panel ai-said">
      <h3>Your AI said</h3>
      <strong>${esc(r.aiRecommendation.pickedProduct.brand ?? "")} ${esc(r.aiRecommendation.pickedProduct.name)}</strong>
      <ul>${r.aiRecommendation.claims.map((c) => `<li>${esc(c.attribute)}: ${esc(c.statedValue)}</li>`).join("")}</ul>
    </section>
    <section class="panel spec-optimal">
      <h3>Spec-optimal for your criteria</h3>
      <strong>${esc(r.specOptimal.brand)} ${esc(r.specOptimal.name)} — $${r.specOptimal.price ?? "?"}</strong>
      <p>Utility ${r.specOptimal.utilityScore.toFixed(2)}</p>
      <ul>${r.specOptimal.utilityBreakdown
        .map(
          (b) =>
            `<li>${esc(b.criterion)}: w=${b.weight.toFixed(2)} × s=${b.score.toFixed(2)} = ${b.contribution.toFixed(2)}</li>`,
        )
        .join("")}</ul>
    </section>
    <section class="panel claims">
      <h3>Confabulated claims</h3>
      <ul>${r.claims
        .map(
          (c) =>
            `<li class="verdict-${c.verdict}"><strong>${esc(c.attribute)}:</strong> ${esc(c.statedValue)} — ${c.verdict}${c.note ? ` (${esc(c.note)})` : ""}</li>`,
        )
        .join("")}</ul>
    </section>
    <section class="panel cross-model">
      <h3>What other frontier models said</h3>
      <ul>${r.crossModel
        .map(
          (c) =>
            `<li>${esc(c.provider)} / ${esc(c.model)}: ${esc(c.pickedProduct.name)} ${c.agreesWithLens ? "✓ agrees with Lens" : "✗ agrees with host AI"}</li>`,
        )
        .join("")}</ul>
    </section>
  `;
  body.append(card);
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

$("audit-btn").addEventListener("click", () => {
  void runAudit();
});
