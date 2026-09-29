-- GitHub snapshots are append-only observations. `checked_at` records a
-- successful or failed refresh even when the reported repository data did not
-- change, while `observed_at` remains the time the observation was first seen.
ALTER TABLE repository_snapshots
  ADD COLUMN checked_at timestamptz(6) NOT NULL DEFAULT now(),
  ADD COLUMN fingerprint varchar(64),
  ADD COLUMN error_code varchar(80),
  ADD COLUMN error_message varchar(500),
  ADD COLUMN rate_limit_reset_at timestamptz(6);

UPDATE repository_snapshots SET checked_at = observed_at;

CREATE INDEX repository_snapshots_project_checked
  ON repository_snapshots(project_id, checked_at DESC);
CREATE UNIQUE INDEX repository_snapshots_project_fingerprint
  ON repository_snapshots(project_id, fingerprint) WHERE fingerprint IS NOT NULL;

DO $$ BEGIN
  IF to_regclass('public.scheduled_agents') IS NOT NULL THEN
    INSERT INTO scheduled_agents (
      agent_key, display_name, description, cron_expression, is_enabled, run_mode,
      site_area, agent_role, source_keys, task_complexity, implementation_status
    ) VALUES (
      'registry-github-sync', 'Registry GitHub refresh',
      'Refreshes a small, prioritised set of published verified GitHub projects. It stores dated snapshots and failures, preserves the latest successful data during outages, and is gated by registry.sync.',
      '20 3 * * *', true, 'SCHEDULED',
      'SOFTWARE', 'COLLECTOR', '["github-api"]'::jsonb, 'SIMPLE', 'READY'
    )
    ON CONFLICT (agent_key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      cron_expression = EXCLUDED.cron_expression,
      source_keys = EXCLUDED.source_keys,
      task_complexity = EXCLUDED.task_complexity,
      implementation_status = EXCLUDED.implementation_status,
      updated_at = now();
  END IF;
END $$;
