-- 0012_more_sources.sql — seed openlibrary + musicbrainz data_source rows.

INSERT OR IGNORE INTO data_source (id, name, type, base_url, docs_url, auth_kind, cadence_minutes, description) VALUES
  ('openlibrary', 'OpenLibrary', 'open-data', 'https://openlibrary.org/search.json', 'https://openlibrary.org/developers/api', 'none', 1440, '30M+ books with ISBN, title, author, publisher, cover image. Feeds sku_catalog via ISBN-13 as gtin/ean.'),
  ('musicbrainz', 'MusicBrainz', 'open-data', 'https://musicbrainz.org/ws/2/release', 'https://musicbrainz.org/doc/MusicBrainz_API', 'none', 4320, '3M+ music releases with barcode, label, format (Vinyl/CD/Cassette). Physical-media SKUs.');