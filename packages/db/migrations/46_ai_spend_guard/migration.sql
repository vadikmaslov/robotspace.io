CREATE TABLE ai_budget_policy (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  daily_micros bigint NOT NULL CHECK (daily_micros BETWEEN 0 AND 1000000000),
  monthly_micros bigint NOT NULL CHECK (monthly_micros BETWEEN 0 AND 1000000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_budget_policy(id, daily_micros, monthly_micros) VALUES (1, 1000000, 10000000);
CREATE TABLE ai_budget_prices (
  model_id uuid PRIMARY KEY REFERENCES ai_models(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  input_per_million numeric(12,6) NOT NULL CHECK (input_per_million > 0),
  output_per_million numeric(12,6) NOT NULL CHECK (output_per_million > 0),
  source_url text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  CHECK (valid_until > verified_at)
);
CREATE TABLE ai_budget_attempts (
  id uuid PRIMARY KEY,
  model_id uuid NOT NULL,
  operation varchar(100) NOT NULL,
  state varchar(20) NOT NULL CHECK (state IN ('RESERVED','SUCCEEDED','REJECTED','UNCERTAIN')),
  reserved_micros bigint NOT NULL CHECK (reserved_micros > 0),
  charged_micros bigint NOT NULL CHECK (charged_micros >= 0),
  input_per_million numeric(12,6) NOT NULL,
  output_per_million numeric(12,6) NOT NULL,
  input_tokens bigint,
  output_tokens bigint,
  error_code varchar(50),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX ai_budget_attempts_date ON ai_budget_attempts(created_at);
CREATE INDEX ai_budget_attempts_unresolved ON ai_budget_attempts(state) WHERE state IN ('RESERVED','UNCERTAIN');
