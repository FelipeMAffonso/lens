-- 0024_wikidata_enrich.sql — seed row for the wikidata deep-enricher.
-- Runs every 10 min, sweeps 15 under-specced wd:* SKUs per run, pulls
-- their full Wikidata entity JSON (~30-100 claims per product) and
-- hydrates sku_catalog.specs_json + dedicated columns (upc, ean, gtin,
-- fcc_id, model_code, image_url, brand_slug). Directly addresses user
-- feedback 2026-04-23: "for all those SKUs are you sure you have all
-- information humanly possible?! No → fix that."

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('wikidata-enrich', 'Wikidata deep-enricher', 'open-data', 'https://www.wikidata.org/wiki/Special:EntityData/', 'https://www.mediawiki.org/wiki/Wikibase/EntityData', 'none', 10, 'Per-SKU Wikidata entity fetcher. Sweeps under-specced wd:* rows, pulls full claim list (weight, dimensions, materials, UPC/EAN/GTIN, country of origin, release date, official website, FCC ID, MPN, colour, brand, etc.), promotes to dedicated columns. 15 entities per 10-min run.');
