# S6-W33 — Real recall watcher

**Status:** in progress. Replaces the F4 stub with actual CPSC + NHTSA + FDA feed parsers.

## Why
This is the **"Two months later, push notification"** moment in VISION_COMPLETE.md §3. The whole ambient-background-agent story stands on whether Lens actually tells you when something you own gets recalled. Without it, the "Sarah gets recalled Roborock alert a year after purchase" demo beat is fiction.

## Scope
- `workers/api/src/feeds/cpsc.ts` — CPSC (Consumer Product Safety Commission) RSS feed parser.
- `workers/api/src/feeds/nhtsa.ts` — NHTSA (vehicle + car seat) recall API parser.
- `workers/api/src/feeds/fda.ts` — FDA (drug + food + device) recall parser.
- `workers/api/src/feeds/matcher.ts` — fuzzy-matches recall items to purchase rows by brand + product-name token overlap.
- `workers/api/src/feeds/types.ts` — shared `NormalizedRecall` type.
- `workers/api/src/workflow/specs/recall-watch.ts` — replace stub with real 4-node workflow: fetch-feeds → normalize → match → notify.
- Tests: 20+ (3 parsers × ≥5 cases + matcher × 5).

## Data flow
```
[ cron 9:07 AM ]
  ├─ fetch CPSC RSS     ──┐
  ├─ fetch NHTSA JSON   ──┤
  ├─ fetch FDA RSS      ──┤ (in parallel)
  └─ fetch USDA RSS     ──┘
         ↓
  normalize → NormalizedRecall[]
         ↓
  match against user purchases (last 2 years)
         ↓
  for each match: emit recall:detected event + write intervention row
  aggregate: log cron.done with { fetched, matched, notified }
```

## NormalizedRecall shape
```ts
interface NormalizedRecall {
  source: "cpsc" | "nhtsa" | "fda" | "usda";
  recallId: string;          // source + id, stable
  title: string;
  description: string;
  brand: string;
  productNames: string[];    // multiple names commonly cited
  hazard: string;            // one-line plain-English
  remedyText: string;        // what the user can do
  publishedAt: string;       // ISO
  sourceUrl: string;
}
```

## Matcher strategy
For each active recall × each user purchase in last 730 days:
1. Exact brand match (case-insensitive) → 40% weight.
2. Product-name token Jaccard overlap ≥ 0.5 → 40% weight.
3. Date overlap (purchase before recall published, still in warranty window heuristic) → 20% weight.
Score ≥ 0.7 → emit match.

False-positive bias low because the intervention is "draft a return letter you can review, not file." User has the final say.

## Acceptance
- [ ] 3 parsers handle representative real-feed HTML/JSON/XML fixtures.
- [ ] matcher produces zero-match for unrelated products + positive match on seeded same-brand+same-name case.
- [ ] recall.watch workflow persists recall row + intervention draft to D1 on match.
- [ ] 20+ tests.
- [ ] Live smoke: workflow runs inline via POST /webhook/recall-notify or via cron 07:09 local.
