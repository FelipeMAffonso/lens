-- 0011_nvd_seed.sql — add nvd-cve data_source row + one FK sanity relaxation.
-- Non-destructive; safe to re-run via ON CONFLICT DO NOTHING.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('nvd-cve', 'NIST NVD CVE', 'government', 'https://services.nvd.nist.gov/rest/json/cves/2.0', 'https://nvd.nist.gov/developers/vulnerabilities', 'none', 1440, 'Daily pull of CVE advisories from the National Vulnerability Database. Populates firmware_advisory for consumer-device security alerts.');

-- Also re-seed any data_source rows that may have been UPSERTed with cursor
-- JSON blobs in last_error (side effect of early ingester runs). Reset them
-- to NULL so the source tiles no longer show the blob as an error string.
UPDATE data_source SET last_error = NULL
  WHERE last_error IS NOT NULL
    AND (last_error LIKE '{%' OR last_error LIKE '[%');