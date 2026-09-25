-- Additional direct official market context and authenticated UN Comtrade access.
-- Context metrics are deliberately labelled as AI/automation context, not as
-- industrial-robot installation or market-size estimates.
INSERT INTO metric_definitions (key, display_name, description_en, formula_version, min_sources, min_observations, freshness_hours, publish_threshold)
VALUES
  ('eu_enterprises_using_autonomous_robot_ai', 'EU enterprises using autonomous-robot AI', 'Percentage of enterprises reporting AI that enables physical movement of machines through autonomous decisions. Eurostat includes autonomous robots, self-driving vehicles and autonomous drones in this indicator.', 'eurostat-isoc-eb-ai-v1', 1, 1, 35040, 0.90),
  ('eu_enterprises_using_ai_production_processes', 'EU enterprises using AI for production processes', 'Percentage of enterprises reporting use of AI technologies for production processes.', 'eurostat-isoc-eb-ai-v1', 1, 1, 35040, 0.90),
  ('eu_enterprises_using_ai_logistics', 'EU enterprises using AI for logistics', 'Percentage of enterprises reporting use of AI technologies for logistics.', 'eurostat-isoc-eb-ai-v1', 1, 1, 35040, 0.90)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name, description_en = EXCLUDED.description_en, formula_version = EXCLUDED.formula_version,
  min_sources = EXCLUDED.min_sources, min_observations = EXCLUDED.min_observations, freshness_hours = EXCLUDED.freshness_hours,
  publish_threshold = EXCLUDED.publish_threshold;

UPDATE sources
SET admin_description = 'Official Eurostat APIs. Retain released numerical observations, dimensions, period and API URL only. Robot-adoption and explicitly labelled automation-context indicators remain separate.',
    public_description = 'Official EU enterprise robot-adoption and explicitly labelled automation-context statistics.',
    updated_at = now()
WHERE key = 'eurostat-robot-adoption';

UPDATE source_contracts
SET allowed_fields = '["value_numeric","unit","period","country_code","indicator","canonical_url"]',
    publication_policy = 'Show country or EU aggregate percentage with indicator label, source and reference year. AI and automation context must never be relabelled as industrial-robot adoption.',
    parser_version = 'market-stats-v2'
WHERE source_key = 'eurostat-robot-adoption';

UPDATE source_contracts
SET canonical_endpoint = 'https://comtradeapi.un.org/data/v1/get/C/A/HS',
    access_mode = 'API_KEY',
    legal_basis = 'UN Comtrade API subscription key supplied by RobotSpace; collect released aggregate data only.',
    rate_limit_strategy = 'Authenticated API; six small aggregate requests per weekly run, spaced by one second.',
    parser_version = 'market-stats-v2'
WHERE source_key = 'un-comtrade-industrial-robots';
