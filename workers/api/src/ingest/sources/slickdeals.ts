// IMPROVEMENT_PLAN_V2 A-S22d — Slickdeals price tracker.
// Slickdeals is the canonical crowd-curated deals aggregator. Rotates
// through 18 consumer queries, writes price_history + sku_source_link
// observations so triangulated_price sees currently-discounted prices.

import { makeDealRssIngester } from "./_deal-rss.js";

// 2026-04-23: dropped the empty-query "firehose" slot — Slickdeals returns
// an empty RSS envelope (zero <item> blocks) for q="". That meant the cursor
// would burn one of its hourly runs per day on a no-op. Keyword rotation
// is the actual signal; the firehose was a dead hit.
const QUERIES = [
  "laptop", "headphones", "tv", "vacuum", "espresso", "mattress",
  "monitor", "router", "camera", "earbuds", "chair", "blender",
  "soundbar", "coffee", "keyboard", "mouse", "ssd", "toaster",
  "microwave", "refrigerator", "washer", "dryer", "printer",
  "shaver", "toothbrush", "smartwatch", "tablet", "phone",
  "cookware", "knife-set", "airfryer", "standing-desk",
];

export const slickdealsIngester = makeDealRssIngester({
  id: "slickdeals",
  feedUrls: QUERIES.map(
    (q) => `https://slickdeals.net/newsearch.php?src=SearchBarV2&rss=1&q=${encodeURIComponent(q)}`,
  ),
});
