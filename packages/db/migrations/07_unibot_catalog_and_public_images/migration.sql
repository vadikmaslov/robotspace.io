-- Unibot is an auxiliary catalog source. Keep its raw catalog cache separate
-- from canonical RobotSpace projections so it cannot publish fields by itself.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS image_url varchar(2000);

ALTER TABLE company_public_projections
  ADD COLUMN IF NOT EXISTS image_url varchar(2000),
  ADD COLUMN IF NOT EXISTS unibot_id varchar(50);

ALTER TABLE robot_public_projections
  ADD COLUMN IF NOT EXISTS image_url varchar(2000),
  ADD COLUMN IF NOT EXISTS unibot_id varchar(50);

CREATE TABLE IF NOT EXISTS unibot_import_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url varchar(2000) NOT NULL DEFAULT 'https://unibot.ru/local/gadgets/maslov/catalog_export/catalog.php',
  cron_expression varchar(100) NOT NULL DEFAULT '0 */6 * * *',
  is_enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status varchar(50),
  last_sync_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO unibot_import_config (feed_url)
SELECT 'https://unibot.ru/local/gadgets/maslov/catalog_export/catalog.php'
WHERE NOT EXISTS (SELECT 1 FROM unibot_import_config);

CREATE TABLE IF NOT EXISTS unibot_catalog_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unibot_id varchar(50) NOT NULL,
  entity_type varchar(20) NOT NULL CHECK (entity_type IN ('robot', 'brand')),
  name varchar(500) NOT NULL,
  name_en varchar(500),
  code varchar(255),
  section_name varchar(500),
  section_name_en varchar(500),
  brand_name varchar(500),
  brand_name_en varchar(500),
  country_ru varchar(100),
  country_code char(2),
  picture_url varchar(2000),
  page_url varchar(2000),
  price_rub integer,
  raw_json jsonb NOT NULL,
  matched_robot_id uuid,
  matched_company_id uuid,
  match_confidence numeric(4,2),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_unibot_cache_id_type UNIQUE (unibot_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_unibot_cache_id_type ON unibot_catalog_cache (unibot_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_unibot_cache_matched_robot ON unibot_catalog_cache (matched_robot_id);
CREATE INDEX IF NOT EXISTS idx_unibot_cache_matched_company ON unibot_catalog_cache (matched_company_id);
