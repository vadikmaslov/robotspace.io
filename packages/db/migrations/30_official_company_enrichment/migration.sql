-- Enrichment begins only after a company website is independently verified.
-- Pages are fetched transiently from that exact official domain; no HTML,
-- marketing copy, images or unapproved outbound links are retained.
INSERT INTO sources (
  key, display_name, owner_name, homepage_url, content_area, admin_description, public_description,
  is_public, tier, source_type, status, legal_status, rate_limit_rpm, trust_default_confidence, kill_switch, schedule
) VALUES (
  'official-company-websites', 'Verified company websites', 'RobotSpace verified company domains', NULL, 'CATALOG',
  'Low-rate enrichment from independently verified company domains. Reads only JSON-LD Organization facts and explicitly linked About/Contact pages on the same host. No raw HTML, copy, logos or unverified outbound links are retained.',
  'Official company-domain facts are used only after independent website verification.', false, 'A', 'HTML', 'ACTIVE', 'ALLOWED', 1, 0.95, false, '40 */6 * * *'
)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name, admin_description = EXCLUDED.admin_description, public_description = EXCLUDED.public_description,
  rate_limit_rpm = EXCLUDED.rate_limit_rpm, updated_at = now();

INSERT INTO source_contracts (
  source_key, canonical_endpoint, access_mode, legal_basis, allowed_fields, allowed_operations,
  raw_retention_policy, publication_policy, rate_limit_strategy, stable_id_strategy, parser_version, schema_version
) VALUES (
  'official-company-websites', 'https://verified-company-domain.invalid/', 'OPERATOR_AUTHORISED',
  'Operator authorisation received 2026-07-29 for low-rate enrichment from already verified official company domains.',
  '["country_code","founded_year","canonical_url"]', '["company_structured_data_enrichment"]',
  'No raw HTML, page copy, images, logos or unapproved outbound URLs retained.',
  'Only structured country and founding-year facts may update empty company fields; each result keeps official-domain provenance.',
  'At most one company per minute; maximum three same-domain pages per company.',
  'Verified company entity UUID.', 'official-company-v1', '1'
)
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_agents (
  agent_key, display_name, description, cron_expression, is_enabled, run_mode,
  site_area, agent_role, parent_agent_key, source_keys, task_complexity, implementation_status
) VALUES (
  'official-company-enrichment', 'Official company structured-data enrichment',
  'Fills missing country and founding year from JSON-LD and explicitly linked About/Contact pages on an already verified official domain. It stores no page text or images.',
  '40 */6 * * *', false, 'SCHEDULED', 'CATALOG', 'PROCESSOR', 'catalog-orchestrator',
  '["official-company-websites"]'::jsonb, 'SIMPLE', 'READY'
)
ON CONFLICT (agent_key) DO UPDATE SET
  display_name = EXCLUDED.display_name, description = EXCLUDED.description, cron_expression = EXCLUDED.cron_expression,
  site_area = EXCLUDED.site_area, agent_role = EXCLUDED.agent_role, parent_agent_key = EXCLUDED.parent_agent_key,
  source_keys = EXCLUDED.source_keys, task_complexity = EXCLUDED.task_complexity, implementation_status = EXCLUDED.implementation_status,
  updated_at = now();

UPDATE scheduled_agents
SET source_keys = source_keys || '["official-company-websites"]'::jsonb, updated_at = now()
WHERE agent_key = 'catalog-orchestrator'
  AND NOT source_keys ? 'official-company-websites';
