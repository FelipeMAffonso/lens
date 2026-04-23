-- 0017_cisa_kev.sql — seed row for the CISA Known Exploited Vulnerabilities catalog.
-- CISA KEV is a hand-curated subset of CVEs that are actively being exploited in
-- the wild. For Lens it's the sharpest firmware-risk signal we can surface for
-- connected-device purchases — far higher signal-to-noise than the full NVD feed.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('cisa-kev', 'CISA Known Exploited Vulnerabilities', 'government', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', 'none', 360, 'Curated catalog of CVEs actively being exploited in the wild (~1,500 entries, ~6h refresh). Highest signal-to-noise firmware risk layer: if a device you own shows up here, vendor has a CISA-mandated patch window. Cross-references with sku_catalog on vendor+product.');
