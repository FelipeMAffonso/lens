-- 0025_upcitemdb.sql — seed row for the UPC item DB cross-retailer enricher.
-- Free trial tier ~1 req/6s. Per run we touch 4 SKUs that have a UPC/EAN/GTIN
-- but haven't been enriched yet. Writes per-merchant sku_source_link + price
-- observations so triangulated_price finally has N>1 retailers for many SKUs.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('upcitemdb', 'UPCitemdb (cross-retailer barcode lookup)', 'open-data', 'https://api.upcitemdb.com/prod/trial/lookup', 'https://www.upcitemdb.com/api', 'none', 15, 'Free UPC/EAN/GTIN lookup. For any SKU that has a barcode, pulls multi-retailer offers (merchant + price + link) + images + category + dimensions. Bridges wd/fda510k/off SKUs that share a UPC so triangulated_price has N>1 retailers.');
