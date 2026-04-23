// IMPROVEMENT_PLAN_V2 A-S22i — Steam store featured/specials.
// Public, no-auth endpoint returning specials, new_releases, top_sellers,
// coming_soon — each with real current prices, discount %, platform
// availability. Adds a fresh SKU category (PC video games) + price
// observations directly into price_history.
// Feed: https://store.steampowered.com/api/featuredcategories/?cc=us

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "steam-store";
const FEED_URL = "https://store.steampowered.com/api/featuredcategories/?cc=us";

interface SteamItem {
  id?: number;
  name?: string;
  original_price?: number | null;
  final_price?: number | null;
  discount_percent?: number;
  discounted?: boolean;
  currency?: string;
  large_capsule_image?: string;
  windows_available?: boolean;
  mac_available?: boolean;
}

interface SteamBody {
  specials?: { items?: SteamItem[] };
  new_releases?: { items?: SteamItem[] };
  top_sellers?: { items?: SteamItem[] };
  coming_soon?: { items?: SteamItem[] };
}

export const steamStoreIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 60_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };

    let body: SteamBody;
    try {
      const res = await fetch(FEED_URL, {
        headers: { "User-Agent": "LensBot/1.0 (consumer-welfare research)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as SteamBody;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const all: SteamItem[] = [
      ...(body.specials?.items ?? []),
      ...(body.new_releases?.items ?? []),
      ...(body.top_sellers?.items ?? []),
      ...(body.coming_soon?.items ?? []),
    ];
    // Dedupe by id.
    const seen = new Set<number>();
    const items = all.filter((it) => {
      if (!it.id || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
    counters.rowsSeen = items.length;
    counters.log = `specials=${body.specials?.items?.length ?? 0} new=${body.new_releases?.items?.length ?? 0} top=${body.top_sellers?.items?.length ?? 0} soon=${body.coming_soon?.items?.length ?? 0}`;

    const BATCH = 15;
    const observed = new Date().toISOString().slice(0, 19);
    for (let i = 0; i < items.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const it of items.slice(i, i + BATCH)) {
        const name = (it.name ?? "").trim();
        if (!it.id || !name) { counters.rowsSkipped++; continue; }
        const skuId = `steam:${it.id}`;
        const specs = {
          appId: it.id,
          windows: !!it.windows_available,
          mac: !!it.mac_available,
          discount_percent: it.discount_percent ?? 0,
          discounted: !!it.discounted,
          original_price_cents: it.original_price ?? null,
        };
        const priceCents = it.final_price ?? null;
        const storeUrl = `https://store.steampowered.com/app/${it.id}/`;
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, image_url, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, 'steam', ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               image_url = excluded.image_url,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, name.slice(0, 200), it.large_capsule_image ?? null, JSON.stringify(specs).slice(0, 4_000)),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, price_cents, currency, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, 0.95, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               price_cents = excluded.price_cents,
               specs_json = excluded.specs_json,
               observed_at = excluded.observed_at,
               active = 1`,
          ).bind(skuId, SOURCE_ID, String(it.id), storeUrl, JSON.stringify(specs).slice(0, 4_000), priceCents, observed),
        );
        if (priceCents != null) {
          stmts.push(
            ctx.env.LENS_D1!.prepare(
              `INSERT OR IGNORE INTO price_history (sku_id, source_id, observed_at, price_cents, currency, on_sale, sale_pct)
               VALUES (?, ?, ?, ?, 'USD', ?, ?)`,
            ).bind(skuId, SOURCE_ID, observed, priceCents, it.discounted ? 1 : 0, it.discount_percent ?? null),
          );
        }
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
    }
    return counters;
  },
};
