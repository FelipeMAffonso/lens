const API_BASE = import.meta.env.VITE_LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";

type SimStep = "observe" | "compare" | "detect" | "worker" | "result";
type LivePageType = "checkout" | "cart" | "product" | "article" | "landing" | "review" | "marketplace" | "other";

interface PassiveScanResponse {
  confirmed: Array<{
    packSlug: string;
    brignullId: string;
    verdict: "confirmed" | "uncertain";
    llmExplanation: string;
    regulatoryCitation?: {
      officialName: string;
      citation: string;
      status: string;
      userRightsPlainLanguage?: string;
    };
    suggestedInterventions: Array<{ canonicalName: string; consentTier: string }>;
    feeBreakdown?: { label: string; amountUsd?: number; frequency?: string };
  }>;
  dismissed: Array<{ packSlug: string; reason: string }>;
  latencyMs: number;
  ran: "opus" | "heuristic-only";
  runId: string;
}

interface LiveProbeHit {
  packSlug: `dark-pattern/${string}`;
  brignullId: string;
  severity: "nuisance" | "manipulative" | "deceptive" | "illegal-in-jurisdiction";
  excerpt: string;
}

interface LiveProbeResponse {
  ok: boolean;
  status: string;
  host?: string;
  pageType?: LivePageType;
  fetched?: { fetchedVia?: string; httpStatus?: number; bytes?: number; error?: string };
  hits?: LiveProbeHit[];
  passiveRequest?: {
    host: string;
    pageType: LivePageType;
    url: string;
    hits: LiveProbeHit[];
  };
  scan?: PassiveScanResponse;
  message?: string;
  error?: string;
}

interface LivePassiveRequest {
  host: string;
  pageType: LivePageType;
  url: string;
  hits: LiveProbeHit[];
}

export const DARK_PATTERN_DEMO_REQUEST = {
  host: "marriott.com",
  pageType: "checkout",
  url: "https://www.marriott.com/booking/checkout",
  jurisdiction: "us-federal",
  hits: [
    {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      excerpt:
        "Advertised room price is $249/night. Checkout adds Destination Amenity Fee $49/night after the user has selected dates. Total before tax becomes $298/night.",
    },
  ],
} as const;

export interface RunDefenseDemoOptions {
  apiBase?: string;
  delayMs?: number;
  fetchImpl?: typeof fetch;
}

let running = false;

export function mountDefenseSimulator(): void {
  const root = document.getElementById("dark-pattern-simulator");
  if (!root) return;
  root.querySelector<HTMLButtonElement>("[data-defense-demo-run]")?.addEventListener("click", () => {
    void runDefenseDemo(root);
  });
  mountLiveUrlProbe(root);

  document.querySelectorAll<HTMLAnchorElement>("[data-run-defense-demo]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#dark-pattern-simulator");
      void runDefenseDemo(root);
    });
  });
}

export function mountLiveUrlProbe(root: HTMLElement, options: RunDefenseDemoOptions = {}): void {
  const button = root.querySelector<HTMLButtonElement>("[data-live-probe-run]");
  if (!button || button.dataset["wired"] === "1") return;
  button.dataset["wired"] = "1";
  button.addEventListener("click", () => {
    void runLiveUrlProbe(root, options);
  });
}

export async function runLiveUrlProbe(
  root: HTMLElement,
  options: RunDefenseDemoOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.apiBase ?? API_BASE;
  const input = root.querySelector<HTMLInputElement>("[data-live-probe-url]");
  const textInput = root.querySelector<HTMLTextAreaElement>("[data-live-probe-text]");
  const button = root.querySelector<HTMLButtonElement>("[data-live-probe-run]");
  const result = root.querySelector<HTMLElement>("#live-probe-result");
  const rawUrl = input?.value.trim() ?? "";
  const pageText = textInput?.value.trim() || undefined;

  if (!isPublicHttpUrl(rawUrl)) {
    setResult(result, `<strong>Paste a public http(s) page first.</strong><p>Local/private URLs are blocked so the scanner cannot be used as a server-side fetch tunnel.</p>`);
    return;
  }

  button?.setAttribute("disabled", "true");
  if (button) button.textContent = "Scanning...";
  setResult(result, `<strong>Fetching public page.</strong><p>Lens is reading visible text from ${escapeHtml(new URL(rawUrl).hostname)} and deriving Stage-1 hits.</p>`);

  try {
    const probe = await callLiveProbe(fetchImpl, apiBase, rawUrl, pageText);
    renderLiveProbeResult(result, probe);
  } catch (err) {
    setResult(
      result,
      `<strong>Live scan failed.</strong><p>${escapeHtml((err as Error).message.slice(0, 260))}</p><p class="sim-note">For authenticated checkout pages, use the Chrome extension so Lens can scan the DOM you are already viewing without sharing unrelated browsing data.</p>`,
    );
  } finally {
    button?.removeAttribute("disabled");
    if (button) button.textContent = "Scan live URL";
  }
}

export async function runDefenseDemo(
  root: HTMLElement,
  options: RunDefenseDemoOptions = {},
): Promise<void> {
  if (running) return;
  running = true;
  const delayMs = options.delayMs ?? 520;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.apiBase ?? API_BASE;
  const button = root.querySelector<HTMLButtonElement>("[data-defense-demo-run]");
  const status = root.querySelector<HTMLElement>("#defense-sim-status");
  const network = root.querySelector<HTMLElement>("#defense-sim-network");
  const result = root.querySelector<HTMLElement>("#defense-sim-result");

  button?.setAttribute("disabled", "true");
  if (button) button.textContent = "Running...";
  root.classList.remove("sim-error", "sim-done");
  root.classList.add("sim-running");
  setStatus(status, "running");
  setResult(result, `<strong>Starting browser session.</strong><p>Lens is watching the price chain.</p>`);
  resetSteps(root);

  try {
    await activate(root, "observe", delayMs);
    await activate(root, "compare", delayMs);
    root.classList.add("sim-fee-visible");
    await activate(root, "detect", delayMs);
    root.classList.add("sim-overlay-visible");
    await activate(root, "worker", Math.max(120, delayMs / 2));
    network?.classList.add("is-live");
    setResult(result, `<strong>Worker request sent.</strong><p>Waiting for <code>POST /passive-scan</code>...</p>`);
    const response = await callPassiveScan(fetchImpl, apiBase);
    network?.classList.add("is-ok");
    await activate(root, "result", Math.max(120, delayMs / 2));
    renderPassiveScanResult(result, response);
    root.classList.add("sim-done");
    setStatus(status, response.ran);
  } catch (err) {
    root.classList.add("sim-error");
    setStatus(status, "error");
    setResult(
      result,
      `<strong>Worker call failed.</strong><p>${escapeHtml((err as Error).message.slice(0, 220))}</p><p class="sim-note">The local extension detection still found the hidden-cost pattern, but the Stage-2 Worker response did not return.</p>`,
    );
  } finally {
    running = false;
    root.classList.remove("sim-running");
    button?.removeAttribute("disabled");
    if (button) button.textContent = "Run again";
  }
}

async function callPassiveScan(fetchImpl: typeof fetch, apiBase: string): Promise<PassiveScanResponse> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetchImpl(`${apiBase}/passive-scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(DARK_PATTERN_DEMO_REQUEST),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as PassiveScanResponse | { error?: string } | null;
    if (!res.ok) {
      const msg = body && "error" in body && body.error ? body.error : `HTTP ${res.status}`;
      throw new Error(`passive-scan returned ${msg}`);
    }
    if (!body || !("runId" in body)) throw new Error("passive-scan returned an unreadable body");
    return body;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("passive-scan timed out after 15 seconds");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

async function callLiveProbe(
  fetchImpl: typeof fetch,
  apiBase: string,
  url: string,
  pageText?: string,
): Promise<LiveProbeResponse> {
  const body = JSON.stringify({ url, ...(pageText ? { pageText } : {}) });
  const probe = await fetchWithTimeout(fetchImpl, `${apiBase}/passive-scan/probe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }, 30_000).catch((err) => ({ error: err as Error }));

  if (!("error" in probe)) {
    const parsed = (await probe.json().catch(() => null)) as LiveProbeResponse | null;
    if (probe.ok && parsed) return parsed;
    if (probe.status !== 404 && probe.status !== 405) {
      throw new Error(parsed?.message ?? parsed?.error ?? `probe returned HTTP ${probe.status}`);
    }
  }

  return clientSideProbe(fetchImpl, apiBase, url, pageText);
}

async function clientSideProbe(
  fetchImpl: typeof fetch,
  apiBase: string,
  url: string,
  pageText?: string,
): Promise<LiveProbeResponse> {
  const page = pageText
    ? { text: pageText, fetchedVia: "provided-text", bytes: pageText.length }
    : await fetchViaJina(fetchImpl, url);
  const passiveRequest = buildPassiveRequest(url, page.text);
  if (passiveRequest.hits.length === 0) {
    return {
      ok: false,
      status: "no_dark_pattern_hits",
      host: passiveRequest.host,
      pageType: passiveRequest.pageType,
      fetched: { fetchedVia: page.fetchedVia, bytes: page.bytes },
      hits: [],
      message: "Lens fetched the page but did not find a supported dark-pattern hit in the visible text.",
    };
  }
  const scan = await fetchWithTimeout(fetchImpl, `${apiBase}/passive-scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(passiveRequest),
  }, 45_000);
  const scanBody = (await scan.json().catch(() => null)) as PassiveScanResponse | { error?: string } | null;
  if (!scan.ok || !scanBody || !("runId" in scanBody)) {
    throw new Error((scanBody && "error" in scanBody && scanBody.error) || `passive-scan returned HTTP ${scan.status}`);
  }
  return {
    ok: true,
    status: "scanned",
    host: passiveRequest.host,
    pageType: passiveRequest.pageType,
    fetched: { fetchedVia: page.fetchedVia, bytes: page.bytes },
    hits: passiveRequest.hits,
    passiveRequest,
    scan: scanBody,
  };
}

async function fetchViaJina(fetchImpl: typeof fetch, url: string): Promise<{ text: string; fetchedVia: string; bytes: number }> {
  const res = await fetchWithTimeout(fetchImpl, `https://r.jina.ai/${url}`, {
    headers: { accept: "text/plain,text/markdown,*/*" },
  }, 30_000);
  const text = (await res.text()).slice(0, 40_000);
  if (!res.ok || !text.trim()) throw new Error(`public page fetch returned HTTP ${res.status}`);
  return { text, fetchedVia: "jina-reader-browser-fallback", bytes: text.length };
}

function buildPassiveRequest(url: string, text: string): LivePassiveRequest {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const pageType = inferLivePageType(parsed, text);
  const normalized = normalizeText(text).slice(0, 40_000);
  const patterns: Array<{ packSlug: LiveProbeHit["packSlug"]; brignullId: string; severity: LiveProbeHit["severity"]; re: RegExp }> = [
    {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      re: /\b(?:resort|destination|amenity|facility|cleaning|service|property|mandatory|convenience|processing)\s+fees?\b|(?:taxes\s*(?:&|and)\s*fees)|(?:fees?\s+(?:not\s+included|due\s+at\s+(?:the\s+)?property|collected\s+at\s+property|paid\s+at\s+property))/i,
    },
    {
      packSlug: "dark-pattern/drip-pricing",
      brignullId: "drip-pricing",
      severity: "deceptive",
      re: /\b(?:subtotal|room\s+rate|nightly\s+rate|base\s+fare|base\s+price)\b[\s\S]{0,240}\b(?:taxes|fees|service\s+fee|total\s+due|pay\s+at\s+property)\b/i,
    },
    {
      packSlug: "dark-pattern/fake-scarcity",
      brignullId: "fake-scarcity",
      severity: "manipulative",
      re: /\b(?:only\s+\d+\s+(?:rooms?|left|available)|\d+\s+(?:people|travellers|travelers)\s+(?:are\s+)?(?:viewing|looking)|in\s+high\s+demand|selling\s+out|booked\s+\d+\s+times)\b/i,
    },
    {
      packSlug: "dark-pattern/fake-urgency",
      brignullId: "fake-urgency",
      severity: "manipulative",
      re: /\b(?:limited\s+time|deal\s+ends|ends\s+in|expires\s+in|reserve\s+now|book\s+now\s+or|timer|countdown)\b/i,
    },
  ];
  const hits: LiveProbeHit[] = [];
  for (const pattern of patterns) {
    const match = pattern.re.exec(normalized);
    if (!match) continue;
    hits.push({
      packSlug: pattern.packSlug,
      brignullId: pattern.brignullId,
      severity: pattern.severity,
      excerpt: excerptAround(normalized, match.index, match[0].length),
    });
  }
  return { host, pageType, url, hits };
}

function renderLiveProbeResult(host: HTMLElement | null, response: LiveProbeResponse): void {
  const hits = response.hits ?? [];
  const scan = response.scan;
  const first = scan?.confirmed?.[0];
  const fetched = response.fetched;
  if (!response.ok || !scan) {
    setResult(
      host,
      `<div class="live-probe-meta">
        <span>${escapeHtml(response.host ?? "unknown host")}</span>
        <span>${escapeHtml(response.pageType ?? "unknown page")}</span>
        <span>${escapeHtml(fetched?.fetchedVia ?? "not fetched")}</span>
      </div>
      <strong>No supported dark-pattern hit found.</strong>
      <p>${escapeHtml(response.message ?? "Try a checkout/cart page or paste visible fee text into the fallback box.")}</p>`,
    );
    return;
  }
  setResult(
    host,
    `<div class="live-probe-meta">
      <span>${escapeHtml(response.host ?? "unknown host")}</span>
      <span>${escapeHtml(response.pageType ?? "unknown page")}</span>
      <span>${escapeHtml(fetched?.fetchedVia ?? "fetched")}${fetched?.bytes ? ` · ${Math.round(fetched.bytes / 1000)}KB` : ""}</span>
      <span>${escapeHtml(scan.ran)} · ${escapeHtml(scan.runId)}</span>
    </div>
    <strong>${hits.length} page-derived hit${hits.length === 1 ? "" : "s"} sent to Stage-2 verifier.</strong>
    <div class="live-hit-list">
      ${hits.map((hit) => `<div><code>${escapeHtml(hit.packSlug)}</code><p>${escapeHtml(hit.excerpt)}</p></div>`).join("")}
    </div>
    <p><strong>Verifier:</strong> ${escapeHtml(first?.verdict ?? "uncertain")} — ${escapeHtml(first?.llmExplanation ?? "No Stage-2 explanation returned.")}</p>
    ${
      first?.regulatoryCitation
        ? `<p><strong>Rule:</strong> ${escapeHtml(first.regulatoryCitation.officialName)} (${escapeHtml(first.regulatoryCitation.citation)}).</p>`
        : `<p class="sim-note">No regulation citation attached in this run. The evidence and run id are still preserved.</p>`
    }`,
  );
}

function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  return fetchImpl(url, { ...init, signal: ctrl.signal })
    .catch((err) => {
      if ((err as Error).name === "AbortError") {
        throw new Error(`${url} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
      }
      throw err;
    })
    .finally(() => window.clearTimeout(timer));
}

function resetSteps(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".sim-steps li").forEach((li) => {
    li.classList.remove("is-active", "is-done");
  });
}

async function activate(root: HTMLElement, step: SimStep, delayMs: number): Promise<void> {
  root.querySelectorAll<HTMLElement>(".sim-steps li").forEach((li) => {
    const isStep = li.dataset["step"] === step;
    if (isStep) li.classList.add("is-active");
    if (!isStep && li.classList.contains("is-active")) {
      li.classList.remove("is-active");
      li.classList.add("is-done");
    }
  });
  await pause(delayMs);
}

function renderPassiveScanResult(host: HTMLElement | null, response: PassiveScanResponse): void {
  const first = response.confirmed[0];
  const verdict = first?.verdict ?? "uncertain";
  const citation = first?.regulatoryCitation;
  const intervention = first?.suggestedInterventions[0];
  const explanation =
    first?.llmExplanation ??
    "Stage-2 returned no specific explanation. The Stage-1 detector still preserved the hit for review.";
  const ranLabel =
    response.ran === "opus"
      ? "Opus verifier ran"
      : "Heuristic-only fallback";

  setResult(
    host,
    `<div class="sim-verdict-row">
      <span class="sim-verdict ${verdict}">${escapeHtml(verdict)}</span>
      <code>${escapeHtml(response.runId)}</code>
    </div>
    <strong>${ranLabel} in ${Math.round(response.latencyMs)}ms.</strong>
    <p>${escapeHtml(explanation)}</p>
    ${
      citation
        ? `<p><strong>Rule:</strong> ${escapeHtml(citation.officialName)} (${escapeHtml(citation.citation)}). ${escapeHtml(citation.userRightsPlainLanguage ?? "")}</p>`
        : `<p><strong>Rule:</strong> pack hit preserved; no regulation citation attached in this run.</p>`
    }
    ${
      intervention
        ? `<p><strong>Next action:</strong> ${escapeHtml(intervention.canonicalName)} (${escapeHtml(intervention.consentTier)}).</p>`
        : `<p><strong>Next action:</strong> show warning badge, keep checkout evidence, and offer complaint/refund draft when user approves.</p>`
    }`,
  );
}

function setStatus(host: HTMLElement | null, text: string): void {
  if (host) host.textContent = text;
}

function setResult(host: HTMLElement | null, html: string): void {
  if (host) host.innerHTML = html;
}

function pause(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function inferLivePageType(url: URL, text: string): LivePageType {
  const joined = `${url.pathname} ${url.search} ${text.slice(0, 2000)}`.toLowerCase();
  if (/\b(checkout|payment|confirm|reservation|booking\/confirm|cart)\b/.test(joined)) {
    return joined.includes("cart") ? "cart" : "checkout";
  }
  if (/\b(hotel|room|stay|nightly|resort|booking)\b/.test(joined)) return "marketplace";
  if (/\b(review|ratings?)\b/.test(joined)) return "review";
  return "product";
}

function excerptAround(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 150);
  const end = Math.min(text.length, index + len + 170);
  return normalizeText(`${start > 0 ? "... " : ""}${text.slice(start, end)}${end < text.length ? " ..." : ""}`).slice(0, 380);
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return !(
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function escapeHtml(s: string | number | boolean | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}
