-- 0023_big_sources.sql — 2 big new data sources.
-- google-product-taxonomy: 5,500+ canonical product categories (massive
-- upgrade over UNSPSC level-1 55 segments).
-- steam-store: Steam featured/specials/top-sellers — real video-game SKUs
-- with prices, discount %, platform availability, feeding price_history.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('google-product-taxonomy', 'Google Product Taxonomy', 'open-data', 'https://www.google.com/basepages/producttype/taxonomy.en-US.txt', 'https://support.google.com/merchants/answer/6324436', 'none', 43200, 'Canonical Google Product Taxonomy: 5,596 categories organized as "A > B > C > D" paths. Seeds category_taxonomy as a massive upgrade over UNSPSC level-1 (55 segments). One-shot seed, monthly refresh.'),
  ('steam-store', 'Steam store featured + specials', 'retailer', 'https://store.steampowered.com/api/featuredcategories/?cc=us', 'https://partner.steamgames.com/doc/webapi', 'none', 180, 'Steam store specials / new_releases / top_sellers / coming_soon. ~60 items per refresh, real current prices + discount % + Windows/Mac availability. Covers PC video game SKUs with price_history observations.');
