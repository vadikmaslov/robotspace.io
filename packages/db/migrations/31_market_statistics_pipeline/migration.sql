-- Public, source-backed market statistics. These records are direct values
-- from the cited source, never estimates of market share or revenue.
ALTER TABLE metric_observations
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(100) REFERENCES sources(key) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_record_id uuid REFERENCES source_records(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS evidence_url VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS observation_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS formula_version VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_observation_key
  ON metric_observations(observation_key) WHERE observation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_metric_observations_source
  ON metric_observations(source_key, observed_at DESC);

INSERT INTO sources (
  key, display_name, owner_name, homepage_url, content_area, admin_description, public_description,
  is_public, tier, source_type, status, legal_status, rate_limit_rpm, trust_default_confidence, kill_switch, schedule
) VALUES
  ('ifr-world-robotics', 'IFR World Robotics', 'International Federation of Robotics', 'https://ifr.org/', 'MARKET',
   'Official IFR press releases and public presentations. Retain only directly reported aggregate values, period and canonical source URL; do not retain reports, charts or article text.',
   'Official industrial-robot statistics from the International Federation of Robotics.', true, 'A', 'HTML', 'ACTIVE', 'ALLOWED', 2, 0.95, false, '10 8 * * 1'),
  ('a3-robot-statistics', 'A3 Robot Statistics', 'Association for Advancing Automation', 'https://www.automate.org/robotics/industry-statistics', 'MARKET',
   'Official A3 press releases. Retain only directly reported North American orders, value, period and canonical source URL; do not retain article text or charts.',
   'Official North American robot-order statistics from A3.', true, 'A', 'HTML', 'ACTIVE', 'ALLOWED', 2, 0.90, false, '10 8 * * 1'),
  ('eurostat-robot-adoption', 'Eurostat Robot Adoption', 'Eurostat', 'https://ec.europa.eu/eurostat/', 'MARKET',
   'Official Eurostat API dataset isoc_eb_p3d. Retain released numerical observations, dimensions, period and API URL only.',
   'Official EU enterprise robot-adoption statistics.', true, 'A', 'API', 'ACTIVE', 'ALLOWED', 5, 0.95, false, '10 8 * * 1'),
  ('un-comtrade-industrial-robots', 'UN Comtrade Industrial Robot Trade', 'United Nations Statistics Division', 'https://comtradeplus.un.org/', 'MARKET',
   'UN Comtrade preview API for HS 847950. Retain released aggregate trade values and declared estimation flag only. Trade is a proxy and must never be labelled as installations or market share.',
   'Official cross-border trade statistics for HS 847950 industrial robots.', true, 'A', 'API', 'ACTIVE', 'ALLOWED', 2, 0.80, false, '10 8 * * 1')
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name, admin_description = EXCLUDED.admin_description, public_description = EXCLUDED.public_description,
  status = EXCLUDED.status, legal_status = EXCLUDED.legal_status, rate_limit_rpm = EXCLUDED.rate_limit_rpm,
  trust_default_confidence = EXCLUDED.trust_default_confidence, kill_switch = EXCLUDED.kill_switch, updated_at = now();

INSERT INTO source_contracts (
  source_key, canonical_endpoint, access_mode, legal_basis, allowed_fields, allowed_operations,
  raw_retention_policy, publication_policy, rate_limit_strategy, stable_id_strategy, parser_version, schema_version
) VALUES
  ('ifr-world-robotics', 'https://ifr.org/ifr-press-releases/', 'PUBLIC_STATISTICS',
   'Public official press-release facts, captured as attributed numerical observations only.',
   '["value_numeric","unit","period","geography","canonical_url"]', '["market_statistic_collection"]',
   'No HTML, PDFs, charts, images or article copy retained.',
   'Show direct source-backed values with source link and reporting period; never imply a broader metric than IFR reports.',
   'One request per run; weekly refresh.', 'Source URL plus reporting year.', 'market-stats-v1', '1'),
  ('a3-robot-statistics', 'https://www.automate.org/robotics/industry-statistics', 'PUBLIC_STATISTICS',
   'Public official A3 press-release facts, captured as attributed numerical observations only.',
   '["value_numeric","unit","period","geography","segment","canonical_url"]', '["market_statistic_collection"]',
   'No HTML, charts or article copy retained.',
   'Show North American order statistics with source link and reporting period; do not extrapolate globally.',
   'One request per run; weekly refresh.', 'Source URL plus reporting year.', 'market-stats-v1', '1'),
  ('eurostat-robot-adoption', 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_eb_p3d', 'OPEN_API',
   'Eurostat public Statistics API; use released official observations and metadata.',
   '["value_numeric","unit","period","country_code","robot_type","canonical_url"]', '["market_statistic_collection"]',
   'No raw API payload retained; normalized observations and API URL only.',
   'Show country-level enterprise-adoption percentage, source and reference year.',
   'Maximum five requests per minute; two filtered requests per run.', 'Dataset code, dimensions and reference year.', 'market-stats-v1', '1'),
  ('un-comtrade-industrial-robots', 'https://comtradeapi.un.org/public/v1/preview/C/A/HS', 'OPEN_API',
   'UN Comtrade public preview API for aggregate released trade data.',
   '["value_numeric","unit","period","reporter_code","flow","estimated","canonical_url"]', '["market_statistic_collection"]',
   'No raw API payload retained; normalized aggregate observations and API URL only.',
   'Show as HS 847950 industrial-robot trade proxy, with flow, reporting year and estimation disclosure; never as installations or market share.',
   'Maximum two requests per minute; two aggregate requests per run.', 'Reporter code, flow, HS code and reference year.', 'market-stats-v1', '1')
ON CONFLICT DO NOTHING;

INSERT INTO metric_definitions (key, display_name, description_en, formula_version, min_sources, min_observations, freshness_hours, publish_threshold)
VALUES
  ('industrial_robot_installations_world', 'Global industrial robot installations', 'Direct annual installation count reported by IFR.', 'direct-source-v1', 1, 1, 10560, 0.90),
  ('industrial_robot_operational_stock_world', 'Global operational stock of industrial robots', 'Direct year-end operational-stock count reported by IFR.', 'direct-source-v1', 1, 1, 10560, 0.90),
  ('industrial_robot_installations_region_share', 'Share of global industrial robot installations by region', 'Direct regional share reported by IFR for the same annual installation total.', 'direct-source-v1', 1, 1, 10560, 0.90),
  ('north_america_robot_orders', 'North American robot orders', 'Direct annual robot-order count reported by A3.', 'direct-source-v1', 1, 1, 10560, 0.85),
  ('north_america_robot_order_value', 'North American robot order value', 'Direct annual robot-order value in USD reported by A3.', 'direct-source-v1', 1, 1, 10560, 0.85),
  ('eu_enterprises_using_industrial_robots', 'EU enterprises using industrial robots', 'Percentage of enterprises reporting industrial-robot use in Eurostat dataset isoc_eb_p3d.', 'eurostat-isoc-eb-p3d-v1', 1, 1, 35040, 0.90),
  ('eu_enterprises_using_service_robots', 'EU enterprises using service robots', 'Percentage of enterprises reporting service-robot use in Eurostat dataset isoc_eb_p3d.', 'eurostat-isoc-eb-p3d-v1', 1, 1, 35040, 0.90),
  ('industrial_robot_trade_exports', 'Industrial robot exports (trade proxy)', 'Annual exports under HS 847950; this is trade, not installations or market share.', 'un-comtrade-hs847950-v1', 1, 1, 35040, 0.70),
  ('industrial_robot_trade_imports', 'Industrial robot imports (trade proxy)', 'Annual imports under HS 847950; this is trade, not installations or market share.', 'un-comtrade-hs847950-v1', 1, 1, 35040, 0.70)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name, description_en = EXCLUDED.description_en, formula_version = EXCLUDED.formula_version,
  min_sources = EXCLUDED.min_sources, min_observations = EXCLUDED.min_observations, freshness_hours = EXCLUDED.freshness_hours,
  publish_threshold = EXCLUDED.publish_threshold;

INSERT INTO scheduled_agents (
  agent_key, display_name, description, cron_expression, is_enabled, run_mode,
  site_area, agent_role, parent_agent_key, source_keys, task_complexity, implementation_status
) VALUES
  ('market-statistics-collector', 'Official market statistics collector',
   'Collects direct numerical observations from contracted IFR, A3, Eurostat and UN Comtrade endpoints. It stores no raw pages and never derives market share, funding or investment claims.',
   '10 8 * * 1', true, 'SCHEDULED', 'MARKET', 'COLLECTOR', 'market-orchestrator',
   '["ifr-world-robotics","a3-robot-statistics","eurostat-robot-adoption","un-comtrade-industrial-robots"]'::jsonb, 'SIMPLE', 'READY')
ON CONFLICT (agent_key) DO UPDATE SET
  display_name = EXCLUDED.display_name, description = EXCLUDED.description, cron_expression = EXCLUDED.cron_expression,
  source_keys = EXCLUDED.source_keys, task_complexity = EXCLUDED.task_complexity, implementation_status = EXCLUDED.implementation_status,
  updated_at = now();

UPDATE scheduled_agents
SET display_name = 'Market evidence orchestrator',
    description = 'Coordinates contracted official market-statistics collection, freshness and readiness. It never derives market share, funding or investment claims.',
    source_keys = '["ifr-world-robotics","a3-robot-statistics","eurostat-robot-adoption","un-comtrade-industrial-robots"]'::jsonb,
    implementation_status = 'READY', is_enabled = true, cron_expression = '0 8 * * 1', updated_at = now()
WHERE agent_key = 'market-orchestrator';
