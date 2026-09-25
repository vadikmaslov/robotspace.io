-- AI tables were originally created outside the numbered migration history.
-- Keep the statements idempotent so both a fresh staging database and an
-- existing developer database converge on the same schema.
CREATE TABLE IF NOT EXISTS ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_type VARCHAR(30) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  base_url VARCHAR(2000),
  enabled BOOLEAN DEFAULT true,
  request_timeout_ms INT DEFAULT 60000,
  health_status VARCHAR(20) DEFAULT 'UNKNOWN',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES ai_providers(id),
  api_key_plain text,
  last_4 VARCHAR(4),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES ai_providers(id),
  remote_model_id VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  enabled BOOLEAN DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, remote_model_id)
);

-- Existing values are converted by `pnpm ai:migrate-credentials` with the
-- deployment keyring present. The application no longer writes plaintext.
ALTER TABLE ai_provider_credentials
  ALTER COLUMN api_key_plain TYPE text;
