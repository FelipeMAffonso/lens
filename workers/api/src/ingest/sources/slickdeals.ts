// IMPROVEMENT_PLAN_V2 A-S22d — Slickdeals price tracker.
// Slickdeals is the canonical crowd-curated deals aggregator. Rotates
// through 18 consumer queries, writes price_history + sku_source_link
// observations so triangulated_price sees currently-discounted prices.

import { makeDealRssIngester } from "./_deal-rss.js";

const QUERIES = [
  "", // hot-deals firehose
  "laptop", "headphones", "tv", "vacuum", "espresso", "mattress",
  "monitor", "router", "camera", "earbuds", "chair", "blender",
  "soundbar", "coffee", "keyboard", "mouse", "ssd",
];

export const slickdealsIngester = makeDealRssIngester({
  id: "slickdeals",
  feedUrls: QUERIES.map((q) =>
    q
      ? `https://slickdeals.net/newsearch.php?src=SearchBarV2&rss=1&q=${encodeURIComponent(q)}`
      : `https://slickdeals.net/newsearch.php?src=SearchBarV2&rss=1`,
  ),
});
