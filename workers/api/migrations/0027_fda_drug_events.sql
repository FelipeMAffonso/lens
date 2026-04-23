-- 0027_fda_drug_events.sql — FDA Adverse Event Reporting System (FAERS).
-- 20M+ adverse-event reports; we aggregate by medicinalproduct per run,
-- write one regulation_event per drug with event / serious / death counts
-- + sample reactions + indications. Consumer-useful "drug safety signal"
-- layer for OTC / pharmacy SKUs.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('fda-drug-events', 'FDA Adverse Event Reporting (FAERS)', 'government', 'https://api.fda.gov/drug/event.json', 'https://open.fda.gov/apis/drug/event/', 'none', 180, 'openFDA FAERS feed — 20M+ adverse-event reports. Per-run fetches latest 100, aggregates by drug, writes regulation_event rows with event/serious/death counts + sample reactions + indications.');
