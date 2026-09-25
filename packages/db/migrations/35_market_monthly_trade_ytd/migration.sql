-- Current-year monthly trade is a separate YTD measure, never an annual estimate.
INSERT INTO metric_definitions (key, display_name, description_en, formula_version, min_sources, min_observations, freshness_hours, publish_threshold)
VALUES
  ('industrial_robot_trade_exports_ytd', 'Industrial robot exports (reported YTD trade)', 'Sum of published monthly export values under HS 847950 from January through the latest reported month for each reporter. It is not an annual value.', 'un-comtrade-hs847950-monthly-ytd-v1', 1, 1, 2160, 0.70),
  ('industrial_robot_trade_imports_ytd', 'Industrial robot imports (reported YTD trade)', 'Sum of published monthly import values under HS 847950 from January through the latest reported month for each reporter. It is not an annual value.', 'un-comtrade-hs847950-monthly-ytd-v1', 1, 1, 2160, 0.70)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name, description_en = EXCLUDED.description_en, formula_version = EXCLUDED.formula_version,
  min_sources = EXCLUDED.min_sources, min_observations = EXCLUDED.min_observations, freshness_hours = EXCLUDED.freshness_hours,
  publish_threshold = EXCLUDED.publish_threshold;

UPDATE sources
SET admin_description = 'Authenticated UN Comtrade API for HS 847950. Retain released annual or monthly aggregate trade values and the declared reporting flag only. Current-year monthly values are published only as reported YTD trade, never as annual installations or market share.',
    public_description = 'Official cross-border trade statistics for HS 847950 industrial robots, including separately labelled reported YTD monthly trade.',
    updated_at = now()
WHERE key = 'un-comtrade-industrial-robots';

UPDATE source_contracts
SET allowed_fields = '["value_numeric","unit","period","reporter_code","flow","estimated","canonical_url","reported_months"]',
    publication_policy = 'Show annual or separately labelled reported-YTD HS 847950 trade with flow, country, source and period. Never label trade as installations, market share, or a full year when the period is YTD.',
    rate_limit_strategy = '16 authenticated requests weekly: four annual and up to 12 monthly, one second apart.',
    parser_version = 'market-stats-v5'
WHERE source_key = 'un-comtrade-industrial-robots';
