// F4 — cron job registry. Maps Cloudflare cron patterns to workflow IDs.
// Each entry declares the pattern, target workflow ID, and a human description.

export interface CronJob {
  pattern: string;           // Cloudflare cron expression (5-field, UTC)
  workflowId: string;        // registered workflow ID to run
  description: string;
  input?: () => unknown;     // optional lazy input factory
}

export const CRON_JOBS: CronJob[] = [
  {
    pattern: "*/15 * * * *",
    workflowId: "email.poll",
    description: "Poll Gmail inbox for new receipts (F12; placeholder until OAuth wired).",
  },
  {
    pattern: "17 */2 * * *",
    workflowId: "gmail.poll",
    description: "VISION #20 — every 2h: Gmail receipt poller for users with gmail_token row.",
  },
  {
    pattern: "*/15 * * * *",
    workflowId: "ingest.dispatch",
    description: "improve-A2 — pick due data-source ingesters (CPSC / FCC / EPA / USDA / ...) and run up to 2 in parallel.",
  },
  {
    pattern: "17 */2 * * *",
    workflowId: "price.poll",
    description: "Poll retailer prices for active purchases within price-match windows.",
  },
  {
    pattern: "13 6 * * 1",
    workflowId: "pack.maintenance",
    description: "Weekly pack maintenance rotation (validator + enricher + reg-watcher).",
  },
  {
    pattern: "7 9 * * *",
    workflowId: "recall.watch",
    description: "Daily recall feed poll (CPSC/NHTSA/FDA) cross-referenced with purchase history.",
  },
  {
    pattern: "23 10 * * *",
    workflowId: "subs.renewal-watch",
    description: "Daily subscription-renewal scan (7-day pre-charge warning).",
  },
  {
    pattern: "31 7 * * 1",
    workflowId: "firmware.watch",
    description: "Weekly firmware / CVE watch for connected-device purchases.",
  },
  {
    pattern: "41 * * * *",
    workflowId: "ticker.aggregate",
    description: "Hourly disagreement-ticker aggregator (k-anonymity enforced).",
  },
  {
    pattern: "41 * * * *",
    workflowId: "triangulate.price",
    description: "improve-A12 — Hourly: recompute triangulated_price + discrepancy_log.",
  },
  {
    pattern: "41 * * * *",
    workflowId: "triangulate.specs",
    description: "improve-A12b — Hourly: sku_spec consensus across sources + spec-discrepancy log.",
  },
  {
    pattern: "41 * * * *",
    workflowId: "digest.send",
    description: "VISION #22 — Hourly: dispatch weekly digests for users whose preferred day/hour matches now.",
  },
];

export function findCronJobs(pattern: string): CronJob[] {
  return CRON_JOBS.filter((j) => j.pattern === pattern);
}
