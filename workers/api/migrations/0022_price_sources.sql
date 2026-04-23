-- 0022_price_sources.sql — seed rows for 4 additional FREE price-deal feeds
-- (bensbargains, dealnews, gottadeal, mybargainbuddy) + 5 DORMANT paid
-- price-tracker APIs (keepa is already present, add serpapi, apify,
-- priceapi, brightdata). Per user 2026-04-23: integrate "at the very
-- minimum all of these". Dormant = declared in the registry so the landing
-- page surfaces them; the actual ingester activates when the operator sets
-- the corresponding worker secret.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('bensbargains', "Ben's Bargains (editorial deals)", 'scrape', 'https://feeds.feedburner.com/bensbargains', 'https://www.bensbargains.com', 'none', 120, 'Editorial-curated deal RSS mirror via FeedBurner. ~20 items per refresh.'),
  ('dealnews', 'DealNews (editorial deals)', 'scrape', 'https://feeds2.feedburner.com/Dealnews/', 'https://dealnews.com', 'none', 60, 'Large deal aggregator, ~145 items per feed refresh. Consumer-wide category coverage.'),
  ('gottadeal', 'GottaDeal (crowd deals)', 'scrape', 'https://feeds.feedburner.com/Gottadeal', 'https://www.gottadeal.com', 'none', 240, 'Smaller crowd-curated deal RSS.'),
  ('mybargainbuddy', 'MyBargainBuddy (family-deals RSS)', 'scrape', 'https://www.mybargainbuddy.com/rss', 'https://www.mybargainbuddy.com', 'none', 240, 'Family-oriented deals RSS.'),
  ('serpapi-shopping', 'SerpApi Price Monitoring', 'paid-api', 'https://serpapi.com/google-shopping-api', 'https://serpapi.com/docs/google-shopping', 'bearer-token', 60, 'Tracks competitor prices across Google Shopping, Amazon, Walmart, eBay. Ingester dormant until SERPAPI_KEY is set.'),
  ('apify-amazon-price', 'Apify Amazon Price History', 'paid-api', 'https://apify.com/', 'https://apify.com/store', 'bearer-token', 60, 'Historical pricing data via ASIN or URL. Ingester dormant until APIFY_TOKEN is set.'),
  ('priceapi', 'PriceAPI (real-time retailer prices)', 'paid-api', 'https://www.priceapi.com/', 'https://www.priceapi.com/docs/', 'bearer-token', 30, 'Real-time market prices from major retailers. Ingester dormant until PRICEAPI_KEY is set.'),
  ('brightdata', 'Bright Data Web Scrapers API', 'paid-api', 'https://brightdata.com/', 'https://brightdata.com/products/web-scraper', 'bearer-token', 60, 'Customized multi-platform price monitoring. Ingester dormant until BRIGHTDATA_TOKEN is set.');
