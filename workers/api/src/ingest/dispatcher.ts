// IMPROVEMENT_PLAN_V2 Phase A2 (cont'd) — the cron dispatcher.
//
// One Cloudflare Cron Trigger (`*/15 * * * *` — every 15 min) calls into this
// dispatcher. It:
//   1. Reads `data_source` for ingesters whose `last_run_at + cadence_minutes`
//      is in the past.
//   2. Picks the top 1-2 (configurable) and runs them in parallel.
//   3. Each run bounded by `maxDurationMs` so no single source holds the lane.
//
// To add a new data source:
//   a. Write `sources/<source-id>.ts` implementing `DatasetIngester`.
//   b. Add it to `REGISTERED` below.
//   c. Make sure `data_source` has a seed row with matching `id` + cadence.
//      (See migration 0010 for seeded rows.)

import type { Env } from "../index.js";
import { pickDueIngesterIds, runIngester, type DatasetIngester } from "./framework.js";
import { cpscRecallsIngester } from "./sources/cpsc-recalls.js";
import { epaEnergyStarIngester } from "./sources/epa-energy-star.js";
import { epaFuelEconomyIngester } from "./sources/epa-fueleconomy.js";
import { fccEquipmentIngester } from "./sources/fcc-equipment.js";
import { fdaRecallsIngester } from "./sources/fda-recalls.js";
import { fda510kIngester } from "./sources/fda-510k.js";
import { nhtsaRecallsIngester } from "./sources/nhtsa-recalls.js";
import { euEprelIngester } from "./sources/eu-eprel.js";
import { federalRegisterIngester } from "./sources/federal-register.js";
import { ftcEnforcementIngester } from "./sources/ftc-enforcement.js";
import { gs1OriginIngester } from "./sources/gs1-origin.js";
import { hibpIngester } from "./sources/hibp.js";
import { ifixitIngester } from "./sources/ifixit.js";
import { keepaIngester } from "./sources/keepa.js";
import { manufacturerSitemapsIngester } from "./sources/manufacturer-sitemaps.js";
import { musicBrainzIngester } from "./sources/musicbrainz.js";
import { nvdCveIngester } from "./sources/nvd-cve.js";
import { cisaKevIngester } from "./sources/cisa-kev.js";
import { cfpbComplaintsIngester } from "./sources/cfpb-complaints.js";
import { slickdealsIngester } from "./sources/slickdeals.js";
import { bensbargainsIngester } from "./sources/bensbargains.js";
import { dealnewsIngester } from "./sources/dealnews.js";
import { gottadealIngester } from "./sources/gottadeal.js";
import { mybargainbuddyIngester } from "./sources/mybargainbuddy.js";
import { openLibraryIngester } from "./sources/openlibrary.js";
import { openBeautyFactsIngester } from "./sources/openbeautyfacts.js";
import { openFoodFactsIngester } from "./sources/openfoodfacts.js";
import { redditBiflIngester } from "./sources/reddit-bifl.js";
import { retailerSitemapsIngester } from "./sources/retailer-sitemaps.js";
import { unspscSeedIngester } from "./sources/unspsc-seed.js";
import { usdaFoodsIngester } from "./sources/usda-foods.js";
import { wikidataIngester } from "./sources/wikidata.js";

// Registry: ingesters by data_source.id. Adding one here wires it to the cron.
export const REGISTERED: Record<string, DatasetIngester> = {
  "cpsc-recalls": cpscRecallsIngester,
  "nhtsa-recalls": nhtsaRecallsIngester,
  "fda-recalls": fdaRecallsIngester,
  "fda-510k": fda510kIngester,
  "fcc-equipment": fccEquipmentIngester,
  "epa-energy-star": epaEnergyStarIngester,
  "epa-fueleconomy": epaFuelEconomyIngester,
  "openfoodfacts": openFoodFactsIngester,
  "openbeautyfacts": openBeautyFactsIngester,
  "usda-foods": usdaFoodsIngester,
  "wikidata": wikidataIngester,
  "federal-register": federalRegisterIngester,
  "retailer-sitemaps": retailerSitemapsIngester,
  "manufacturer-sitemaps": manufacturerSitemapsIngester,
  "keepa": keepaIngester,
  "hibp": hibpIngester,
  "ifixit": ifixitIngester,
  "ftc-enforcement": ftcEnforcementIngester,
  "reddit": redditBiflIngester,
  "nvd-cve": nvdCveIngester,
  "cisa-kev": cisaKevIngester,
  "cfpb-complaints": cfpbComplaintsIngester,
  "slickdeals": slickdealsIngester,
  "bensbargains": bensbargainsIngester,
  "dealnews": dealnewsIngester,
  "gottadeal": gottadealIngester,
  "mybargainbuddy": mybargainbuddyIngester,
  "openlibrary": openLibraryIngester,
  "musicbrainz": musicBrainzIngester,
  "gs1-origin": gs1OriginIngester,
  "eu-eprel": euEprelIngester,
  "unspsc": unspscSeedIngester,
};

/** Called from the scheduled() handler in index.ts. */
export async function dispatchDueIngesters(env: Env): Promise<{
  attempted: string[];
  results: Array<{ sourceId: string; status: string; rowsUpserted: number; durationMs: number }>;
}> {
  const due = await pickDueIngesterIds(env);
  const available = due.filter((id) => id in REGISTERED);

  // Cap per tick: two parallel ingesters is plenty on the 15-min cadence;
  // also protects Workers CPU / subrequest budgets.
  const PER_TICK = 2;
  const attempted = available.slice(0, PER_TICK);

  const results = await Promise.all(
    attempted.map(async (id) => {
      const ingester = REGISTERED[id]!;
      try {
        const { status, durationMs, report } = await runIngester(ingester, env);
        return {
          sourceId: id,
          status,
          rowsUpserted: report.rowsUpserted,
          durationMs,
        };
      } catch (err) {
        console.warn("[ingest:dispatcher] %s threw:", id, (err as Error).message);
        return {
          sourceId: id,
          status: "error",
          rowsUpserted: 0,
          durationMs: 0,
        };
      }
    }),
  );

  return { attempted, results };
}