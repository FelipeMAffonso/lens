import type { CustomerJourneyMap, CustomerJourneyStage } from "./types.js";

export interface BuildJourneyMapOptions {
  workflowIds?: string[];
  totalPacks?: number;
  sourceCount?: number;
  generatedAt?: string;
}

const BASE_GUARANTEES = [
  "Lens derives an editable utility function before ranking any product.",
  "No affiliate links or hidden retailer incentives are allowed in ranking.",
  "Every sensitive data source is opt-in, scoped, revocable, and visible to the user.",
  "Missing data is surfaced as a recovery state instead of a fabricated answer.",
  "The browser extension, web app, PWA, SDK, MCP, and API use the same welfare spine.",
];

const PRIVACY_CONTROLS = [
  "Inspect and edit criterion weights before acting on a recommendation.",
  "Disable saved profiles, purchase history, receipts, Gmail, Plaid-style financial signals, and push watchers separately.",
  "Export or delete preference profiles and journey state.",
  "Keep passive browsing checks local unless a per-host consent gate is accepted.",
  "Use k-anonymous aggregation for public telemetry and never publish small buckets.",
];

function stage(
  stage: CustomerJourneyStage,
  opts: BuildJourneyMapOptions,
): CustomerJourneyStage {
  const suffixes: string[] = [];
  if (opts.totalPacks && stage.id === "ai_research") {
    suffixes.push(`${opts.totalPacks} bundled welfare packs loaded into audits.`);
  }
  if (opts.sourceCount && stage.id === "product_page") {
    suffixes.push(`${opts.sourceCount} configured data sources feed product-page checks.`);
  }
  if (opts.workflowIds?.length && ["post_purchase", "ownership"].includes(stage.id)) {
    const watcherCount = opts.workflowIds.filter((id) =>
      /recall|price|firmware|digest|gmail|ticker|subs/i.test(id),
    ).length;
    if (watcherCount > 0) suffixes.push(`${watcherCount} watcher workflows registered at runtime.`);
  }
  return suffixes.length > 0
    ? { ...stage, implementedSignals: [...stage.implementedSignals, ...suffixes] }
    : stage;
}

export function buildCustomerJourneyMap(opts: BuildJourneyMapOptions = {}): CustomerJourneyMap {
  const stages: CustomerJourneyStage[] = [
    stage(
      {
        id: "pre_search",
        label: "Before Search",
        status: "live",
        promise: "Convert messy human intent into an inspectable utility model before any recommendation appears.",
        surfaces: ["web chat", "classic web form", "PWA", "extension sidebar", "SDK"],
        endpoints: ["/chat/clarify", "/clarify", "/clarify/apply", "/rank/nl-adjust", "/preferences", "/preferences/effective", "/values-overlay"],
        workflows: ["S1-W8", "S1-W9", "CJ-W46", "CJ-W47", "CJ-W48", "CJ-W53", "W50"],
        dataSources: ["category packs", "saved profile rows", "household profiles", "gift-recipient answers", "values overlay"],
        implementedSignals: [
          "stated preferences",
          "budget-derived price weight",
          "category priors",
          "explicit natural-language edits",
          "household/profile overrides",
          "gift recipient preference capture",
        ],
        edgeCasesCovered: [
          "vague prompt with no category",
          "budget-only prompt",
          "conflicting criteria such as cheapest and premium",
          "recipient preferences that differ from buyer preferences",
          "household member archived or missing",
          "user changes their mind after initial ranking",
        ],
        failureRecovery: [
          "ask clarifying tradeoff questions when confidence is low",
          "show inferred source and confidence for every criterion",
          "allow plain-language reweighting without a form",
          "fall back to neutral priors with disclosure when profile data is missing",
        ],
        consentTier: "none",
        userControls: ["edit weights", "delete profile", "export profile", "disable saved preferences"],
        nextHardening: ["add richer conjoint question bank", "calibrate priors from longitudinal welfare outcomes"],
      },
      opts,
    ),
    stage(
      {
        id: "ai_research",
        label: "AI Research",
        status: "live",
        promise: "Audit any AI shopping answer, screenshot, or citation trail against transparent utility math.",
        surfaces: ["web paste mode", "image mode", "ChatGPT extension", "Claude extension", "Gemini extension", "Perplexity extension", "MCP"],
        endpoints: ["/audit", "/audit/stream", "/chat/followup", "/compare/framings", "/source-weighting", "/review-scan"],
        workflows: ["W6", "W10", "W12", "W14", "W20", "W28", "W32", "S2-W13", "S3-W16", "CJ-W53"],
        dataSources: ["knowledge packs", "cross-model worker", "source weighting profile", "claim verifier", "pack registry"],
        implementedSignals: [
          "claim extraction",
          "claim verification",
          "cross-model disagreement",
          "source provenance weighting",
          "confabulation pattern packs",
          "welfare delta history",
        ],
        edgeCasesCovered: [
          "AI answer names no product",
          "AI answer cites unverifiable specs",
          "screenshot of chat instead of text",
          "long answer with multiple recommendations",
          "model disagreement on top pick",
          "query-only run with no host AI",
        ],
        failureRecovery: [
          "stream stage warnings instead of silent failure",
          "show no-defensible-top-pick card when evidence is thin",
          "hide cross-model panel when intentionally disabled",
          "preserve user's original prompt for follow-up questions",
        ],
        consentTier: "none",
        userControls: ["choose source weighting", "ask follow-up", "rerank from utility math", "clear local history"],
        nextHardening: ["add citation graph visualization", "expand cross-model critique into an evaluator loop"],
      },
      opts,
    ),
    stage(
      {
        id: "product_page",
        label: "Product Page",
        status: "live",
        promise: "Turn a retailer URL, shelf photo, or screenshot into a product risk and utility audit.",
        surfaces: ["URL mode", "photo upload", "extension product-page badge", "SKU pages", "SDK resolve-url"],
        endpoints: [
          "/resolve-url",
          "/visual-audit",
          "/sku/search",
          "/sku/:id",
          "/price-history",
          "/counterfeit/check",
          "/privacy-audit",
          "/breach-history",
          "/provenance/verify",
          "/sponsorship/scan",
          "/repairability/lookup",
          "/compat/check",
          "/lockin/compute",
        ],
        workflows: ["W15", "W17", "W18", "W19", "W21", "W23", "W25", "W26", "W27", "S7-W40", "S7-W41"],
        dataSources: ["SKU spine", "retailer parsers", "Keepa", "CPSC", "NHTSA", "FDA", "GS1", "Wikidata", "iFixit", "HIBP", "privacy-policy text"],
        implementedSignals: [
          "affiliate stripping",
          "retailer ID parsing",
          "price history",
          "counterfeit and grey-market risk",
          "privacy/security risk",
          "repairability",
          "compatibility",
          "lock-in cost",
        ],
        edgeCasesCovered: [
          "Amazon URL with affiliate/ref tracking parameters",
          "retailer page blocked from scraping but visible in screenshot",
          "marketplace listing with unknown seller",
          "single-source price with no triangulation yet",
          "product name without SKU",
          "photo of product packaging or shelf tag",
        ],
        failureRecovery: [
          "scrub URL and attempt host parser before LLM extraction",
          "use visual audit when HTML fetch is blocked",
          "label skipped enrichments instead of pretending they ran",
          "return candidate matches rather than a fake exact match",
        ],
        consentTier: "local_only",
        userControls: ["per-host extension consent", "manual URL paste", "photo upload choice", "do not save product context"],
        nextHardening: ["add authorized-seller registry", "broaden marketplace equivalence matching for Temu-style listings"],
      },
      opts,
    ),
    stage(
      {
        id: "cart_checkout",
        label: "Cart And Checkout",
        status: "live",
        promise: "Catch extraction pressure at the moment the consumer is most vulnerable.",
        surfaces: ["extension cart badge", "shopping-session mode", "checkout summary", "trigger aggregation"],
        endpoints: ["/passive-scan", "/total-cost", "/checkout/summary", "/shopping-session/start", "/shopping-session/capture", "/shopping-session/:id/summary", "/triggers/report", "/triggers/aggregate"],
        workflows: ["W22", "W24", "W28", "improve-B-session", "improve-B-triggers"],
        dataSources: ["dark-pattern packs", "fee packs", "regulation packs", "cart DOM excerpts", "session snapshots with TTL"],
        implementedSignals: [
          "hidden fees",
          "drip pricing",
          "fake scarcity",
          "fake urgency",
          "preselection",
          "forced continuity",
          "true total cost",
        ],
        edgeCasesCovered: [
          "product-page price differs from cart subtotal",
          "fee appears only after shipping address",
          "countdown timer appears after page load",
          "trial converts to paid plan during later step",
          "checkout badge should stay silent when only one weak signal fires",
          "session expires without leaking content",
        ],
        failureRecovery: [
          "require multiple signals before interrupting",
          "keep passive checks local until consent",
          "show rule citation and suggested intervention",
          "expire shopping session captures by default",
        ],
        consentTier: "local_only",
        userControls: ["host allowlist", "dismiss badge", "start/stop session", "disable passive checks"],
        nextHardening: ["add more checkout host adapters", "expand jurisdiction-aware fee analysis"],
      },
      opts,
    ),
    stage(
      {
        id: "post_purchase",
        label: "Post Purchase",
        status: "partial",
        promise: "Monitor receipts, price windows, subscriptions, recalls, and refunds after money leaves the account.",
        surfaces: ["Your Shelf", "Gmail OAuth", "email receipt forwarder", "weekly digest", "push notifications", "watchers"],
        endpoints: ["/oauth/gmail/authorize", "/email/receipt", "/digest/preferences", "/push/subscribe", "/watchers", "/price-refund/scan", "/price-refund/:purchaseId/file", "/returns/draft", "/subs/scan", "/subs/audit"],
        workflows: ["gmail.poll", "digest.send", "price.poll", "recall.watch", "subs.discover", "S6-W33", "S6-W34", "S6-W35", "S6-W36"],
        dataSources: ["Gmail receipts", "manual receipt email", "price-source rows", "CPSC recalls", "subscription emails", "purchase table"],
        implementedSignals: [
          "receipt ingestion",
          "recall matching",
          "price drop windows",
          "subscription renewal risk",
          "drafted return/refund letters",
          "weekly digest preferences",
        ],
        edgeCasesCovered: [
          "receipt without a SKU",
          "retailer price-match window has expired",
          "recall arrives months after purchase",
          "subscription email does not expose cancellation URL",
          "user wants reminders but not Gmail OAuth",
          "push subscription revoked by browser",
        ],
        failureRecovery: [
          "allow manual receipt forwarding as OAuth alternative",
          "draft but do not send interventions without explicit approval",
          "store watcher active state separately from purchase row",
          "surface missing D1/OAuth bindings as bootstrapping",
        ],
        consentTier: "oauth_sensitive",
        userControls: ["connect or revoke Gmail", "configure digest cadence", "enable/disable watchers", "approve drafted sends"],
        nextHardening: ["add Plaid transaction ingestion behind a separate consent tier", "add retailer account importers"],
      },
      opts,
    ),
    stage(
      {
        id: "ownership",
        label: "Ownership",
        status: "live",
        promise: "Defend the consumer after the product is in their house.",
        surfaces: ["Your Shelf", "firmware scanner", "accessory finder", "performance feedback", "repairability card"],
        endpoints: ["/firmware/scan", "/accessories/discover", "/purchase/:id/performance", "/performance/history", "/repairability/lookup", "/lockin/compute"],
        workflows: ["firmware.watch", "S6-W37", "S7-W38", "S7-W39", "S7-W40", "S7-W41"],
        dataSources: ["NVD/CVE", "CISA KEV", "vendor advisories", "iFixit", "compatibility rules", "user performance notes"],
        implementedSignals: [
          "firmware/CVE risk",
          "accessory compatibility",
          "lock-in cost",
          "repairability",
          "revealed-preference learning",
          "performance satisfaction history",
        ],
        edgeCasesCovered: [
          "no firmware source for a product",
          "accessory fit depends on exact model",
          "user chose runner-up and explains why",
          "repair data exists for a similar but not exact product",
          "connected device has privacy and security risk",
          "multiple household members use one product",
        ],
        failureRecovery: [
          "mark low-confidence compatibility matches",
          "require consent before revealed-preference updates",
          "fall back to category-level repairability when exact model is absent",
          "separate household profile preferences",
        ],
        consentTier: "account",
        userControls: ["record or skip feedback", "disable revealed-preference learning", "choose profile", "delete purchase context"],
        nextHardening: ["add vendor support ticket automation", "build longitudinal product outcome dashboard"],
      },
      opts,
    ),
    stage(
      {
        id: "end_of_life",
        label: "Return, Repair, Replace",
        status: "partial",
        promise: "Help the consumer exit bad purchases, repair durable goods, and document complaints.",
        surfaces: ["intervention drafts", "returns assistant", "FTC/CFPB complaint packs", "repairability guidance", "shelf history"],
        endpoints: ["/returns/draft", "/interventions", "/interventions/:id/sent", "/intervention/send", "/repairability/lookup", "/price-refund/:purchaseId/file"],
        workflows: ["S6-W35", "S7-W41", "intervention packs", "price.poll"],
        dataSources: ["Magnuson-Moss packs", "FTC complaint packs", "CFPB complaint packs", "retailer return policy text", "purchase history"],
        implementedSignals: [
          "return letter drafting",
          "refund claim drafting",
          "complaint destination selection",
          "repairability evidence",
          "intervention status tracking",
        ],
        edgeCasesCovered: [
          "purchase is outside ordinary return window",
          "warranty claim needs legal citation",
          "merchant requires order details",
          "consumer wants a draft but not automatic sending",
          "intervention fails or needs retry",
          "repair is cheaper than replacement",
        ],
        failureRecovery: [
          "draft letters without sending by default",
          "require signed-in account for intervention state",
          "link intervention to purchase/audit/watcher when available",
          "show unresolved status instead of success theater",
        ],
        consentTier: "account",
        userControls: ["approve sends", "edit drafts", "mark intervention resolved", "delete intervention history"],
        nextHardening: ["add certified-mail workflow", "add jurisdiction-specific return-law packs"],
      },
      opts,
    ),
  ];

  const live = stages.filter((s) => s.status === "live").length;
  const partial = stages.filter((s) => s.status === "partial").length;
  const planned = stages.filter((s) => s.status === "planned").length;
  const total = stages.length;
  const score = Number(((live + partial * 0.5) / total).toFixed(3));

  return {
    version: "customer-journey-map-v1",
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    readiness: { live, partial, planned, total, score },
    guarantees: BASE_GUARANTEES,
    privacyControls: PRIVACY_CONTROLS,
    stages,
  };
}
