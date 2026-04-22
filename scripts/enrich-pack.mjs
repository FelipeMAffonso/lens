#!/usr/bin/env node
/**
 * Pack enrichment agent — uses Opus 4.7 web search to research a pack's topic
 * and propose updates (new evidence, new confabulation patterns, updated regulation
 * status, new counterfeit signals).
 *
 * This is the per-pack agent the user asked for: instead of just judging existing
 * packs, an agent actively searches the web for each category and brings new
 * findings back to the pack as PR-ready additions.
 *
 * Usage:
 *   node scripts/enrich-pack.mjs packs/category/espresso-machines.json
 *   node scripts/enrich-pack.mjs --all  # enrich every pack (slow — use in cron)
 *
 * Output: writes data/pack-enrichment-proposals/<slug>.json with a diff-style
 * proposal that a human reviewer (or a second agent) can approve and merge.
 *
 * Anthropic API key: same discovery as validate-packs.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "data/pack-enrichment-proposals");

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const devVars = join(ROOT, "workers/api/.dev.vars");
  if (existsSync(devVars)) {
    const content = readFileSync(devVars, "utf8");
    const m = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("ANTHROPIC_API_KEY not found");
}

const ANTHROPIC_API_KEY = loadApiKey();

function promptForPack(pack) {
  const base = `You are a Lens pack enrichment agent. Your job is to use the web_search tool to research the topic this pack covers and propose specific additions or updates. Focus on: (1) new or recently-discovered confabulation patterns; (2) new regulations in force or recent enforcement actions; (3) new counterfeit signals; (4) updated typical hidden costs; (5) any evidence entries that may be outdated (sourceUrl returning 404, or content changed).

CURRENT PACK (${pack.slug}, v${pack.version}, last verified ${pack.lastVerified}):

${JSON.stringify(pack, null, 2).slice(0, 6000)}

TASK: Perform 2-4 web searches to research the topic. Then return a single JSON object (no prose, no markdown fence) with:

{
  "proposedVersion": "<next semver, e.g. 1.1.0 if minor additions>",
  "proposedChanges": {
    "evidenceToAdd": [ {ref, claim, sourceUrl, retrieved, primary} ],
    "evidenceToDeprecate": [ {ref, reason} ],
    "confabulationPatternsToAdd": [ {pattern, reality, verdict, checkPrompt} ],
    "regulatoryLinksToAdd": ["regulation/slug-here"],
    "hiddenCostsToAdd": [ {name, annualCostUsd, frequency} ]
  },
  "summary": "<1-3 sentence summary of what's new and why it matters>"
}

Only propose changes you have a current web source for. Be conservative — empty arrays are fine if the pack is still current.`;
  return base;
}

async function enrichPack(pack) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 5000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: promptForPack(pack) }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 300)}`);
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
    return { error: "parse_error", raw: text.slice(0, 800) };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const filePaths = all ? findAllPacks() : args.filter((a) => !a.startsWith("--"));

  if (filePaths.length === 0) {
    console.log("Usage: node scripts/enrich-pack.mjs <pack-file-path> [<more>...]  OR  --all");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  for (const fp of filePaths) {
    const pack = JSON.parse(readFileSync(fp, "utf8"));
    console.log(`\n-- ${pack.slug}`);
    try {
      const proposal = await enrichPack(pack);
      const outPath = join(OUT_DIR, `${pack.slug.replace(/\//g, "--")}.json`);
      writeFileSync(outPath, JSON.stringify({ slug: pack.slug, proposedAt: new Date().toISOString(), proposal }, null, 2));
      console.log(`   -> proposal: ${proposal.summary ?? proposal.error ?? "n/a"}`);
      console.log(`   -> written: ${outPath}`);
      await new Promise((r) => setTimeout(r, 2000)); // pace
    } catch (e) {
      console.error(`   FAILED: ${e.message}`);
    }
  }
}

function findAllPacks() {
  const out = [];
  const types = ["category", "dark-pattern", "regulation", "fee", "intervention"];
  for (const t of types) {
    const dir = join(ROOT, "packs", t);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".json")) out.push(join(dir, f));
    }
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
