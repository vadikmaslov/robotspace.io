-- The operator approved factual detail enrichment from the three listed robot
-- catalogues. Raw page bodies remain transient; only normalized factual fields
-- and an admin-only source link are retained.
UPDATE sources
SET status = 'ACTIVE',
    legal_status = 'ALLOWED',
    kill_switch = false,
    rate_limit_rpm = 20,
    updated_at = now()
WHERE key IN ('aparobot-robots', 'humanoid-guide-database', 'robotlab-store');

UPDATE source_contracts
SET allowed_fields = '["name","canonical_url","manufacturer_name","payload_kg","reach_mm","weight_kg","summary"]'::jsonb,
    allowed_operations = '["discovery_queue","identity_cross_reference","detail_enrichment"]'::jsonb,
    raw_retention_policy = 'Transient HTML only; retain normalized facts and canonical URL, never HTML, images, prices or logos.',
    publication_policy = 'May automatically publish validated robot records. Resolve fields in priority order Aparobot, then Humanoid Guide, then RobotLAB; lower-priority sources fill only missing fields. A deterministic Unibot match may supply only the brand and image.',
    rate_limit_strategy = 'At most 20 detail requests/minute/source; retry failures on a later scheduled run.',
    parser_version = 'catalog-detail-v2',
    schema_version = '2',
    updated_at = now()
WHERE source_key IN ('aparobot-robots', 'humanoid-guide-database', 'robotlab-store');

UPDATE scheduled_agents
SET display_name = 'Catalog source collector',
    description = 'Collects source URLs and transiently parses factual robot detail pages. Aparobot is applied first, Humanoid Guide second, RobotLAB third; later sources only fill missing parameters and short source-based descriptions. Exact Unibot matches provide only brand and image. Every applied page is kept as an admin-only source link.',
    source_keys = '["aparobot-robots","humanoid-guide-database","robotlab-store","unibot-catalog"]'::jsonb,
    task_complexity = 'SIMPLE',
    implementation_status = 'READY',
    is_enabled = true,
    cron_expression = '15 * * * *',
    updated_at = now()
WHERE agent_key = 'catalog-orchestrator';

UPDATE scheduled_agents
SET display_name = 'Catalog directory collector',
    description = 'Discovers robot product URLs from Aparobot, Humanoid Guide and RobotLAB once daily. Detail enrichment and publication are performed by the catalog orchestrator.',
    source_keys = '["aparobot-robots","humanoid-guide-database","robotlab-store"]'::jsonb,
    task_complexity = 'SIMPLE',
    implementation_status = 'READY',
    is_enabled = true,
    cron_expression = '30 1 * * *',
    updated_at = now()
WHERE agent_key = 'catalog-commercial-directory-review';
