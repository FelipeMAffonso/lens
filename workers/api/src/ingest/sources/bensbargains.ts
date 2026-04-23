// IMPROVEMENT_PLAN_V2 A-S22e — Ben's Bargains (editorial deals curator).
// FeedBurner mirror returns ~20 items with Slickdeals-compatible title shape.

import { makeDealRssIngester } from "./_deal-rss.js";

export const bensbargainsIngester = makeDealRssIngester({
  id: "bensbargains",
  feedUrls: ["https://feeds.feedburner.com/bensbargains"],
});
