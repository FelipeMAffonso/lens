-- 0010_ground_truth.sql
-- Phase A of IMPROVEMENT_PLAN_V2.md — the triangulated data spine.
-- Designed for 5M+ SKUs across 300+ categories, continuously refreshed from
-- 17+ public and paid data sources. Every fact is attributed to a source,
-- timestamped, and confidence-scored, so the query layer can compute
-- consensus + flag discrepancies.
--
-- Execution notes for D1:
--   * D1 is SQLite. No triggers with side-effects into other tables.
--   * Every INDEX is essential; without them, 5M-row scans blow the 128MB
--     memory ceiling.
--   * FTS5 virtual table is populated by a post-insert trigger that just
--     mirrors the source columns (no joins, no external calls).
--   * JSON columns are CHECK (json_valid(...)) for early failure; downstream
--     code can assume the blob parses.

-- =============================================================================
-- 1. Category taxonomy (UNSPSC + Amazon browse tree merged)
-- =============================================================================

CREATE TABLE IF NOT EXISTS category_taxonomy (
  code          TEXT PRIMARY KEY,                    -- e.g. "52141505" (UNSPSC) or "amazon:1266092011"
  parent_code   TEXT,                                 -- nullable; roots have NULL
  level         INTEGER NOT NULL,                     -- 1 = segment, 2 = family, 3 = class, 4 = commodity
  name          TEXT NOT NULL,                        -- human label
  aliases_json  TEXT CHECK (aliases_json IS NULL OR json_valid(aliases_json)),
  source        TEXT NOT NULL,                        -- 'unspsc' | 'amazon' | 'manual'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_category_parent ON category_taxonomy(parent_code);
CREATE INDEX IF NOT EXISTS idx_category_source ON category_taxonomy(source);
CREATE INDEX IF NOT EXISTS idx_category_name   ON category_taxonomy(name COLLATE NOCASE);

-- =============================================================================
-- 2. Brand index (normalized brand identities with aliases)
-- =============================================================================

CREATE TABLE IF NOT EXISTS brand_index (
  slug                        TEXT PRIMARY KEY,       -- kebab-case canonical id, e.g. "delonghi"
  name                        TEXT NOT NULL,           -- display name, e.g. "De'Longhi"
  aliases_json                TEXT CHECK (aliases_json IS NULL OR json_valid(aliases_json)),
                                                       -- ["de longhi","delonghi","De'Longhi America"]
  domain                      TEXT,                    -- canonical site, "delonghi.com"
  country                     TEXT,                    -- ISO-3166 alpha-2
  authorized_dealers_url      TEXT,                    -- where Lens checks "authorized seller?"
  sitemap_url                 TEXT,                    -- where manufacturer sitemap ingester pulls
  parent_slug                 TEXT,                    -- for sub-brands (Ranger → Ford)
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  last_refreshed_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_brand_name      ON brand_index(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_brand_domain    ON brand_index(domain);

-- =============================================================================
-- 3. Data sources registry (one row per ingester)
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_source (
  id                    TEXT PRIMARY KEY,              -- 'cpsc-recalls' | 'fcc-equipment' | 'openfoodfacts' | ...
  name                  TEXT NOT NULL,                  -- "CPSC Recalls RSS"
  type                  TEXT NOT NULL,                  -- 'government' | 'open-data' | 'retailer' | 'manufacturer' | 'paid-api' | 'scrape'
  base_url              TEXT,                           -- canonical endpoint
  docs_url              TEXT,                           -- public docs / method page
  auth_kind             TEXT NOT NULL DEFAULT 'none',   -- 'none' | 'api-key' | 'oauth' | 'robots-limited'
  cadence_minutes       INTEGER NOT NULL,               -- how often to re-run
  last_run_at           TEXT,                            -- from most recent ingestion_run
  last_success_at       TEXT,
  last_error            TEXT,
  rows_total            INTEGER NOT NULL DEFAULT 0,     -- cumulative rows ever persisted
  status                TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'running' | 'ok' | 'stale' | 'failing' | 'disabled'
  confidence_default    REAL NOT NULL DEFAULT 0.9,      -- assigned to rows that don't self-report
  description           TEXT,                           -- one-line for the landing page
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_source_status ON data_source(status);
CREATE INDEX IF NOT EXISTS idx_source_cadence ON data_source(cadence_minutes, last_run_at);

-- Seed the 21 declared sources so the landing page has something to show
-- on day zero. Ingester cron flips status to 'ok'/'failing' as it runs.
INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('cpsc-recalls',      'CPSC Recalls',                  'government',    'https://www.saferproducts.gov/RestWebServices/Recall', 'https://www.cpsc.gov/Recalls',                              'none',       1440,  'Daily RSS of US Consumer Product Safety Commission recalls.'),
  ('nhtsa-recalls',     'NHTSA Recalls',                 'government',    'https://api.nhtsa.gov/recalls/recallsByVehicle',       'https://www.nhtsa.gov/recalls',                             'none',       1440,  'Daily vehicle recalls + TSBs from National Highway Traffic Safety Administration.'),
  ('fda-recalls',       'FDA Device Recalls + 510(k)',   'government',    'https://api.fda.gov/device/recall.json',               'https://open.fda.gov/apis/device/',                         'none',       1440,  'Daily FDA device recalls and 510(k) premarket notifications.'),
  ('fcc-equipment',     'FCC Equipment Authorization',   'government',    'https://apps.fcc.gov/oetcf/eas/reports/GenericSearch.cfm','https://www.fcc.gov/oet/ea/',                               'none',       4320,  'Every wireless device cleared for US sale. ~3M records.'),
  ('epa-energy-star',   'EPA Energy Star',               'government',    'https://data.energystar.gov/resource/j7nq-iepp.json',   'https://www.energystar.gov/productfinder/advanced',         'none',       10080, 'Every Energy Star certified product with full spec sheet. ~500K records.'),
  ('epa-fueleconomy',   'EPA fueleconomy.gov',           'government',    'https://www.fueleconomy.gov/ws/rest/vehicle/menu/year',  'https://www.fueleconomy.gov/feg/ws/index.shtml',            'none',       43200, 'Every US-sold vehicle since 1984 with MPG and specs.'),
  ('usda-foods',        'USDA Branded Foods Database',   'government',    'https://api.nal.usda.gov/fdc/v1/foods/search',           'https://fdc.nal.usda.gov/api-guide.html',                   'api-key',    10080, 'Every branded US food product with full ingredient and nutrient data.'),
  ('federal-register',  'Federal Register (consumer rules)','government',  'https://www.federalregister.gov/api/v1/articles.json',   'https://www.federalregister.gov/reader-aids/developer-resources', 'none',   1440,  'Daily feed of new and proposed consumer-protection regulations.'),
  ('openfoodfacts',     'OpenFoodFacts',                 'open-data',     'https://world.openfoodfacts.org/api/v2/search',          'https://openfoodfacts.github.io/openfoodfacts-server/api/', 'none',       10080, 'Global food product barcodes database. ~3M records.'),
  ('openbeautyfacts',   'OpenBeautyFacts',               'open-data',     'https://world.openbeautyfacts.org/api/v2/search',        'https://wiki.openbeautyfacts.org/',                         'none',       10080, 'Cosmetics barcodes + ingredient data. ~50K records.'),
  ('wikidata',          'Wikidata SPARQL',               'open-data',     'https://query.wikidata.org/sparql',                      'https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service', 'none',     10080, 'Consumer products by Q-class with specs, manufacturers, images. ~500K records.'),
  ('unspsc',            'UNSPSC Taxonomy',               'open-data',     'https://www.unspsc.org/codeset-downloads',               'https://www.unspsc.org/',                                   'none',       525600, 'UN Standard Products and Services Code — 80K leaf categories.'),
  ('amazon-browse-tree','Amazon Browse Tree',            'retailer',      'https://www.amazon.com/gp/sitemap/browse-tree',          'https://webservices.amazon.com/paapi5/documentation/',      'robots-limited', 10080, 'Amazon category taxonomy. ~20K nodes.'),
  ('retailer-sitemaps', 'Retailer sitemap.xml (BBY / Walmart / Target / Costco / Home Depot)', 'retailer', 'see internals', 'https://www.robotstxt.org/',                                   'robots-limited', 10080, 'Every SKU in public retailer sitemaps. ~1M+ rows.'),
  ('manufacturer-sitemaps','Manufacturer sitemap.xml (~30 brands)', 'manufacturer', 'see internals', 'https://www.robotstxt.org/',                                     'robots-limited', 10080, 'First-party manufacturer SKU catalogs (Sony, Apple, Breville, Dyson, ...).'),
  ('keepa',             'Keepa (price history)',         'paid-api',      'https://api.keepa.com/product',                          'https://keepa.com/#!discuss/api',                            'api-key',    60,    '90-day price history for indexed SKUs. Hourly refresh of top 100K.'),
  ('hibp',              'Have I Been Pwned',             'paid-api',      'https://haveibeenpwned.com/api/v3/breaches',             'https://haveibeenpwned.com/API/v3',                         'api-key',    10080, 'Site breach history for retailer / merchant domains.'),
  ('ifixit',            'iFixit Repairability',          'paid-api',      'https://www.ifixit.com/api/2.0',                         'https://www.ifixit.com/api/2.0/doc/',                       'api-key',    10080, 'Repairability scores, teardowns, parts availability.'),
  ('reddit',            'Reddit (reviews/BuyItForLife)', 'open-data',     'https://www.reddit.com/r/BuyItForLife/new.json',         'https://www.reddit.com/dev/api/',                           'none',       1440,  'Daily pull of product-review signals from r/BuyItForLife, r/reviews.'),
  ('trustpilot',        'Trustpilot public',             'scrape',        'https://www.trustpilot.com/',                            'https://business.trustpilot.com/terms',                     'robots-limited', 10080, 'Merchant reputation scores and review counts.'),
  ('ftc-enforcement',   'FTC Enforcement Actions',       'government',    'https://www.ftc.gov/news-events/news/press-releases',    'https://www.ftc.gov/about/foia',                            'none',       10080, 'Weekly FTC enforcement actions (settlements, advertising claims).');

-- =============================================================================
-- 4. Ingestion run log (one row per ingester invocation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ingestion_run (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id         TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at       TEXT,
  status            TEXT NOT NULL DEFAULT 'running',     -- 'running' | 'ok' | 'partial' | 'error'
  rows_seen         INTEGER NOT NULL DEFAULT 0,
  rows_upserted     INTEGER NOT NULL DEFAULT 0,
  rows_skipped      INTEGER NOT NULL DEFAULT 0,
  error_count       INTEGER NOT NULL DEFAULT 0,
  error_sample      TEXT,                                 -- JSON array of up to 10 sample error strings
  log               TEXT,                                 -- freeform notes (truncated to 16KB)
  duration_ms       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_run_source_time ON ingestion_run(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_status      ON ingestion_run(status, started_at DESC);

-- =============================================================================
-- 5. SKU catalog — the canonical identity row
-- =============================================================================

CREATE TABLE IF NOT EXISTS sku_catalog (
  id                    TEXT PRIMARY KEY,                 -- internal UUID/ULID
  canonical_name        TEXT NOT NULL,                     -- the human name Lens shows
  brand_slug            TEXT REFERENCES brand_index(slug), -- FK to brand_index; nullable for unknown
  model_code            TEXT,                              -- "EC260BK", "WH-1000XM5", "M3"
  gtin                  TEXT,                              -- 14-digit global trade item number
  upc                   TEXT,                              -- 12-digit US barcode
  ean                   TEXT,                              -- 13-digit European
  asin                  TEXT,                              -- Amazon's internal id
  fcc_id                TEXT,                              -- FCC grantee + product code
  category_code         TEXT REFERENCES category_taxonomy(code),
  summary               TEXT,                              -- one-sentence description
  image_url             TEXT,                              -- primary product image
  color                 TEXT,                              -- normalized primary color
  weight_grams          INTEGER,                           -- when specs expose it
  width_mm              INTEGER,
  height_mm             INTEGER,
  depth_mm              INTEGER,
  specs_json            TEXT CHECK (specs_json IS NULL OR json_valid(specs_json)),
                                                           -- triangulated consensus specs blob
  first_seen_at         TEXT NOT NULL DEFAULT (datetime('now')),
  last_refreshed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  status                TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'eol' | 'recalled' | 'retired'
  retired_reason        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sku_brand     ON sku_catalog(brand_slug);
CREATE INDEX IF NOT EXISTS idx_sku_category  ON sku_catalog(category_code);
CREATE INDEX IF NOT EXISTS idx_sku_asin      ON sku_catalog(asin) WHERE asin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_upc       ON sku_catalog(upc) WHERE upc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_ean       ON sku_catalog(ean) WHERE ean IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_gtin      ON sku_catalog(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_fccid     ON sku_catalog(fcc_id) WHERE fcc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_name      ON sku_catalog(canonical_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sku_brand_model ON sku_catalog(brand_slug, model_code);
CREATE INDEX IF NOT EXISTS idx_sku_status    ON sku_catalog(status);
CREATE INDEX IF NOT EXISTS idx_sku_refreshed ON sku_catalog(last_refreshed_at);

-- =============================================================================
-- 6. SKU ↔ source links (many-to-one; each source has its own view of a SKU)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sku_source_link (
  sku_id            TEXT NOT NULL REFERENCES sku_catalog(id) ON DELETE CASCADE,
  source_id         TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  external_id       TEXT NOT NULL,                        -- source-scoped id (ASIN, Energy-Star-id, FCC-filing-number, ...)
  external_url      TEXT,                                  -- public URL where this view was scraped
  specs_json        TEXT CHECK (specs_json IS NULL OR json_valid(specs_json)),
  price_cents       INTEGER,                               -- current price seen here; NULL if source doesn't expose price
  currency          TEXT DEFAULT 'USD',
  in_stock          INTEGER,                               -- 0|1|NULL
  observed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  confidence        REAL NOT NULL DEFAULT 0.9,             -- 0..1; source-dependent
  active            INTEGER NOT NULL DEFAULT 1,            -- 0 when the source stops returning this row
  PRIMARY KEY (sku_id, source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_sourcelink_source ON sku_source_link(source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcelink_external ON sku_source_link(source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_sourcelink_active ON sku_source_link(sku_id, active);

-- =============================================================================
-- 7. Normalized spec table (optional, populated for categories where filter matters)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sku_spec (
  sku_id            TEXT NOT NULL REFERENCES sku_catalog(id) ON DELETE CASCADE,
  key               TEXT NOT NULL,                         -- "battery_hours", "pressure_bar", "weight_grams"
  value_text        TEXT,                                   -- when spec is categorical
  value_num         REAL,                                   -- when spec is numeric
  unit              TEXT,                                   -- "hr", "bar", "g"
  source_id         TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  confidence        REAL NOT NULL DEFAULT 0.9,
  observed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sku_id, key, source_id)
);
CREATE INDEX IF NOT EXISTS idx_spec_key_num ON sku_spec(key, value_num);
CREATE INDEX IF NOT EXISTS idx_spec_key_text ON sku_spec(key, value_text COLLATE NOCASE);

-- =============================================================================
-- 8. Triangulated consensus (materialized by hourly cron)
-- =============================================================================

CREATE TABLE IF NOT EXISTS triangulated_price (
  sku_id            TEXT PRIMARY KEY REFERENCES sku_catalog(id) ON DELETE CASCADE,
  currency          TEXT NOT NULL DEFAULT 'USD',
  median_cents      INTEGER NOT NULL,
  p25_cents         INTEGER,
  p75_cents         INTEGER,
  min_cents         INTEGER,
  max_cents         INTEGER,
  n_sources         INTEGER NOT NULL,
  observed_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_triangulated_observed ON triangulated_price(observed_at);

-- =============================================================================
-- 9. Price history time-series
-- =============================================================================

CREATE TABLE IF NOT EXISTS price_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id            TEXT NOT NULL REFERENCES sku_catalog(id) ON DELETE CASCADE,
  source_id         TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  observed_at       TEXT NOT NULL,
  price_cents       INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  on_sale           INTEGER NOT NULL DEFAULT 0,
  sale_pct          REAL
);
CREATE INDEX IF NOT EXISTS idx_history_sku_time ON price_history(sku_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_observed ON price_history(observed_at);

-- =============================================================================
-- 10. Discrepancy log — fires when sources disagree > 15%
-- =============================================================================

CREATE TABLE IF NOT EXISTS discrepancy_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id            TEXT NOT NULL REFERENCES sku_catalog(id) ON DELETE CASCADE,
  field             TEXT NOT NULL,                         -- 'price' | 'spec.battery_hours' | ...
  source_a          TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  source_b          TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  value_a           TEXT,
  value_b           TEXT,
  delta_pct         REAL,                                  -- |a-b|/max(a,b) for numerics
  flagged_at        TEXT NOT NULL DEFAULT (datetime('now')),
  resolved          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_discrepancy_sku ON discrepancy_log(sku_id);
CREATE INDEX IF NOT EXISTS idx_discrepancy_unresolved ON discrepancy_log(resolved, flagged_at DESC);

-- =============================================================================
-- 11. Recalls (normalized across CPSC / NHTSA / FDA)
-- =============================================================================

CREATE TABLE IF NOT EXISTS recall (
  id                TEXT PRIMARY KEY,                      -- internal ULID
  source_id         TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  external_id       TEXT NOT NULL,                         -- source-side recall id (CPSC "24-071")
  title             TEXT NOT NULL,
  product_match_json TEXT CHECK (product_match_json IS NULL OR json_valid(product_match_json)),
                                                           -- {"brand":"Roborock","model":"S8","ufc_ids":[...], "asins":[...]}
  severity          TEXT,                                   -- 'recall' | 'warning' | 'advisory'
  hazard            TEXT,                                   -- 'fire' | 'chemical' | 'laceration' | ...
  published_at     TEXT NOT NULL,
  url               TEXT NOT NULL,
  remedy            TEXT,                                   -- repair / replace / refund / stop using
  affected_units    INTEGER,
  country           TEXT DEFAULT 'US',
  raw_json          TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
  ingested_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recall_external ON recall(source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_recall_published ON recall(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_recall_hazard ON recall(hazard);

-- Junction: which SKUs a recall affects (populated by daily matcher cron)
CREATE TABLE IF NOT EXISTS recall_affects_sku (
  recall_id         TEXT NOT NULL REFERENCES recall(id) ON DELETE CASCADE,
  sku_id            TEXT NOT NULL REFERENCES sku_catalog(id) ON DELETE CASCADE,
  match_confidence  REAL NOT NULL DEFAULT 0.9,
  matched_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (recall_id, sku_id)
);
CREATE INDEX IF NOT EXISTS idx_recall_sku_reverse ON recall_affects_sku(sku_id);

-- =============================================================================
-- 12. Firmware / CVE advisories (vendor + NVD)
-- =============================================================================

CREATE TABLE IF NOT EXISTS firmware_advisory (
  id                TEXT PRIMARY KEY,
  source_id         TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  external_id       TEXT NOT NULL,                         -- 'CVE-2025-12345', 'ASUS-SA-2025-07'
  vendor            TEXT NOT NULL,
  product           TEXT NOT NULL,                         -- model/family name
  cve               TEXT,
  severity          TEXT,                                   -- 'critical' | 'high' | 'medium' | 'low'
  cvss_score        REAL,
  summary           TEXT,
  remediation       TEXT,
  published_at     TEXT NOT NULL,
  url               TEXT NOT NULL,
  raw_json          TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
  ingested_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_advisory_published ON firmware_advisory(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_advisory_severity ON firmware_advisory(severity);

-- =============================================================================
-- 13. Regulation events (consumer-protection regulations with status)
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulation_event (
  id                TEXT PRIMARY KEY,
  source_id         TEXT NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  external_id       TEXT,                                  -- Federal Register doc number
  jurisdiction      TEXT NOT NULL,                         -- 'us-federal' | 'us-ca' | 'eu' | 'uk'
  citation          TEXT NOT NULL,                         -- "16 CFR Part 464" | "CA SB-313"
  title             TEXT NOT NULL,
  status            TEXT NOT NULL,                         -- 'proposed' | 'in-force' | 'vacated' | 'superseded' | 'delayed'
  effective_date    TEXT,
  vacated_date      TEXT,
  vacated_by        TEXT,
  superseded_by     TEXT,
  scope_summary     TEXT,
  url               TEXT NOT NULL,
  raw_json          TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
  ingested_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_regulation_status ON regulation_event(status);
CREATE INDEX IF NOT EXISTS idx_regulation_citation ON regulation_event(citation);

-- =============================================================================
-- 14. FTS5 fuzzy search index
-- =============================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS sku_fts USING fts5(
  sku_id UNINDEXED,
  name,
  brand,
  model,
  category,
  summary,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- =============================================================================
-- 15. Cross-table triggers to keep FTS in sync
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS sku_fts_insert AFTER INSERT ON sku_catalog BEGIN
  INSERT INTO sku_fts(sku_id, name, brand, model, category, summary)
  VALUES (NEW.id, NEW.canonical_name, COALESCE(NEW.brand_slug, ''), COALESCE(NEW.model_code, ''),
          COALESCE(NEW.category_code, ''), COALESCE(NEW.summary, ''));
END;

CREATE TRIGGER IF NOT EXISTS sku_fts_delete AFTER DELETE ON sku_catalog BEGIN
  DELETE FROM sku_fts WHERE sku_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS sku_fts_update AFTER UPDATE ON sku_catalog BEGIN
  DELETE FROM sku_fts WHERE sku_id = OLD.id;
  INSERT INTO sku_fts(sku_id, name, brand, model, category, summary)
  VALUES (NEW.id, NEW.canonical_name, COALESCE(NEW.brand_slug, ''), COALESCE(NEW.model_code, ''),
          COALESCE(NEW.category_code, ''), COALESCE(NEW.summary, ''));
END;

-- =============================================================================
-- 16. Stats view for /architecture/stats endpoint
-- =============================================================================

CREATE VIEW IF NOT EXISTS architecture_stats AS
SELECT
  (SELECT COUNT(*) FROM sku_catalog                 WHERE status = 'active')  AS skus_active,
  (SELECT COUNT(*) FROM sku_catalog)                                          AS skus_total,
  (SELECT COUNT(*) FROM category_taxonomy)                                    AS categories_total,
  (SELECT COUNT(DISTINCT source_id) FROM sku_source_link WHERE active = 1)     AS sources_contributing,
  (SELECT COUNT(*) FROM data_source)                                          AS sources_configured,
  (SELECT COUNT(*) FROM data_source WHERE status = 'ok')                      AS sources_healthy,
  (SELECT COUNT(*) FROM recall)                                               AS recalls_total,
  (SELECT COUNT(*) FROM firmware_advisory)                                    AS advisories_total,
  (SELECT COUNT(*) FROM regulation_event WHERE status = 'in-force')            AS regulations_in_force,
  (SELECT COUNT(*) FROM discrepancy_log WHERE resolved = 0)                    AS discrepancies_open,
  (SELECT COUNT(*) FROM brand_index)                                          AS brands_known,
  (SELECT MAX(finished_at) FROM ingestion_run WHERE status = 'ok')            AS last_successful_run,
  datetime('now')                                                              AS computed_at;