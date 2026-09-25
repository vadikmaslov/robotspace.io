UPDATE scheduled_agents
SET implementation_status = 'READY', is_enabled = true, cron_expression = '5 */6 * * *',
    source_keys = '["techcrunch-robotics","hackaday-robotics","roboticstomorrow","techxplore-robotics","ieee-spectrum-robotics","robohub","robotics-automation-news","robotics-247","the-robot-report","robotsguide","humanoid-guide-news"]'::jsonb,
    description = 'Coordinates the Insights pipeline: collects permitted robotics-news metadata, removes duplicates and irrelevant items, creates original summaries, and links confirmed existing robots and brands as article mentions. News may provide context links but never overwrite verified robot or company facts.',
    updated_at = now()
WHERE agent_key = 'insights-orchestrator';

UPDATE scheduled_agents SET is_enabled = false, updated_at = now()
WHERE agent_key IN ('insights-metadata-collector', 'insights-summary-writer');
