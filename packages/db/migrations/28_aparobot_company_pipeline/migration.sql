-- Aparobot is a discovery-only directory for company identities. The
-- collector retains neither page bodies nor media. An outbound link can be
-- written to company_public_projections.official_url only after the worker
-- verifies it as a plausible official HTTPS site for that exact company.
INSERT INTO sources (
  key, display_name, owner_name, homepage_url, content_area, admin_description, public_description,
  is_public, tier, source_type, status, legal_status, rate_limit_rpm, trust_default_confidence, kill_switch, schedule
) VALUES (
  'aparobot-companies', 'Aparobot Company Directory', 'Aparobot', 'https://www.aparobot.com/companies', 'CATALOG',
  'Low-rate company/brand identity discovery. Retains only name, country code and a provenance link. Aparobot profile pages are never treated as official company sites; an outbound View Website link is used only after independent HTTPS/domain/title validation.',
  'Company-directory discovery provenance; official sites are verified separately.', false, 'C', 'HTML', 'ACTIVE', 'ALLOWED', 1, 0.60, false, '20 */6 * * *'
)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name, homepage_url = EXCLUDED.homepage_url, content_area = EXCLUDED.content_area,
  admin_description = EXCLUDED.admin_description, public_description = EXCLUDED.public_description,
  rate_limit_rpm = EXCLUDED.rate_limit_rpm, updated_at = now();

INSERT INTO source_contracts (
  source_key, canonical_endpoint, access_mode, legal_basis, allowed_fields, allowed_operations,
  raw_retention_policy, publication_policy, rate_limit_strategy, stable_id_strategy, parser_version, schema_version
) VALUES (
  'aparobot-companies', 'https://www.aparobot.com/companies', 'OPERATOR_AUTHORISED',
  'Operator authorisation received 2026-07-28 for low-rate company discovery. Aparobot is used only as a directory/provenance lead; official company websites are independently checked before use.',
  '["name","country_code","canonical_url","verified_official_url"]', '["company_identity_import","official_url_verification"]',
  'No raw HTML, descriptions, images, logos, prices or rejected outbound URLs retained.',
  'Aparobot URLs stay admin-only provenance links. Company identity may be published; official_url is written only after conservative independent validation.',
  'One Aparobot request per minute; check only an explicitly labelled website candidate.',
  'Aparobot company path slug.', 'aparobot-company-v1', '1'
)
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_agents (
  agent_key, display_name, description, cron_expression, is_enabled, run_mode,
  site_area, agent_role, parent_agent_key, source_keys, task_complexity, implementation_status
) VALUES (
  'aparobot-company-import', 'Aparobot company and brand importer',
  'Imports company/brand identities at one Aparobot profile per minute. It never stores directory content or uses Aparobot as an official website; it accepts an external site only after conservative ownership checks.',
  '20 */6 * * *', false, 'SCHEDULED', 'CATALOG', 'PROCESSOR', 'catalog-orchestrator',
  '["aparobot-companies"]'::jsonb, 'SIMPLE', 'READY'
)
ON CONFLICT (agent_key) DO UPDATE SET
  display_name = EXCLUDED.display_name, description = EXCLUDED.description, cron_expression = EXCLUDED.cron_expression,
  site_area = EXCLUDED.site_area, agent_role = EXCLUDED.agent_role, parent_agent_key = EXCLUDED.parent_agent_key,
  source_keys = EXCLUDED.source_keys, task_complexity = EXCLUDED.task_complexity, implementation_status = EXCLUDED.implementation_status,
  updated_at = now();

UPDATE scheduled_agents
SET source_keys = '["wikidata","unibot-catalog","aparobot-robots","aparobot-companies","humanoid-guide-database","robotlab-store","unchained-robotics-catalog"]'::jsonb,
    updated_at = now()
WHERE agent_key = 'catalog-orchestrator';
