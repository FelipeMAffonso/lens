-- 0028_bls_cpi.sql — BLS Consumer Price Index (macro price anchor).

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('bls-cpi', 'BLS Consumer Price Index (CPI-U)', 'government', 'https://api.bls.gov/publicAPI/v2/timeseries/data/', 'https://www.bls.gov/developers/api_python.htm', 'none', 1440, 'Monthly CPI-U All-Items + 10 consumer-category sub-indexes (food, shelter, new-vehicles, used-vehicles, food-away, medical-care, education, communication). Price-inflation anchor for audit "is this fair" claims.');
