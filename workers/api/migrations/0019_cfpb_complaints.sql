-- 0019_cfpb_complaints.sql — seed row for the CFPB Consumer Complaint Database.
-- ~14.6M complaints since 2011. Per-run we fetch the latest 200 and aggregate
-- by (company, product) into regulation_event rows with jurisdiction
-- 'us-federal-cfpb-complaint'. Consumer-trust signal: tells Lens which
-- companies consumers have actually complained to the federal regulator about.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('cfpb-complaints', 'CFPB Consumer Complaint Database', 'government', 'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/', 'https://cfpb.github.io/api/ccdb/', 'none', 720, 'CFPB consumer complaints (14.6M since 2011). Ingested by company × product aggregation; surfaces which companies consumers are actually complaining to the federal regulator about. Trust-signal layer for financial products, debt, mortgages, credit reporting, etc.');
