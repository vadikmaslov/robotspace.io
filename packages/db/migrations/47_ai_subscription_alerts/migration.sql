ALTER TABLE ai_budget_attempts ADD COLUMN billing_mode varchar(20) NOT NULL DEFAULT 'USD' CHECK (billing_mode IN ('USD','SUBSCRIPTION'));
ALTER TABLE ai_budget_attempts DROP CONSTRAINT ai_budget_attempts_reserved_micros_check;
ALTER TABLE ai_budget_attempts ADD CONSTRAINT ai_budget_attempts_reserved_micros_check CHECK (reserved_micros >= 0);
CREATE TABLE ai_admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key text NOT NULL UNIQUE,
  reason varchar(50) NOT NULL,
  state varchar(20) NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','SENDING','SENT')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error varchar(50)
);
CREATE INDEX ai_admin_alerts_delivery ON ai_admin_alerts(state,next_attempt_at);
