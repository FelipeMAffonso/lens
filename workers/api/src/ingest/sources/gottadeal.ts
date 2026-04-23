// IMPROVEMENT_PLAN_V2 A-S22g — GottaDeal (feedburner-hosted deals RSS).

import { makeDealRssIngester } from "./_deal-rss.js";

export const gottadealIngester = makeDealRssIngester({
  id: "gottadeal",
  feedUrls: ["https://feeds.feedburner.com/Gottadeal"],
});
