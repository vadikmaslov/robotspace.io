-- Durable registry and audit log for background agents.  The scheduler is a
-- worker process; the database is the source of truth for its configuration.
CREATE TABLE scheduled_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key varchar(100) NOT NULL UNIQUE,
  display_name varchar(255) NOT NULL,
  description text NOT NULL,
  cron_expression varchar(100),
  is_enabled boolean NOT NULL DEFAULT false,
  run_mode varchar(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (run_mode IN ('SCHEDULED', 'ONCE')),
  last_scheduled_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_state varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  level varchar(10) NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_run_logs_run_date ON agent_run_logs(agent_run_id, created_at);
CREATE UNIQUE INDEX uq_agent_runs_idempotency_key
  ON agent_runs(idempotency_key) WHERE idempotency_key IS NOT NULL;

INSERT INTO scheduled_agents (agent_key, display_name, description, cron_expression, is_enabled, run_mode)
VALUES
  ('unibot-catalog-sync', 'Unibot catalog sync', 'Downloads the Unibot catalog into the isolated Unibot cache. It never publishes robots or companies by itself.', '0 */6 * * *', true, 'SCHEDULED'),
  ('unibot-brand-import', 'Unibot brand import', 'One-time import of brand name, country, and logo from the Unibot cache. It never creates robot records.', NULL, false, 'ONCE')
ON CONFLICT (agent_key) DO NOTHING;
