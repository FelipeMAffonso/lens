// IMPROVEMENT_PLAN_V2 A-S22f — DealNews (editorial deal aggregator).
// FeedBurner mirror returns ~145 items with Slickdeals-compatible title shape.

import { makeDealRssIngester } from "./_deal-rss.js";

export const dealnewsIngester = makeDealRssIngester({
  id: "dealnews",
  feedUrls: ["https://feeds2.feedburner.com/Dealnews/"],
});
