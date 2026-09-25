-- Operator-authorised, low-rate discovery only. No page bodies, prices,
-- images, or descriptions are retained and nothing is published automatically.
UPDATE sources SET status = 'ACTIVE', legal_status = 'ALLOWED', kill_switch = false, schedule = '30 1 * * *', rate_limit_rpm = 1, updated_at = now()
WHERE key IN ('aparobot-robots','humanoid-guide-database','robotlab-store');

INSERT INTO source_contracts (source_key, canonical_endpoint, access_mode, legal_basis, allowed_fields, allowed_operations, raw_retention_policy, publication_policy, rate_limit_strategy, stable_id_strategy, parser_version, schema_version)
VALUES
('aparobot-robots','https://www.aparobot.com/robots','OPERATOR_AUTHORISED','Operator authorisation received 2026-07-28; low-rate link discovery only.','["name","canonical_url"]','["discovery_queue"]','No raw HTML retained.','Never publish automatically.','One listing request per day.','SHA-256 canonical URL','catalog-links-v1','1'),
('humanoid-guide-database','https://humanoid.guide/humanoid-robots-database/','OPERATOR_AUTHORISED','Operator authorisation received 2026-07-28; low-rate link discovery only.','["name","canonical_url"]','["discovery_queue"]','No raw HTML retained.','Never publish automatically.','One listing request per day.','SHA-256 canonical URL','catalog-links-v1','1'),
('robotlab-store','https://www.robotlab.com/store/','OPERATOR_AUTHORISED','Operator authorisation received 2026-07-28; low-rate link discovery only.','["name","canonical_url"]','["discovery_queue"]','No raw HTML retained.','Never publish automatically.','One listing request per day.','SHA-256 canonical URL','catalog-links-v1','1')
ON CONFLICT DO NOTHING;

UPDATE scheduled_agents SET display_name = 'Authorised catalog directory collector', description = 'Collects only candidate names and product URLs from authorised catalog directories at a low rate. It stores no prices, images, descriptions or raw HTML, and never publishes robots.', source_keys = '["aparobot-robots","humanoid-guide-database","robotlab-store"]'::jsonb, implementation_status = 'READY', is_enabled = true, cron_expression = '30 1 * * *', updated_at = now()
WHERE agent_key = 'catalog-commercial-directory-review';
