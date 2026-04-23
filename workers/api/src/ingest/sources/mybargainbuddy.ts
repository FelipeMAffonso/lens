// IMPROVEMENT_PLAN_V2 A-S22h — MyBargainBuddy (deals RSS).

import { makeDealRssIngester } from "./_deal-rss.js";

export const mybargainbuddyIngester = makeDealRssIngester({
  id: "mybargainbuddy",
  feedUrls: ["https://www.mybargainbuddy.com/rss"],
});
