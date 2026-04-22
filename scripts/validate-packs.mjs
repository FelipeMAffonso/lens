#!/usr/bin/env node
/**
 * Pack validator — LLM-as-judge using Opus 4.7.
 *
 * For each pack's evidence entries, fetch the cited source URL, extract relevant
 * text, and ask Opus 4.7 whether the claim is supported by the source content.
 *
 * Produces data/pack-validation-report.json with one row per (pack, evidence) tuple.
 *
 * Usage:
 *   node scripts/validate-packs.mjs                    # validate all packs
 *   node scripts/validate-packs.mjs category/laptops   # validate one pack
 *   node scripts/validate-packs.mjs --type=regulation  # validate all of one type
 *
 * Environment:
 *   ANTHROPIC_API_KEY must be set (read from workers/api/.dev.vars or env).
 *
 * Rate-limited: one Opus 4.7 call per evidence entry, with ~1s pacing.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKS_DIR = join(ROOT, "packs");
const OUT = join(ROOT, "data/pack-validation-report.json");

// ------- config / CLI --------------------------------------------------------

const args = process.argv.slice(2);
const slugFilter = args.find((a) => !a.startsWith("--"));
const typeFilter = args.find((a) => a.startsWith("--type="))?.slice("--type=".length);

// ------- find Anthropic key --------------------------------------------------

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const devVars = join(ROOT, "workers/api/.dev.vars");
  if (existsSync(devVars)) {
    const content = readFileSync(devVars, "utf8");
    const m = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("ANTHROPIC_API_KEY not found — set in env or workers/api/.dev.vars");
}

const ANTHROPIC_API_KEY = loadApiKey();

// ------- load packs ----------------------------------------------------------

function loadAllPacks() {
  const types = ["category", "dark-pattern", "regulation", "fee", "intervention"];
  const out = [];
  for (const t of types) {
    if (typeFilter && typeFilter !== t) continue;
    const dir = join(PACKS_DIR, t);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const pack = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (slugFilter && pack.slug !== slugFilter) continue;
      out.push(pack);
    }
  }
  return out;
}

// ------- fetch + extract source ---------------------------------------------

async function fetchSource(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 LensPackValidator/1.0" },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) {
      return { ok: true, kind: "pdf-binary", bytes: (await res.arrayBuffer()).byteLength };
    }
    const text = await res.text();
    // Cheap HTML-to-text: strip scripts, styles, tags.
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 80_000);
    return { ok: true, kind: "text", text: stripped };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ------- LLM-as-judge call ---------------------------------------------------

async function judgeClaim(claim, sourceContent) {
  const systemPrompt = `You are a pack validator. Given a factual claim and content from the source URL cited as evidence, determine whether the source content supports the claim.

Return a single JSON object (no prose, no markdown fence):
{
  "supported": "yes" | "partial" | "no" | "unverifiable_from_fetched_content",
  "reasoning": "<1-2 sentences explaining the verdict>",
  "relevant_excerpt": "<up to 300 chars from source that directly supports or contradicts the claim, or empty string if none>"
}`;

  const userMessage = `CLAIM: ${claim}

SOURCE CONTENT (truncated to fit context):
${sourceContent.slice(0, 40_000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 1000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return { supported: "error", reasoning: `HTTP ${res.status}: ${errBody.slice(0, 200)}`, relevant_excerpt: "" };
  }

  const data = await res.json();
  let text = "";
  for (const block of data.content ?? []) {
    if (block.type === "text") text += block.text;
  }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = m ? m[1] : text;
  try {
    return JSON.parse(json.trim());
  } catch {
    return { supported: "parse_error", reasoning: text.slice(0, 300), relevant_excerpt: "" };
  }
}

// ------- main ---------------------------------------------------------------

async function main() {
  const packs = loadAllPacks();
  console.log(`Validating ${packs.length} packs...`);

  const report = {
    generatedAt: new Date().toISOString(),
    packCount: packs.length,
    results: [],
  };

  for (const pack of packs) {
    console.log(`\n-- ${pack.slug} (${pack.type})`);
    for (const ev of pack.evidence ?? []) {
      process.stdout.write(`   ${ev.ref} ${ev.sourceUrl.slice(0, 70)}... `);
      const fetched = await fetchSource(ev.sourceUrl);
      if (!fetched.ok) {
        console.log(`FETCH FAILED (${fetched.status ?? fetched.error})`);
        report.results.push({
          packSlug: pack.slug,
          evidenceRef: ev.ref,
          claim: ev.claim,
          sourceUrl: ev.sourceUrl,
          supported: "source_unreachable",
          reasoning: `Fetch failed: ${fetched.status ?? fetched.error}`,
        });
        continue;
      }
      if (fetched.kind === "pdf-binary") {
        console.log(`PDF (${fetched.bytes}B) — skipping LLM judge (PDF parsing not implemented in this script)`);
        report.results.push({
          packSlug: pack.slug,
          evidenceRef: ev.ref,
          claim: ev.claim,
          sourceUrl: ev.sourceUrl,
          supported: "pdf_not_inspected",
          reasoning: `Source is PDF (${fetched.bytes} bytes); manual review required or run through PyMuPDF pipeline.`,
        });
        continue;
      }
      const verdict = await judgeClaim(ev.claim, fetched.text);
      console.log(verdict.supported);
      report.results.push({
        packSlug: pack.slug,
        evidenceRef: ev.ref,
        claim: ev.claim,
        sourceUrl: ev.sourceUrl,
        ...verdict,
      });
      // Pace to stay well under rate limits.
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  const summary = {
    supported_yes: report.results.filter((r) => r.supported === "yes").length,
    supported_partial: report.results.filter((r) => r.supported === "partial").length,
    supported_no: report.results.filter((r) => r.supported === "no").length,
    source_unreachable: report.results.filter((r) => r.supported === "source_unreachable").length,
    pdf_not_inspected: report.results.filter((r) => r.supported === "pdf_not_inspected").length,
    other: report.results.filter((r) => !["yes", "partial", "no", "source_unreachable", "pdf_not_inspected"].includes(r.supported)).length,
  };
  report.summary = summary;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${OUT}`);
  console.log(`Summary: ${JSON.stringify(summary)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
