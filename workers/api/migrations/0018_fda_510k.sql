-- 0018_fda_510k.sql — seed row for the FDA 510(k) device clearances.
-- ~200K+ medical devices cleared for US sale. Consumer-relevant slice:
-- glucose meters, blood-pressure cuffs, thermometers, pulse oximeters,
-- nebulizers, hearing aids, insulin pumps, home-test kits, defibrillators.
-- Complements fda-recalls (which covers ENFORCEMENT against cleared devices).

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('fda-510k', 'FDA 510(k) Device Clearances', 'government', 'https://api.fda.gov/device/510k.json', 'https://open.fda.gov/apis/device/510k/', 'none', 1440, 'openFDA feed of every medical device cleared for US sale since 1976 (~200K entries). Daily paginated ingest, covers glucose meters, BP cuffs, thermometers, pulse oximeters, nebulizers, hearing aids, insulin pumps, home test kits. Adds consumer-medical-device catalog layer distinct from fda-recalls (enforcement).');
