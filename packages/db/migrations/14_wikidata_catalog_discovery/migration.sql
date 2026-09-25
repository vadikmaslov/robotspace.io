-- Retain only permitted identity metadata for source-backed discovery.
ALTER TABLE source_records ADD COLUMN metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Wikidata is the first enabled external discovery source. Its contract permits
-- identity metadata only; it is not an authority for technical specifications.
UPDATE sources
SET status = 'ACTIVE', kill_switch = false, schedule = '20 */6 * * *', rate_limit_rpm = 10, updated_at = now()
WHERE key = 'wikidata';

INSERT INTO source_contracts (
  source_key, canonical_endpoint, access_mode, legal_basis, terms_url, terms_checked_at,
  allowed_fields, allowed_operations, raw_retention_policy, publication_policy,
  rate_limit_strategy, stable_id_strategy, cursor_or_watermark, parser_version,
  schema_version, freshness_sla_hours, confidence_caps_by_field, attribution_template
)
SELECT
  'wikidata', 'https://www.wikidata.org/w/api.php', 'PUBLIC_API',
  'CC0 structured-data discovery; follow Wikidata data-access guidance, identify RobotSpace and back off on errors.',
  'https://www.wikidata.org/wiki/Wikidata:Data_access', now(),
  '["qid","label","description","concept_uri"]'::jsonb,
  '["identity_discovery","entity_resolution_candidate"]'::jsonb,
  'No raw responses; retain permitted identity metadata only.',
  'Never publish a value based only on Wikidata discovery. Use candidates for reconciliation and link to the source entity.',
  'Maximum 10 API requests per minute; one retry only after exponential backoff.',
  'Wikidata QID', 'Company queue selected from existing Unibot brands.', 'wd-company-v1', '1', 10080,
  '{"identity":0.65,"technical":0.45}'::jsonb, 'Wikidata: {qid}'
WHERE NOT EXISTS (SELECT 1 FROM source_contracts WHERE source_key = 'wikidata');

UPDATE scheduled_agents
SET implementation_status = 'READY', is_enabled = true, cron_expression = '20 */6 * * *', updated_at = now()
WHERE agent_key = 'catalog-wikidata-discovery';

UPDATE scheduled_agents
SET implementation_status = 'READY', is_enabled = true, cron_expression = '45 */6 * * *', updated_at = now()
WHERE agent_key = 'catalog-orchestrator';
