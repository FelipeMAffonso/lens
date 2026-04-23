-- 0026_category_classify.sql — seed the category auto-classifier.
-- Walks under-categorised SKUs each hour, assigns a Google Product Taxonomy
-- code via wikidata-class mapping + known-prefix defaults. 200/run.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('category-classify', 'Category auto-classifier', 'open-data', 'internal', 'https://github.com/FelipeMAffonso/lens/blob/main/workers/api/src/ingest/sources/category-classify.ts', 'none', 60, 'Assigns Google Product Taxonomy category_code to under-categorised SKUs. Maps wikidata class slugs + source-id prefixes to GPT category codes. 200 SKUs per hourly run. Fixes the "5,326 categories seeded but 0 SKUs assigned" gap.');
