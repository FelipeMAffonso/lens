#!/usr/bin/env node
// @lens/cli — thin terminal wrapper over @lens/sdk.
// Usage:
//   npx @lens/cli stats                        # live data-spine metrics
//   npx @lens/cli sources                      # 29-source registry
//   npx @lens/cli search "Breville Bambino"    # fuzzy catalog search
//   npx @lens/cli sku wd:Q123                  # SKU detail
//   npx @lens/cli trigger cisa-kev             # manually kick an ingester
//   npx @lens/cli audit-text <<< "paste…"      # audit a pasted AI recommendation (stdin)
//   npx @lens/cli audit-url https://amazon.com/dp/B000  # audit a retailer URL
//
// Env:
//   LENS_API_URL (default: https://lens-api.webmarinelli.workers.dev)

import { LensClient } from "@lens/sdk";

const baseUrl = process.env.LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";
const lens = new LensClient({ baseUrl });

const [cmd, ...args] = process.argv.slice(2);

function printJson(x) {
  process.stdout.write(JSON.stringify(x, null, 2) + "\n");
}

function die(msg, code = 1) {
  process.stderr.write(`lens: ${msg}\n`);
  process.exit(code);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  switch (cmd) {
    case undefined:
    case "-h":
    case "--help":
    case "help": {
      process.stdout.write(`lens — consumer welfare audit CLI (base: ${baseUrl})

commands:
  stats                   live data-spine metrics
  sources                 full source registry with status
  next-due                dispatcher queue preview
  trigger <id>            manually kick an ingester (idempotent)
  search <query>          fuzzy SKU search
  sku <id>                SKU detail (specs, triangulated price, recalls)
  compare <a,b,c>         side-by-side 2-6 SKU comparison
  audit-text              audit a pasted AI recommendation from stdin
  audit-url <url>         audit a retailer URL
  ticker                  k-anonymous disagreement aggregates (k>=5)
  health                  liveness + bindings

env:
  LENS_API_URL            base URL (default: canonical CF deploy)
`);
      return;
    }
    case "stats":
      return printJson(await lens.architectureStats());
    case "sources":
      return printJson(await lens.architectureSources());
    case "next-due":
      return printJson(await lens.architectureNextDue());
    case "trigger": {
      const id = args[0];
      if (!id) die("trigger requires a source id (e.g. cisa-kev)");
      return printJson(await lens.architectureTrigger(id));
    }
    case "resolve-url": {
      const url = args[0];
      if (!url) die("resolve-url requires a URL");
      return printJson(await lens.resolveUrl(url));
    }
    case "search": {
      const q = args.join(" ");
      if (!q) die("search requires a query");
      return printJson(await lens.sku.search(q));
    }
    case "sku": {
      const id = args[0];
      if (!id) die("sku requires an id (e.g. wd:Q123)");
      return printJson(await lens.sku.get(id));
    }
    case "compare": {
      const list = (args[0] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length < 2) die("compare requires 2-6 ids, comma-separated");
      return printJson(await lens.sku.compare(list));
    }
    case "audit-text": {
      const text = await readStdin();
      if (!text) die("audit-text expects input on stdin");
      return printJson(await lens.audit({ kind: "text", raw: text }));
    }
    case "audit-url": {
      const url = args[0];
      if (!url) die("audit-url requires a URL");
      return printJson(await lens.audit({ kind: "url", url }));
    }
    case "ticker":
      return printJson(await lens.ticker());
    case "health":
      return printJson(await lens.health());
    default:
      die(`unknown command: ${cmd}. run "lens help" for usage.`);
  }
}

main().catch((err) => {
  if (err && typeof err === "object" && "status" in err) {
    process.stderr.write(`lens error (HTTP ${err.status}): ${err.message}\n`);
    if (err.body) process.stderr.write(`${JSON.stringify(err.body, null, 2)}\n`);
    process.exit(2);
  }
  process.stderr.write(`lens error: ${err?.message ?? err}\n`);
  process.exit(2);
});
