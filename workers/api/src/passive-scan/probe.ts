import type { Context } from "hono";
import { z } from "zod";
import type { PackRegistry } from "@lens/shared";
import type { Env } from "../index.js";
import { htmlToText } from "../provenance/claim.js";
import { runPassiveScanRequest } from "./handler.js";
import type { Hit, PassiveScanRequest } from "./types.js";

const JourneyPageInputSchema = z
  .object({
    url: z.string().url(),
    pageText: z.string().max(40_000).optional(),
    html: z.string().max(300_000).optional(),
  })
  .strict();

const ProbeRequestSchema = z
  .object({
    url: z.string().url(),
    pageText: z.string().max(40_000).optional(),
    html: z.string().max(300_000).optional(),
    journeyPages: z.array(JourneyPageInputSchema).max(8).optional(),
    maxPages: z.number().int().min(1).max(8).optional().default(6),
  })
  .strict();

type ProbeRequest = z.infer<typeof ProbeRequestSchema>;
type PageType = PassiveScanRequest["pageType"];

export interface ProbeFetchResult {
  url?: string;
  text: string;
  fetchedVia: "provided-text" | "provided-html" | "direct-fetch" | "jina-reader" | "unavailable";
  httpStatus?: number;
  bytes: number;
  error?: string;
  title?: string;
  links?: string[];
  reason?: string;
}

export interface ProbePageAnalysis {
  url: string;
  host: string;
  pageType: PageType;
  hits: Hit[];
  fetched: ProbeFetchResult;
  detectorsRun: string[];
  linksDiscovered: number;
}

export interface ProbeAnalysis {
  host: string;
  pageType: PageType;
  hits: Hit[];
  fetched: ProbeFetchResult;
  detectorsRun: string[];
  pages: ProbePageAnalysis[];
  journey: {
    mode: "extension-captures" | "bounded-same-site-crawl" | "single-page";
    requestedMaxPages: number;
    scannedPages: number;
    pagesWithHits: number;
    linksDiscovered: number;
    stagesSeen: PageType[];
  };
}

const PATTERNS: Array<{
  slug: Hit["packSlug"];
  brignullId: string;
  severity: Hit["severity"];
  re: RegExp;
}> = [
  {
    slug: "dark-pattern/hidden-costs",
    brignullId: "hidden-costs",
    severity: "deceptive",
    re: /\b(?:resort|destination|amenity|facility|cleaning|service|property|mandatory|convenience|processing)\s+fees?\b|(?:taxes\s*(?:&|and)\s*fees)|(?:fees?\s+(?:not\s+included|due\s+at\s+(?:the\s+)?property|collected\s+at\s+property|paid\s+at\s+property))/i,
  },
  {
    slug: "dark-pattern/drip-pricing",
    brignullId: "drip-pricing",
    severity: "deceptive",
    re: /\b(?:subtotal|room\s+rate|nightly\s+rate|base\s+fare|base\s+price)\b[\s\S]{0,240}\b(?:taxes|fees|service\s+fee|total\s+due|pay\s+at\s+property)\b/i,
  },
  {
    slug: "dark-pattern/fake-scarcity",
    brignullId: "fake-scarcity",
    severity: "manipulative",
    re: /\b(?:only\s+\d+\s+(?:rooms?|left|available)|\d+\s+(?:people|travellers|travelers)\s+(?:are\s+)?(?:viewing|looking)|in\s+high\s+demand|selling\s+out|booked\s+\d+\s+times)\b/i,
  },
  {
    slug: "dark-pattern/fake-urgency",
    brignullId: "fake-urgency",
    severity: "manipulative",
    re: /\b(?:limited\s+time|deal\s+ends|ends\s+in|expires\s+in|reserve\s+now|book\s+now\s+or|timer|countdown)\b/i,
  },
  {
    slug: "dark-pattern/preselection",
    brignullId: "preselection",
    severity: "manipulative",
    re: /\b(?:pre[-\s]?selected|selected\s+for\s+you|recommended\s+add[-\s]?on|add\s+travel\s+protection|donation\s+added|subscribe\s+and\s+save\s+selected)\b/i,
  },
  {
    slug: "dark-pattern/forced-continuity",
    brignullId: "forced-continuity",
    severity: "deceptive",
    re: /\b(?:free\s+trial|trial\s+period|introductory\s+offer)\b[\s\S]{0,240}\b(?:auto(?:matically)?\s+(?:renews?|bills?|charges?)|then\s+\$\d|unless\s+cancel(?:led|ed)|converts?\s+to\s+paid)\b/i,
  },
  {
    slug: "dark-pattern/roach-motel",
    brignullId: "roach-motel",
    severity: "manipulative",
    re: /\b(?:cancel(?:lation)?\s+(?:by\s+phone|requires\s+calling|call\s+to\s+cancel)|to\s+cancel\s+(?:call|contact\s+support)|membership\s+cannot\s+be\s+cancelled\s+online|subscription\s+cannot\s+be\s+cancelled\s+online)\b/i,
  },
  {
    slug: "dark-pattern/obstruction",
    brignullId: "obstruction",
    severity: "manipulative",
    re: /\b(?:are\s+you\s+sure\s+you\s+want\s+to\s+(?:leave|cancel)|continue\s+without|keep\s+my\s+benefits|one\s+more\s+step|required\s+to\s+continue|must\s+create\s+an\s+account)\b/i,
  },
  {
    slug: "dark-pattern/confirmshaming",
    brignullId: "confirmshaming",
    severity: "manipulative",
    re: /\b(?:no\s+thanks,\s*(?:i\s+)?(?:hate|prefer|want)|i\s+don'?t\s+care\s+about|i\s+like\s+paying\s+full\s+price|miss\s+out\s+on\s+savings|reject\s+this\s+deal)\b/i,
  },
  {
    slug: "dark-pattern/sneak-into-basket",
    brignullId: "sneak-into-basket",
    severity: "deceptive",
    re: /\b(?:added\s+to\s+(?:your\s+)?(?:basket|cart)|included\s+with\s+your\s+order|protection\s+plan\s+added|travel\s+insurance\s+added|donation\s+added|membership\s+added)\b/i,
  },
  {
    slug: "dark-pattern/trick-wording",
    brignullId: "trick-wording",
    severity: "manipulative",
    re: /\b(?:double\s+negative|uncheck\s+to\s+(?:decline|opt\s+out)|check\s+to\s+not\s+receive|don'?t\s+not|opt\s+out\s+of\s+not)\b/i,
  },
  {
    slug: "dark-pattern/fake-social-proof",
    brignullId: "fake-social-proof",
    severity: "manipulative",
    re: /\b(?:\d+\s+(?:people|customers|shoppers|travellers|travelers)\s+(?:bought|booked|viewed|are\s+viewing)|popular\s+with\s+other\s+shoppers|trending\s+now|recently\s+purchased|verified\s+buyers\s+are\s+viewing)\b/i,
  },
  {
    slug: "dark-pattern/comparison-prevention",
    brignullId: "comparison-prevention",
    severity: "manipulative",
    re: /\b(?:price\s+shown\s+at\s+checkout|see\s+price\s+in\s+cart|details\s+revealed\s+after\s+checkout|final\s+price\s+available\s+after\s+booking|fees?\s+calculated\s+later)\b/i,
  },
  {
    slug: "dark-pattern/forced-registration",
    brignullId: "forced-registration",
    severity: "manipulative",
    re: /\b(?:create\s+an\s+account\s+to\s+(?:continue|checkout|see\s+price)|sign\s+in\s+to\s+(?:continue|complete\s+purchase)|account\s+required\s+for\s+checkout)\b/i,
  },
  {
    slug: "dark-pattern/privacy-zuckering",
    brignullId: "privacy-zuckering",
    severity: "manipulative",
    re: /\b(?:share\s+your\s+data\s+with\s+partners|personalized\s+ads|accept\s+all\s+cookies|legitimate\s+interest|we\s+may\s+sell\s+or\s+share\s+your\s+personal\s+information)\b/i,
  },
  {
    slug: "dark-pattern/disguised-ads",
    brignullId: "disguised-ads",
    severity: "deceptive",
    re: /\b(?:sponsored\s+result|ad\s+by|paid\s+placement|promoted\s+listing|affiliate\s+commission)\b/i,
  },
  {
    slug: "dark-pattern/visual-interference",
    brignullId: "visual-interference",
    severity: "manipulative",
    re: /\b(?:recommended\s+button|primary\s+button|greyed\s+out|hard\s+to\s+find|tiny\s+link|low\s+contrast|hidden\s+below)\b/i,
  },
  {
    slug: "dark-pattern/forced-action",
    brignullId: "forced-action",
    severity: "manipulative",
    re: /\b(?:required\s+to\s+subscribe|must\s+join\s+to\s+continue|required\s+phone\s+number|required\s+email\s+to\s+view|complete\s+profile\s+to\s+checkout)\b/i,
  },
];

export async function handlePassiveScanProbe(
  c: Context<{ Bindings: Env; Variables: { userId?: string; anonUserId?: string } }>,
  registry: PackRegistry,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = ProbeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  if (!isPublicHttpUrl(parsed.data.url)) {
    return c.json({ error: "url_not_allowed", message: "Only public http(s) URLs can be scanned." }, 400);
  }
  const disallowedJourneyUrl = parsed.data.journeyPages?.find(
    (p) => !isPublicHttpUrl(p.url) || !isSameSite(parsed.data.url, p.url),
  );
  if (disallowedJourneyUrl) {
    return c.json(
      {
        error: "journey_url_not_allowed",
        message: "Journey pages must be public http(s) URLs on the same site as the seed URL.",
        url: disallowedJourneyUrl.url,
      },
      400,
    );
  }

  const analysis = await scanProbeJourney(parsed.data);

  if (analysis.hits.length === 0) {
    return c.json({
      ok: false,
      status: "no_dark_pattern_hits",
      host: analysis.host,
      pageType: analysis.pageType,
      fetched: redactFetch(analysis.fetched),
      detectorsRun: analysis.detectorsRun,
      journey: analysis.journey,
      pages: analysis.pages.map(redactPage),
      message:
        analysis.fetched.fetchedVia === "unavailable"
          ? "Lens could not fetch enough page text. Use the extension on the live page or paste visible checkout text."
          : "Lens scanned the reachable journey pages but did not find a supported dark-pattern hit in the visible text.",
    });
  }

  const passiveRequest: PassiveScanRequest = {
    host: analysis.host,
    pageType: analysis.pageType,
    url: parsed.data.url,
    jurisdiction: "us-federal",
    hits: analysis.hits,
  };
  const scan = await runPassiveScanRequest(c.env, registry, passiveRequest, {
    userId: c.get("userId") ?? null,
    anonUserId: c.get("anonUserId") ?? null,
  });

  return c.json({
    ok: true,
    status: "scanned",
    host: analysis.host,
    pageType: analysis.pageType,
    fetched: redactFetch(analysis.fetched),
    detectorsRun: analysis.detectorsRun,
    journey: analysis.journey,
    pages: analysis.pages.map(redactPage),
    hits: analysis.hits,
    passiveRequest,
    scan,
  });
}

export function analyzeDarkPatternPage(url: string, fetched: ProbeFetchResult): ProbeAnalysis {
  const page = analyzeProbePage(url, fetched);
  return buildProbeAnalysis([page], 1, "single-page");
}

async function scanProbeJourney(input: ProbeRequest): Promise<ProbeAnalysis> {
  const maxPages = input.maxPages ?? 6;
  const capturedPages = input.journeyPages?.length ? input.journeyPages : undefined;
  const seedFetched = await fetchedFromInput(input.url, input);
  const pages: ProbePageAnalysis[] = [analyzeProbePage(input.url, seedFetched)];

  if (capturedPages) {
    for (const page of capturedPages.slice(0, Math.max(0, maxPages - pages.length))) {
      const fetched = await fetchedFromInput(page.url, page);
      pages.push(analyzeProbePage(page.url, fetched));
    }
    return buildProbeAnalysis(pages, maxPages, "extension-captures");
  }

  if (seedFetched.fetchedVia === "provided-text" || seedFetched.fetchedVia === "provided-html" || maxPages <= 1) {
    return buildProbeAnalysis(pages, maxPages, "single-page");
  }

  const candidates = selectJourneyLinks(input.url, seedFetched.links ?? [], maxPages - 1);
  const fetchedPages = await Promise.all(candidates.map((candidate) => fetchPageText(candidate.url, candidate.reason)));
  for (let i = 0; i < fetchedPages.length; i++) {
    pages.push(analyzeProbePage(candidates[i]!.url, fetchedPages[i]!));
  }

  const seenUrls = new Set(pages.map((p) => normalizeUrlForVisit(p.url)));
  const secondHopLinks = pages
    .slice(1)
    .flatMap((p) => (p.fetched.links ?? []).map((url) => ({ url, from: p.url })));
  if (pages.length < maxPages && secondHopLinks.length > 0) {
    const secondHopCandidates = selectJourneyLinks(
      input.url,
      secondHopLinks.map((l) => l.url),
      maxPages - pages.length,
      seenUrls,
    );
    const secondFetched = await Promise.all(
      secondHopCandidates.map((candidate) => fetchPageText(candidate.url, `from ${new URL(candidate.url).pathname || "/"}`)),
    );
    for (let i = 0; i < secondFetched.length; i++) {
      pages.push(analyzeProbePage(secondHopCandidates[i]!.url, secondFetched[i]!));
    }
  }

  return buildProbeAnalysis(pages, maxPages, "bounded-same-site-crawl");
}

async function fetchedFromInput(
  url: string,
  input: { pageText?: string | undefined; html?: string | undefined },
): Promise<ProbeFetchResult> {
  if (input.pageText?.trim()) {
    return {
      url,
      text: input.pageText.trim(),
      fetchedVia: "provided-text",
      bytes: input.pageText.length,
      links: [],
      reason: "extension supplied visible text",
    };
  }
  if (input.html?.trim()) {
    const links = extractLinks(input.html, url);
    const title = extractTitle(input.html);
    return {
      url,
      text: htmlToText(input.html).slice(0, 40_000),
      fetchedVia: "provided-html",
      bytes: input.html.length,
      links,
      ...(title ? { title } : {}),
      reason: "extension supplied DOM snapshot",
    };
  }
  return fetchPageText(url, "seed");
}

function analyzeProbePage(url: string, fetched: ProbeFetchResult): ProbePageAnalysis {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const pageType = inferPageType(parsed, fetched.text);
  const text = normalize(fetched.text).slice(0, 40_000);
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const detectorsRun = PATTERNS.map((p) => p.slug);
  for (const pattern of PATTERNS) {
    const match = pattern.re.exec(text);
    if (!match || seen.has(pattern.slug)) continue;
    seen.add(pattern.slug);
    hits.push({
      packSlug: pattern.slug,
      brignullId: pattern.brignullId,
      severity: pattern.severity,
      excerpt: excerptAround(text, match.index, match[0].length),
    });
  }
  return {
    url,
    host,
    pageType,
    hits: hits.slice(0, 20),
    fetched: { ...fetched, url },
    detectorsRun,
    linksDiscovered: fetched.links?.length ?? 0,
  };
}

function buildProbeAnalysis(
  pages: ProbePageAnalysis[],
  requestedMaxPages: number,
  mode: ProbeAnalysis["journey"]["mode"],
): ProbeAnalysis {
  const first = pages[0]!;
  const hits = aggregateHits(pages);
  const stagesSeen = Array.from(new Set(pages.map((p) => p.pageType)));
  return {
    host: first.host,
    pageType: strongestPageType(stagesSeen),
    hits,
    fetched: first.fetched,
    detectorsRun: first.detectorsRun,
    pages,
    journey: {
      mode,
      requestedMaxPages,
      scannedPages: pages.length,
      pagesWithHits: pages.filter((p) => p.hits.length > 0).length,
      linksDiscovered: pages.reduce((sum, p) => sum + p.linksDiscovered, 0),
      stagesSeen,
    },
  };
}

function aggregateHits(pages: ProbePageAnalysis[]): Hit[] {
  const out: Hit[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const hit of page.hits) {
      const key = `${hit.packSlug}:${hit.excerpt.toLowerCase().slice(0, 90)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pageLabel = page.pageType === "other" ? "page" : page.pageType;
      out.push({
        ...hit,
        excerpt: `[${pageLabel}] ${hit.excerpt}`.slice(0, 400),
      });
      if (out.length >= 20) return out;
    }
  }
  return out;
}

function strongestPageType(stagesSeen: PageType[]): PageType {
  const priority: PageType[] = ["checkout", "cart", "marketplace", "product", "review", "landing", "article", "other"];
  return priority.find((stage) => stagesSeen.includes(stage)) ?? "other";
}

async function fetchPageText(url: string, reason?: string): Promise<ProbeFetchResult> {
  const direct: ProbeFetchResult = await fetchDirect(url, reason).catch((err): ProbeFetchResult => ({
    url,
    text: "",
    fetchedVia: "unavailable",
    bytes: 0,
    error: (err as Error).message,
    links: [],
    ...(reason ? { reason } : {}),
  }));
  if (direct.text.length >= 500 || hasDarkPatternTerm(direct.text)) return direct;

  const jina: ProbeFetchResult = await fetchJina(url, reason).catch((err): ProbeFetchResult => ({
    url,
    text: "",
    fetchedVia: "unavailable",
    bytes: 0,
    error: `${direct.error ? `${direct.error}; ` : ""}jina: ${(err as Error).message}`,
    links: direct.links ?? [],
    ...(reason ? { reason } : {}),
  }));
  if (jina.text) {
    return { ...jina, links: mergeLinks(direct.links ?? [], jina.links ?? []) };
  }
  const out: ProbeFetchResult = {
    url,
    text: direct.text,
    fetchedVia: direct.fetchedVia,
    bytes: direct.bytes,
    links: direct.links ?? [],
    ...(reason ? { reason } : {}),
  };
  if (direct.httpStatus !== undefined) out.httpStatus = direct.httpStatus;
  const error = direct.error ?? jina.error;
  if (error) out.error = error;
  return out;
}

async function fetchDirect(url: string, reason?: string): Promise<ProbeFetchResult> {
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LensConsumerDefense/1.0; +https://lens-b1h.pages.dev)",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
  }, 8_000);
  const raw = (await res.text()).slice(0, 300_000);
  const title = extractTitle(raw);
  return {
    url: res.url || url,
    text: htmlToText(raw).slice(0, 40_000),
    fetchedVia: "direct-fetch",
    httpStatus: res.status,
    bytes: raw.length,
    links: extractLinks(raw, res.url || url),
    ...(title ? { title } : {}),
    ...(reason ? { reason } : {}),
    ...(res.ok ? {} : { error: `http-${res.status}` }),
  };
}

async function fetchJina(url: string, reason?: string): Promise<ProbeFetchResult> {
  const res = await fetchWithTimeout("https://r.jina.ai/" + url, {
    headers: { Accept: "text/plain,text/markdown,*/*" },
  }, 10_000);
  const raw = (await res.text()).slice(0, 300_000);
  if (!res.ok) throw new Error(`http-${res.status}`);
  return {
    url,
    text: normalize(raw).slice(0, 40_000),
    fetchedVia: "jina-reader",
    httpStatus: res.status,
    bytes: raw.length,
    links: extractMarkdownLinks(raw, url),
    ...(reason ? { reason } : {}),
  };
}

function inferPageType(url: URL, text: string): PageType {
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
  return normalize(`${start > 0 ? "... " : ""}${text.slice(start, end)}${end < text.length ? " ..." : ""}`).slice(0, 380);
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasDarkPatternTerm(text: string): boolean {
  return PATTERNS.some((p) => p.re.test(text));
}

function redactFetch(fetched: ProbeFetchResult): Omit<ProbeFetchResult, "text"> {
  const { text: _text, ...rest } = fetched;
  return rest;
}

function redactPage(page: ProbePageAnalysis): Omit<ProbePageAnalysis, "fetched"> & {
  fetched: Omit<ProbeFetchResult, "text">;
} {
  return {
    ...page,
    fetched: redactFetch(page.fetched),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`fetch timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]{0,240}?)<\/title>/i);
  const title = m?.[1] ? normalize(stripTags(m[1])) : "";
  return title || undefined;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\bhref\s*=\s*(?:"([^"]{1,1500})"|'([^']{1,1500})'|([^\s"'<>]{1,1500}))/gi;
  for (const m of html.matchAll(re)) {
    const raw = decodeHtmlEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
    const normalized = normalizeCandidateUrl(raw, baseUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 160) break;
  }
  return out;
}

function extractMarkdownLinks(text: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\[[^\]]{0,160}\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/gi,
    /\b(?:URL|Source|Link):\s*(https?:\/\/\S+|\/\S+)/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const normalized = normalizeCandidateUrl((m[1] ?? "").trim(), baseUrl);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
      if (out.length >= 120) return out;
    }
  }
  return out;
}

function normalizeCandidateUrl(raw: string, baseUrl: string): string | null {
  if (!raw || raw.startsWith("#")) return null;
  if (/^(?:mailto|tel|javascript|data):/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, baseUrl);
  } catch {
    return null;
  }
  if (!isPublicHttpUrl(url.href) || !isSameSite(baseUrl, url.href)) return null;
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|fbclid|gclid|msclkid|yclid|irclickid|tag|ref|ascsubtag|affiliate)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.href;
}

function selectJourneyLinks(
  seedUrl: string,
  links: string[],
  limit: number,
  seenInput: Set<string> = new Set([normalizeUrlForVisit(seedUrl)]),
): Array<{ url: string; reason: string }> {
  if (limit <= 0) return [];
  const deduped: string[] = [];
  const seen = new Set(seenInput);
  for (const link of links) {
    const normalized = normalizeCandidateUrl(link, seedUrl);
    if (!normalized) continue;
    const visitKey = normalizeUrlForVisit(normalized);
    if (seen.has(visitKey)) continue;
    seen.add(visitKey);
    deduped.push(normalized);
  }
  return deduped
    .map((url) => ({ url, score: journeyLinkScore(seedUrl, url), reason: journeyReason(url) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, limit)
    .map(({ url, reason }) => ({ url, reason }));
}

function journeyLinkScore(seedUrl: string, raw: string): number {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 0;
  }
  if (!isSameSite(seedUrl, url.href)) return 0;
  const path = `${url.pathname} ${url.search}`.toLowerCase();
  let score = 0;
  if (/\b(checkout|payment|pay|cart|basket|bag|reserve|reservation|book|booking|rooms?|rates?|availability|select-room|choose-room)\b/.test(path)) score += 100;
  if (/\b(fee|fees|tax|total|price|summary|confirm|review|details|terms|cancel|cancellation|subscription|trial|renew)\b/.test(path)) score += 55;
  if (/\b(product|dp|pdp|item|sku|offer|deal)\b/.test(path)) score += 25;
  if (/\b(login|sign-in|signin|account|register|join|member)\b/.test(path)) score += 18;
  if (/\b(help|support|policy|privacy|careers|investor|press|blog|news|sitemap|accessibility)\b/.test(path)) score -= 45;
  if (/\.(?:jpg|jpeg|png|webp|gif|svg|pdf|zip|css|js)$/i.test(url.pathname)) score -= 100;
  if (url.hostname.replace(/^www\./, "") !== new URL(seedUrl).hostname.replace(/^www\./, "")) score -= 10;
  return score;
}

function journeyReason(raw: string): string {
  const path = new URL(raw).pathname.toLowerCase();
  if (/checkout|payment|pay|confirm/.test(path)) return "likely checkout step";
  if (/cart|basket|bag/.test(path)) return "likely cart step";
  if (/book|booking|reservation|rooms?|rates?|availability/.test(path)) return "likely booking/room-selection step";
  if (/cancel|terms|trial|renew|subscription/.test(path)) return "terms or continuity step";
  if (/fee|tax|total|summary|review/.test(path)) return "price-summary step";
  if (/login|sign|account|register/.test(path)) return "possible account gate";
  return "same-site journey link";
}

function normalizeUrlForVisit(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.protocol}//${url.hostname.replace(/^www\./, "").toLowerCase()}${path}${url.search}`;
}

function mergeLinks(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const link of [...a, ...b]) {
    const key = normalizeUrlForVisit(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isSameSite(seedRaw: string, candidateRaw: string): boolean {
  let seed: URL;
  let candidate: URL;
  try {
    seed = new URL(seedRaw);
    candidate = new URL(candidateRaw);
  } catch {
    return false;
  }
  const seedHost = seed.hostname.replace(/^www\./, "").toLowerCase();
  const candidateHost = candidate.hostname.replace(/^www\./, "").toLowerCase();
  return candidateHost === seedHost || candidateHost.endsWith("." + seedHost);
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
  if (
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
  ) {
    return false;
  }
  return true;
}
