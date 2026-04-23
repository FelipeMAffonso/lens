-- 0020_ingester_cursor.sql — dedicated cursor column for ingesters.
-- Prior to this, ingesters abused `data_source.last_error` to persist
-- cursor state (wikidata page offset, fda-510k skip, nhtsa index, etc.).
-- But `framework.markFinished` overwrites `last_error` on every run,
-- so successful runs wiped the cursor and the next tick re-ingested
-- the same first page forever. Distinct SKU count stayed flat at ~6.9K
-- despite `rows_total` accumulating to 600K+.
--
-- Adds `cursor_json` (TEXT, nullable) that each ingester reads + writes
-- independently of success/failure state.

ALTER TABLE data_source ADD COLUMN cursor_json TEXT;
