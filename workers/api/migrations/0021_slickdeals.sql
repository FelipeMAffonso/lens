-- 0021_slickdeals.sql — seed row for the Slickdeals price-deal ingester.
-- Per user 2026-04-23: "people are mostly interested about price". Slickdeals
-- is the canonical crowd-curated price-aggregator. Adds a real-time
-- currently-on-sale signal that feeds triangulated_price + price_history.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('slickdeals', 'Slickdeals (crowd-curated deals RSS)', 'scrape', 'https://slickdeals.net/newsearch.php', 'https://slickdeals.net/tips/getting-started-rss', 'none', 60, 'Public Slickdeals RSS feeds across 18 consumer-shopping queries (hot deals, laptop, headphones, tv, vacuum, espresso, mattress, monitor, router, camera, earbuds, chair, blender, soundbar, coffee, keyboard, mouse, ssd). Hourly rotation, writes price_history rows so triangulated_price sees currently-discounted observations. Core price-tracking layer.');
