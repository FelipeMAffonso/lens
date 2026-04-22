#!/usr/bin/env node
/**
 * Regulation-watcher agent — for every regulation pack, run a focused web search
 * asking whether the regulation's status has changed (vacated, superseded,
 * amended, effective date delayed).
 *
 * This is the 'monitors changing regulation landscape' piece the user asked for.
 * Designed to run as a Cloudflare Cron Trigger weekly; also runnable locally.
 *
 * Output: data/regulation-status-report.json
 *
 * If a regulation's status has changed per the agent's web research, the agent
 * emits an alert row with recommendedAction: 'retire-pack' | 'update-status' |
 * 'author-successor-pack'. A human or a second agent applies the change.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "data/regulation-status-report.json");

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

function loadRegulationPacks() {
  const dir = join(ROOT, "packs/regulation");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

async function checkPack(pack) {
  const citation = pack.body.citation;
  const officialName = pack.body.officialName;
  const currentStatus = pack.body.status;
  const jurisdiction = pack.applicability.jurisdiction;

  const query = `Is ${officialName} (${citation}, ${jurisdiction}) currently in force as of ${new Date().toISOString().slice(0, 10)}? Has it been vacated, superseded, amended, or had its effective date changed since Lens's last verification (${pack.lastVerified})? If status changed, cite the source.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages: [
        {
          role: "user",
          content: `${query}\n\nReturn a single JSON object: {currentStatus: "in-force"|"delayed"|"vacated"|"superseded"|"preempted"|"amended", statusChanged: boolean, changeDescription: string, primarySource: url, recommendedAction: "no-op"|"update-pack-status"|"retire-pack"|"author-successor-pack"}. No prose, no markdown fence.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return { packSlug: pack.slug, error: `HTTP ${res.status}` };
  }
  const data = await res.json();
  let text = "";
  for (const block of data.content ?? []) {
    if (block.type === "text") text += block.text;
  }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = m ? m[1] : text;
  let parsed;
  try { parsed = JSON.parse(json.trim()); } catch { parsed = { parseError: text.slice(0, 300) }; }

  return {
    packSlug: pack.slug,
    packCurrentStatus: currentStatus,
    packLastVerified: pack.lastVerified,
    ...parsed,
  };
}

async function main() {
  const packs = loadRegulationPacks();
  console.log(`Checking ${packs.length} regulation packs...`);
  const report = { generatedAt: new Date().toISOString(), packs: [] };

  for (const pack of packs) {
    console.log(`-- ${pack.slug}`);
    try {
      const result = await checkPack(pack);
      report.packs.push(result);
      console.log(`   status=${result.currentStatus ?? "?"} changed=${result.statusChanged ?? "?"} action=${result.recommendedAction ?? "?"}`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error(`   failed: ${e.message}`);
      report.packs.push({ packSlug: pack.slug, error: e.message });
    }
  }

  const alertsRequiringAction = report.packs.filter((p) => p.recommendedAction && p.recommendedAction !== "no-op");
  report.alertsRequiringAction = alertsRequiringAction.length;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${OUT}`);
  console.log(`Alerts requiring action: ${alertsRequiringAction.length} of ${packs.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
