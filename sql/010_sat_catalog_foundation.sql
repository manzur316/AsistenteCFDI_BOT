-- 010_sat_catalog_foundation.sql
-- Additive SAT CFDI 4.0 catalog foundation.
-- Does not copy official source files, credentials, XML/PDF or runtime artifacts.

CREATE TABLE IF NOT EXISTS sat_catalog_sources (
  source_id text PRIMARY KEY,
  source_type text NOT NULL,
  source_name text NOT NULL,
  source_path text,
  source_hash text,
  catalog_version text,
  imported_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS sat_catalog_entries (
  entry_id text PRIMARY KEY,
  source_id text REFERENCES sat_catalog_sources(source_id),
  catalog_name text NOT NULL,
  key text NOT NULL,
  description text,
  valid_from date,
  valid_to date,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sat_catalog_entries_catalog_key
  ON sat_catalog_entries(catalog_name, key);

CREATE INDEX IF NOT EXISTS idx_sat_catalog_entries_catalog_description
  ON sat_catalog_entries(catalog_name, description);

CREATE INDEX IF NOT EXISTS idx_sat_catalog_entries_active
  ON sat_catalog_entries(active);

CREATE INDEX IF NOT EXISTS idx_sat_catalog_entries_attributes_gin
  ON sat_catalog_entries USING gin(attributes);
